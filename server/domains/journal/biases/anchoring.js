// 4.5b차 — 앵커링(anchoring): 매수가(본전) 근처에서 파는 경향(손익률 0 근처 청산 군집).
// 청산 손익률이 ±Y% 이내인 비율을 사실로 산출. 임계값은 미검증 임시값.

const NEAR_BREAKEVEN_PCT = 3;   // ⚠️ 임시(미검증): 손익률 ±3% 이내를 '본전 근처'로 관찰

export function anchoring(roundtrips) {
    const total = roundtrips.length;
    if (total === 0) return { key: 'anchoring', available: false };
    const near = roundtrips.filter(r => Math.abs(r.pnlRate) <= NEAR_BREAKEVEN_PCT).length;
    return {
        key: 'anchoring',
        available: true,
        nearBreakevenCount: near,
        total,
        anchoringRatio: Math.round((near / total) * 1000) / 10,   // %
        thresholds: { nearBreakevenPct: NEAR_BREAKEVEN_PCT, provisional: true },
        flag: near / total >= 0.4,   // ⚠️ 임시: 청산의 40% 이상이 본전 근처
    };
}
