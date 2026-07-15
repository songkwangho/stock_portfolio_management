// 종목 상세 결론 카드용 순수 함수 (3.12차 S1에서 page.tsx로부터 분리).
// 본문은 원본과 동일 — 이동만. 로직/문구 변경 없음.
import type { StockDetail, Holding } from '@/types/stock';

// 3.9차 — 결론 카드 한 줄 요약 생성 (순수 함수, 컴포넌트 외부).
// 보유 중이면 holding_opinion 중심, 미보유면 market_opinion 중심.
// 명령형("~하세요") 금지 — 권유형("~해보세요") 표현으로만 작성.
export function generateStockSummary(
    stock: StockDetail,
    isHolding: boolean,
    holdingMatch?: Holding,
): string {
    const name = stock.name;
    const opinion = stock.market_opinion;
    const ho = stock.holding_opinion;

    if (isHolding && ho) {
        if (ho === '매도') {
            const lossRate = holdingMatch?.avgPrice && stock.price
                ? ((stock.price - holdingMatch.avgPrice) / holdingMatch.avgPrice * 100).toFixed(1)
                : null;
            if (lossRate && parseFloat(lossRate) <= -7) {
                return `${name}은 현재 매수가 대비 ${lossRate}% 손실 중이에요. 하락 추세가 이어지고 있어요.`;
            }
            return `${name}은 단기·중기 이평선 모두 아래로 내려갔어요. 하락 추세 신호예요.`;
        }
        if (ho === '관망') {
            return `${name}은 단기 흐름이 꺾였지만 중기 지지선은 유지 중이에요. 잠시 관망할 구간이에요.`;
        }
        if (ho === '추가매수') {
            return `${name}은 5일 평균선 근처에서 지지받고 있어요. 상승 추세는 유지 중이에요.`;
        }
        return `${name}은 단기·중기 이평선 정배열로 상승 흐름이 이어지고 있어요.`;
    }

    if (opinion === '긍정적') {
        const upside = stock.targetPrice && stock.price
            ? Math.round((stock.targetPrice - stock.price) / stock.price * 100)
            : null;
        if (upside && upside > 0) {
            return `${name}은 지표상 긍정적인 신호예요. 애널리스트 목표가 대비 현재가가 약 ${upside}% 낮아요.`;
        }
        return `${name}은 밸류에이션·기술지표·수급 종합 분석에서 긍정적인 신호가 나타나고 있어요.`;
    }
    if (opinion === '부정적') {
        return `${name}은 현재 지표상 주의가 필요한 상태예요. 분석 내용을 꼼꼼히 확인해보세요.`;
    }
    return `${name}은 현재 긍정도 부정도 아닌 중립적인 상태예요. 추세를 지켜보세요.`;
}

export function generateActionGuide(stock: StockDetail, isHolding: boolean): string[] {
    const ho = stock.holding_opinion;
    const opinion = stock.market_opinion;

    if (isHolding && ho === '매도') {
        return [
            '아래 차트에서 최근 이평선 위치를 확인해보세요',
            '손실 허용 범위를 스스로 생각해보세요 (예: "10% 이상 손실이면 정리")',
            '결정했다면 실제 매도는 증권사 앱(토스증권, 키움 등)에서 직접 진행해 주세요',
        ];
    }
    if (isHolding && ho === '관망') {
        return [
            '아래 차트에서 20일 평균선(노란선)이 지지하는지 확인해보세요',
            '추가 하락 시 어디서 손절할지 미리 생각해두세요',
            '급격한 변화가 없다면 다음 업데이트까지 지켜보세요',
        ];
    }
    if (isHolding && ho === '추가매수') {
        return [
            '현재 포트폴리오에서 이 종목 비중을 확인해보세요 (50% 이상이면 분산 권장)',
            '추가 매수는 소액으로 신중하게 고려해보세요',
            '실제 매수는 증권사 앱에서 직접 진행해 주세요',
        ];
    }
    if (isHolding) {
        return [
            '현재 상승 흐름을 유지 중이에요. 정기적으로 확인해보세요',
            '목표 수익에 도달하면 일부 매도도 고려해볼 수 있어요',
        ];
    }

    if (opinion === '긍정적') {
        return [
            '아래 차트와 기술지표를 확인해서 지금 타이밍이 맞는지 생각해보세요',
            '관심 종목에 추가하고 알림을 설정하면 변화를 놓치지 않아요',
            '투자하기로 했다면 포트폴리오에 추가하고 증권사 앱에서 매수하세요',
        ];
    }
    if (opinion === '부정적') {
        return [
            '현재는 지표상 좋지 않은 신호예요. 관심 종목에 추가하고 상황을 지켜보세요',
            '지금 바로 투자하기보다 추세가 바뀔 때까지 기다리는 것도 방법이에요',
        ];
    }
    return [
        '관심 종목에 추가해서 가격 변화를 알림으로 받아보세요',
        '추천 페이지에서 더 좋은 타이밍의 종목을 찾아볼 수도 있어요',
    ];
}
