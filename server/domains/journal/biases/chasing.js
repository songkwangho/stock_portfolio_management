// 4.5b차 — 추격매수(chasing): 급등 직후에 매수하는 경향.
// 매수 시점 직전 N일 상승률을 stock_history에서 조회(가격조회 포트 주입 = E-repo 역할).
// 히스토리 없는 구간은 skip + coverage로 투명 처리. 임계값은 미검증 임시값.
//
// C-3 재프레이밍: chasingRatio 0/N은 버그가 아니라 '예상된 null'일 수 있음 — 평단 하향(하락 중 매수)
// 프로필에선 직전 N일 수익률이 음수라 "급등 직후 매수"가 0%로 나오는 게 정합. 운영자 스팟체크는
// stock_history 있는 1종목 손계산으로 '예상된 0' 확인(priceReader가 조용히 ~0 반환하는지 대조).
//
// priceReader(code, tradedAt, days) → 직전 days일 상승률(%) | null (데이터 부족)

const LOOKBACK_DAYS = 20;       // 직전 N일
const SURGE_PCT = 15;           // ⚠️ 임시(미검증): +15% 이상 급등 직후 매수를 '추격'으로 관찰

export async function chasing(trades, priceReader) {
    const buys = (trades || []).filter(t => t.side === 'buy');
    if (buys.length === 0) return { key: 'chasing', available: false };

    let evaluated = 0, chased = 0, skipped = 0;
    for (const b of buys) {
        const priorReturn = await priceReader(b.code, b.tradedAt, LOOKBACK_DAYS);
        if (priorReturn == null) { skipped++; continue; }
        evaluated++;
        if (priorReturn >= SURGE_PCT) chased++;
    }
    if (evaluated === 0) {
        return { key: 'chasing', available: false, coverage: { evaluated, skipped } };
    }
    return {
        key: 'chasing',
        available: true,
        chasedCount: chased,
        evaluatedCount: evaluated,
        chasingRatio: Math.round((chased / evaluated) * 1000) / 10,   // %
        coverage: { evaluated, skipped },
        thresholds: { lookbackDays: LOOKBACK_DAYS, surgePct: SURGE_PCT, provisional: true },
        flag: chased / evaluated >= 0.3,   // ⚠️ 임시: 평가 매수의 30% 이상이 급등 직후
    };
}
