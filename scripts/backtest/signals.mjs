// Phase 4 — 시점 t 신호 재구성. **프로덕션과 같은 계산**을 쓴다(다른 걸 재면 무의미).
//
// 누수 차단(§4-1): 신호는 `series[0..i]` 접두 슬라이스로만 만든다. i+1 이후를 보는 경로가
// 하나라도 있으면 IC 전체가 무의미해지므로, 이 파일 밖에서는 미래 인덱스를 만지지 않는다.
import { computeTechnicalFromHistory, calculateTrendScore, computeSupplyDemandFromRows } from '../../server/domains/analysis/scoring.js';
import { smaAt } from './returns.mjs';
import { CONFIG } from './config.mjs';

/**
 * 세션 3 — 시점 t의 수급 점수. **≤ t 투자자 행만** 본다.
 *
 * 프로덕션(`calculateSupplyDemandScore`)은 `ORDER BY date DESC LIMIT 20`으로 최신 20행을
 * 가져와 `computeSupplyDemandFromRows`에 넘긴다. 여기서는 '최신'을 **시점 t 기준**으로
 * 다시 정의할 뿐, 계산 자체는 같은 순수 함수를 그대로 쓴다.
 *
 * @param investorAsc 종목의 투자자 이력(날짜 오름차순). 없으면 null 반환.
 * @returns { score:number|null, rowsUsed:number, reason:string|null }
 */
export function supplyAt(investorAsc, asOfDate) {
    const all = investorAsc || [];
    if (all.length === 0) return { score: null, rowsUsed: 0, reason: 'no_investor_data' };

    // ≤ t 필터 — 이 한 줄이 수급축의 누수 차단 지점이다.
    // date는 'YYYYMMDD' 고정폭이라 사전식 비교 = 시간순 비교.
    let end = all.length;
    while (end > 0 && all[end - 1].date > asOfDate) end--;

    const window = all.slice(Math.max(0, end - CONFIG.SUPPLY_LOOKBACK_ROWS), end);
    if (window.length < CONFIG.SUPPLY_MIN_ROWS) {
        return { score: null, rowsUsed: window.length, reason: 'insufficient_investor_rows' };
    }

    // 프로덕션 쿼리는 DESC(최신 우선) → 감쇠 가중치 0.8^i가 최신부터 붙는다. 뒤집어 넘긴다.
    const desc = [...window].reverse();
    return { score: computeSupplyDemandFromRows(desc).total, rowsUsed: desc.length, reason: null };
}

// series: 오름차순 [{date, price, open, high, low, volume}], i: 시점 t 인덱스.
// ctx.investor: 종목의 투자자 이력(날짜 오름차순) — 없으면 수급축은 null.
// → { technical, trend, supplyDemand, partialSum, detail }
export function signalsAt(series, i, ctx = {}) {
    // ⚠️ 접두 **전체**를 넘긴다. computeTechnicalFromHistory는 배열 길이에 의존한다
    //    (MACD 루프의 prices.length-20, EMA 시드 slice(0, period)) — 최근 46봉만 자르면
    //    프로덕션과 다른 값이 나온다.
    const technical = computeTechnicalFromHistory(series.slice(0, i + 1));

    // 프로덕션의 getSMA와 동일 정의(최근 N개 종가 평균을 Math.round). latestPrice = 시점 t 종가.
    const sma5 = smaAt(series, i, 5);
    const sma20 = smaAt(series, i, 20);
    const trend = calculateTrendScore(series[i].price, sma5, sma20);

    const supply = supplyAt(ctx.investor, series[i].date);

    return {
        technical: technical.total,
        trend: trend.total,
        // null이면 그 표본은 수급 IC에서만 빠진다(groupByDate가 비유한값을 거른다).
        // 0으로 채우지 않는다 — '데이터 없음'과 '순매수 없음'은 다른 사실이다.
        supplyDemand: supply.score,
        supplyRows: supply.rowsUsed,
        supplyReason: supply.reason,
        // 참고용 부분합 — **밸류·수급 제외**. MarketOpinion 7/4 컷 검증이 아니다(§5-3).
        // ⚠️ 세션3에서 수급축이 붙어도 정의를 바꾸지 않는다 — 세션1과 같은 이름의 다른
        //    숫자가 되면 두 세션 결과를 나란히 못 놓는다.
        partialSum: parseFloat((technical.total + trend.total).toFixed(2)),
        detail: { technical: technical.detail, trend: trend.detail, sma5, sma20 },
    };
}
