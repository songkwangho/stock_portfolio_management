// Alert cooldown per type (in milliseconds)
//
// M4(a) — 목표가 파생 트리거 2종(target_near · undervalued)을 제거했다. 알림 5종 → 3종.
// 이유: 화면에서 목표가 표시를 전부 걷어낸 뒤(M2) 알림만 목표가로 발화하면, 사용자는 근거를
// 확인할 수 없는 매수/매도 신호를 받는다 — 가장 나쁜 조합이다. 애널리스트 목표가는 타인의
// 전망이고, 그 괴리를 알림으로 밀어 보내는 건 개인화 매매 신호에 해당한다(R2).
// 남은 3종은 전부 **내 종목의 이동평균 위치**라는 관찰 사실에 근거한다.
export const ALERT_COOLDOWNS = {
    sell_signal: 48 * 60 * 60 * 1000,  // 48h
    sma5_break: 24 * 60 * 60 * 1000,   // 24h
    sma5_touch: 24 * 60 * 60 * 1000,   // 24h
};

// Push 빈도 제어: 동일 device_id × 동일 종목 × 같은 날짜(KST) 알림 ≤ N건
const DAILY_ALERT_LIMIT_PER_STOCK = 2;

// 쿨다운 중복 체크 — holders/watchers 루프에서 공통으로 사용.
async function hasDuplicate(pool, device_id, code, type) {
    const cooldown = ALERT_COOLDOWNS[type] || 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - cooldown).toISOString();
    const { rows } = await pool.query(
        'SELECT 1 FROM alerts WHERE device_id = $1 AND code = $2 AND type = $3 AND created_at > $4',
        [device_id, code, type, cutoff]
    );
    return rows.length > 0;
}

// 일 N건 빈도 가드: 오늘(KST 기준) 동일 device_id × 동일 종목 알림이 N건 이상이면 신규 INSERT 스킵.
// PostgreSQL TIMESTAMPTZ → KST 날짜 변환: (created_at AT TIME ZONE 'Asia/Seoul')::date
async function dailyLimitReached(pool, device_id, code) {
    const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS cnt FROM alerts
        WHERE device_id = $1 AND code = $2
          AND (created_at AT TIME ZONE 'Asia/Seoul')::date
              = (NOW() AT TIME ZONE 'Asia/Seoul')::date
    `, [device_id, code]);
    return rows[0].cnt >= DAILY_ALERT_LIMIT_PER_STOCK;
}

// source: 'holding' | 'watchlist' — UI에서 알림 출처 뱃지로 표시 (14차 5-1).
async function insertAlert(pool, device_id, code, name, type, source, message) {
    await pool.query(
        'INSERT INTO alerts (device_id, code, name, type, source, message) VALUES ($1, $2, $3, $4, $5, $6)',
        [device_id, code, name, type, source, message]
    );
}

// M4(a) 이후 targetPrice는 쓰지 않는다 — 인자에서 제거했다(호출부도 함께 정리).
export async function generateAlerts(pool, code, name, price, sma5) {
    const { rows: holders } = await pool.query(
        'SELECT DISTINCT device_id FROM holding_stocks WHERE code = $1',
        [code]
    );
    const holderSet = new Set(holders.map(h => h.device_id));

    // sma20 선계산 (holders 루프 전체에서 재사용)
    const { rows: hist } = await pool.query(
        'SELECT price FROM stock_history WHERE code = $1 ORDER BY date DESC LIMIT 20',
        [code]
    );
    const sma20ForAlert = hist.length >= 20
        ? Math.round(hist.reduce((s, r) => s + Number(r.price), 0) / 20)
        : null;

    for (const device_id of holderSet) {
        // Holding alerts — 모든 메시지는 중립적·서술형 표현으로 작성한다 (앱스토어 심사 대비).
        // sma5_break(price < sma5)와 sma5_touch(±1% 지지)는 경계 조건에서 동시 발생할 수 있으므로
        // 우선순위: 이탈(부정적) > 지지(긍정적). break가 발생하면 touch는 발생시키지 않는다.
        if (sma5) {
            const broken = price < sma5;
            const touched = !broken && price >= sma5 * 0.99 && price <= sma5 * 1.01;

            if (broken && !(await hasDuplicate(pool, device_id, code, 'sma5_break')) && !(await dailyLimitReached(pool, device_id, code))) {
                await insertAlert(pool, device_id, code, name, 'sma5_break', 'holding',
                    `${name}(${code}) 주가가 5일 평균(${sma5.toLocaleString()}원) 아래로 내려갔어요.`
                );
            } else if (touched && !(await hasDuplicate(pool, device_id, code, 'sma5_touch')) && !(await dailyLimitReached(pool, device_id, code))) {
                await insertAlert(pool, device_id, code, name, 'sma5_touch', 'holding',
                    `${name}(${code}) 주가가 5일 평균(${sma5.toLocaleString()}원) 부근에서 지지받고 있어요.`
                );
            }
        }

        // sell_signal: 5MA + 20MA 이중 이탈 — 중립적 표현 ("주의가 필요해요")
        if (sma5 && sma20ForAlert && price < sma5 && price < sma20ForAlert
            && !(await hasDuplicate(pool, device_id, code, 'sell_signal'))
            && !(await dailyLimitReached(pool, device_id, code))) {
            await insertAlert(pool, device_id, code, name, 'sell_signal', 'holding',
                `${name}(${code}) 주가가 5일·20일 평균 모두 아래로 내려갔어요. 하락 추세이니 주의가 필요해요.`
            );
        }
    }

    // M4(a) — 목표가 기반 알림 블록 제거.
    //   target_near : price >= targetPrice * 0.95  (목표가 근접)
    //   undervalued : price <  targetPrice * 0.7   (목표가 대비 30% 이상 낮음)
    // 둘 다 애널리스트 목표가 괴리를 근거로 푸시하던 것이라 삭제했다.
    // 이 블록이 watchlist까지 훑던 유일한 경로였다 → 남은 3종은 보유 종목 전용이 됐다.
    // (기존 DB에 남은 target_near/undervalued 행은 서버가 지우지 않는다 — 운영자 수동 정리.)
}
