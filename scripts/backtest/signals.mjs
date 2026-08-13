// Phase 4 — 시점 t 신호 재구성. **프로덕션과 같은 계산**을 쓴다(다른 걸 재면 무의미).
//
// 누수 차단(§4-1): 신호는 `series[0..i]` 접두 슬라이스로만 만든다. i+1 이후를 보는 경로가
// 하나라도 있으면 IC 전체가 무의미해지므로, 이 파일 밖에서는 미래 인덱스를 만지지 않는다.
import { computeTechnicalFromHistory, calculateTrendScore } from '../../server/domains/analysis/scoring.js';
import { smaAt } from './returns.mjs';

// series: 오름차순 [{date, price, open, high, low, volume}], i: 시점 t 인덱스.
// → { technical, trend, partialSum, detail }
export function signalsAt(series, i) {
    // ⚠️ 접두 **전체**를 넘긴다. computeTechnicalFromHistory는 배열 길이에 의존한다
    //    (MACD 루프의 prices.length-20, EMA 시드 slice(0, period)) — 최근 46봉만 자르면
    //    프로덕션과 다른 값이 나온다.
    const technical = computeTechnicalFromHistory(series.slice(0, i + 1));

    // 프로덕션의 getSMA와 동일 정의(최근 N개 종가 평균을 Math.round). latestPrice = 시점 t 종가.
    const sma5 = smaAt(series, i, 5);
    const sma20 = smaAt(series, i, 20);
    const trend = calculateTrendScore(series[i].price, sma5, sma20);

    return {
        technical: technical.total,
        trend: trend.total,
        // 참고용 부분합 — **밸류·수급 제외**. MarketOpinion 7/4 컷 검증이 아니다(§5-3).
        partialSum: parseFloat((technical.total + trend.total).toFixed(2)),
        detail: { technical: technical.detail, trend: trend.detail, sma5, sma20 },
    };
}
