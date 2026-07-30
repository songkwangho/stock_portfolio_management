// 4.5b차 — 과매매(overtrading): 매매 빈도가 높고 보유기간이 짧은 경향.
// 월평균 매매횟수 + 평균 보유일을 사실로 산출. 임계값은 미검증 임시값(Phase 4 백테스팅 대상).

// ⚠️ 임시 기준(미검증): 월 20회 초과 또는 평균 보유 5일 미만이면 flag.
const TRADES_PER_MONTH_HIGH = 20;
const SHORT_HOLD_DAYS = 5;

// 'YYYY-MM-DD' 배열의 개월 span (최소 1).
function monthSpan(dates) {
    if (dates.length === 0) return 1;
    const sorted = [...dates].sort();
    const ms = Date.parse(sorted[sorted.length - 1]) - Date.parse(sorted[0]);
    return Math.max(1, ms / (86400000 * 30.44));
}

export function overtrading(trades, roundtrips) {
    if (!trades || trades.length === 0) return { key: 'overtrading', available: false };
    const months = monthSpan(trades.map(t => t.tradedAt));
    const tradesPerMonth = Math.round((trades.length / months) * 10) / 10;
    const holdDays = roundtrips.map(r => r.holdingDays);
    const avgHoldingDays = holdDays.length
        ? Math.round((holdDays.reduce((s, d) => s + d, 0) / holdDays.length) * 10) / 10
        : null;
    return {
        key: 'overtrading',
        available: true,
        totalTrades: trades.length,
        months: Math.round(months * 10) / 10,
        tradesPerMonth,
        avgHoldingDays,
        thresholds: { tradesPerMonthHigh: TRADES_PER_MONTH_HIGH, shortHoldDays: SHORT_HOLD_DAYS, provisional: true },
        flag: tradesPerMonth > TRADES_PER_MONTH_HIGH || (avgHoldingDays != null && avgHoldingDays < SHORT_HOLD_DAYS),
    };
}
