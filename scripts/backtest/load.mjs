// Phase 4 — stock_history 로드 + 유니버스 필터. DB 읽기 전용.
import pool from '../../server/db/connection.js';
import { CONFIG } from './config.mjs';

// 유니버스: stock_history 행수 ≥ MIN_HISTORY.
// 제외되는 종목은 신규상장·최근 확대적재분이라 전진 누적만 있다 — 과거 시점 t가 없어
// point-in-time 재구성이 불가능하다(억지로 넣으면 표본이 최근으로 쏠린다).
export async function loadUniverse() {
    const { rows } = await pool.query(
        `SELECT h.code, s.name, COUNT(*)::int AS rows
         FROM stock_history h LEFT JOIN stocks s ON s.code = h.code
         GROUP BY h.code, s.name
         ORDER BY h.code`
    );
    const all = rows.map(r => ({ code: r.code, name: r.name || r.code, rows: r.rows }));
    return {
        universe: all.filter(r => r.rows >= CONFIG.MIN_HISTORY),
        excluded: all.filter(r => r.rows < CONFIG.MIN_HISTORY),
    };
}

// 종목별 오름차순 시계열. date는 TEXT 'YYYYMMDD'(고정폭) → 사전식 = 시간순.
// 0·결측 가격 행은 제외하고 카운트한다(수익률 분모가 되면 Infinity가 새어 나간다).
export async function loadSeries(codes) {
    const params = [codes];
    let where = 'code = ANY($1)';
    if (CONFIG.PERIOD.start) { params.push(CONFIG.PERIOD.start); where += ` AND date >= $${params.length}`; }
    if (CONFIG.PERIOD.end) { params.push(CONFIG.PERIOD.end); where += ` AND date <= $${params.length}`; }

    const { rows } = await pool.query(
        `SELECT code, date, price, open, high, low, volume
         FROM stock_history WHERE ${where} ORDER BY code, date ASC`,
        params
    );

    const byCode = new Map();
    let dropped = 0;
    for (const r of rows) {
        const price = Number(r.price);
        if (!Number.isFinite(price) || price <= 0) { dropped++; continue; }
        if (!byCode.has(r.code)) byCode.set(r.code, []);
        byCode.get(r.code).push({
            date: r.date,
            price,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            volume: Number(r.volume),
        });
    }
    return { byCode, dropped, totalRows: rows.length };
}

// 세션 3 — 투자자 순매매 이력. 종목별 **날짜 오름차순**으로 돌려주고, 시점 t 슬라이스는
// signals.mjs가 만든다(여기서 자르면 누수 차단 지점이 두 곳으로 갈라진다).
//
// 미적재 상태(backfill 전)가 정상 경로다 — 빈 Map을 돌려주면 수급 표본이 0이 되고
// 나머지 축은 그대로 나온다.
export async function loadInvestorHistory(codes) {
    try {
        const { rows } = await pool.query(
            `SELECT code, date, institution, foreign_net
             FROM investor_history WHERE code = ANY($1) ORDER BY code, date ASC`,
            [codes]
        );
        const byCode = new Map();
        for (const r of rows) {
            const institution = Number(r.institution);
            const foreign_net = Number(r.foreign_net);
            // 두 값 모두 결측이면 부호 판정이 불가능하다 → 행 자체를 버린다(0으로 채우면
            // '순매도'로 읽혀 점수가 내려간다 — 없는 정보를 신호로 바꾸는 짓이다).
            if (!Number.isFinite(institution) && !Number.isFinite(foreign_net)) continue;
            if (!byCode.has(r.code)) byCode.set(r.code, []);
            byCode.get(r.code).push({
                date: String(r.date),
                institution: Number.isFinite(institution) ? institution : 0,
                foreign_net: Number.isFinite(foreign_net) ? foreign_net : 0,
            });
        }
        return { byCode, totalRows: rows.length, codesWithData: byCode.size };
    } catch (e) {
        console.warn(`  [투자자] 로드 실패 — 수급축을 건너뜁니다: ${e.message}`);
        return { byCode: new Map(), totalRows: 0, codesWithData: 0 };
    }
}

// 벤치마크(KOSPI) 종가 — 초과수익용. 테이블이 비어 있으면 null을 돌려 호출부가 skip한다.
// (sync-index-history.js는 운영자 수동 실행이라 미적재 상태가 정상 경로다.)
export async function loadBenchmark(symbol) {
    try {
        const { rows } = await pool.query(
            'SELECT date, close FROM market_index_history WHERE symbol = $1 ORDER BY date ASC',
            [symbol]
        );
        if (rows.length === 0) return null;
        const m = new Map();
        for (const r of rows) {
            const c = Number(r.close);
            // market_index_history.date는 DATE 타입일 수 있다 → 'YYYYMMDD'로 정규화해
            // stock_history의 TEXT 키와 맞춘다(안 맞추면 전 표본이 조용히 bench_missing이 된다).
            const key = String(r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date).replace(/-/g, '').slice(0, 8);
            if (Number.isFinite(c) && c > 0) m.set(key, c);
        }
        return m;
    } catch (e) {
        console.warn(`  [benchmark] 로드 실패 — 초과수익 IC는 건너뜁니다: ${e.message}`);
        return null;
    }
}

// 세션 2 — 액면분할·무상증자 등 **무수정 종가를 기계적으로 튀게 하는** 공시 날짜.
//
// 왜 필요한가: stock_history.price는 수정주가가 아니다(액면분할·배당 미조정). 2:1 분할은
// 하루에 -50%로 보이고, 그러면 **-7% 손절이 거짓 발동**한다 — Part B의 결론을 통째로 오염시킨다.
//
// category(파생 필드) 대신 report_nm을 직접 매칭한다. dartCategory 규칙은 '주식분할결정'을
// merger로 넣는데(키워드 '분할'), 그 카테고리엔 합병·영업양수도 섞여 있어 정밀하지 않다.
const SPLIT_EVENT_PATTERNS = ['주식분할', '액면분할', '주식병합', '액면병합', '무상증자', '주식배당'];

export async function loadCorporateActions(codes) {
    try {
        const { rows } = await pool.query(
            `SELECT code, rcept_dt, report_nm FROM dart_disclosures
             WHERE code = ANY($1) AND (${SPLIT_EVENT_PATTERNS.map((_, k) => `report_nm LIKE $${k + 2}`).join(' OR ')})`,
            [codes, ...SPLIT_EVENT_PATTERNS.map(p => `%${p}%`)]
        );
        const byCode = new Map();
        for (const r of rows) {
            if (!byCode.has(r.code)) byCode.set(r.code, new Set());
            byCode.get(r.code).add(String(r.rcept_dt).replace(/-/g, '').slice(0, 8));
        }
        return { byCode, events: rows.length, codesAffected: byCode.size, available: true };
    } catch (e) {
        // dart_disclosures 미적재·스키마 부재는 정상 경로 — 단일일 급락 휴리스틱만 남는다.
        console.warn(`  [분할 스크리닝] 공시 조회 실패 — 급락 휴리스틱만 사용: ${e.message}`);
        return { byCode: new Map(), events: 0, codesAffected: 0, available: false };
    }
}

export async function closePool() {
    try { await pool.end(); } catch { /* ignore */ }
}
