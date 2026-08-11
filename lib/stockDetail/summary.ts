// 종목 상세 결론 카드용 순수 함수 (3.12차 S1에서 page.tsx로부터 분리).
//
// N1~N4 — holding_opinion 판정 라벨 중립화:
//  - holding_opinion(매도/관망/추가매수/보유)은 서버 calculateHoldingOpinion의 런타임 파생값이고
//    라벨 자체가 방향 지시라 UI에 노출하지 않는다. describeHoldingState가 **위치 사실**로 되돌린다.
//  - 개인화 매수/매도 지시 금지(자본시장법·R2): "실제 매도는 증권사 앱에서", "손절할지 생각",
//    "추가 매수는 소액으로", "기다리는 것도 방법" 류를 전부 제거하고 **관찰 + 분석 안내**로만.
//  - 판단은 사용자에게 남기고, 재무·수급·차트 분석으로 안내한다.
import type { StockDetail, Holding, HoldingOpinion } from '@/types/stock';

// 더 깊은 분석으로 넘기는 한 줄. 방향 지시가 아니라 라우팅이다.
export const DEEPER_ANALYSIS_NUDGE = '이 종목의 재무·수급 분석을 다시 살펴볼까요?';

// ── holding_opinion → 5·20일 평균 가격 대비 위치를 초보자 말로 푼 중립 관찰 ──
//
// 서버 규칙(server/domains/analysis/scoring.js calculateHoldingOpinion)과의 대응 — 순서가 곧 의미다:
//   1) 손실 ≤ -7%              → '매도'  ※ 이평선과 무관하게 **먼저** 발동하므로 위치를 단정할 수 없다 → null
//   2) 5일·20일 평균 모두 아래   → '매도'
//   3) 5일 아래 · 20일 위        → '관망'
//   4) 5일 평균 +0~1% 구간       → '추가매수'  ← 평균선에 '붙어 있는' 상태. '둘 다 위'가 아니다
//   5) 그 외                     → '보유'  ⇒ 2·3·4에서 걸러졌으므로 5일 평균 +1% 초과가 보장된다
// smaAvailable === false면 위치를 말할 수 없다 → null (UI는 '분석 중' 표기를 쓴다).
//
// 반환은 **주어 없는 서술부**다. 주어를 '주가'로 고정해 종목명 끝 자음에 따른 조사(은/는) 이형태를 피한다.
// 정도표현(강한/약한 편)까지만 — 좋다/나쁘다·팔/사·기다려 금지.
export function describeHoldingState(
    ho: HoldingOpinion | undefined,
    lossRatePct: number | null,
    opts?: { smaAvailable?: boolean; subject?: string },
): string | null {
    if (!ho || opts?.smaAvailable === false) return null;

    let predicate: string;
    if (ho === '매도') {
        // 손절 규칙이 먼저 발동한 경우 — 이평선 위치를 알 수 없다. 손익 서술은 호출부가 담당한다.
        if (lossRatePct !== null && lossRatePct <= -7) return null;
        predicate = '5일·20일 평균 가격 아래에서 움직이고 있어요. 최근 흐름이 평소 평균보다 약한 편이에요.'
            + ` ${DEEPER_ANALYSIS_NUDGE}`;
    } else if (ho === '관망') {
        predicate = '5일 평균 가격 아래지만 20일 평균 가격 위에서 움직이고 있어요. 단기 흐름은 약한 편이지만 중기 흐름은 유지되고 있어요.';
    } else if (ho === '추가매수') {
        predicate = '5일 평균 가격 바로 위(1% 이내)에 붙어 있어요. 단기 평균 가격과 거의 같은 수준이에요.';
    } else {
        predicate = '5일 평균 가격보다 1% 이상 위에서 움직이고 있어요. 최근 흐름이 평소 평균보다 강한 편이에요.';
    }

    return opts?.subject ? `${opts.subject} 주가는 ${predicate}` : `주가가 ${predicate}`;
}

// 3.9차 — 결론 카드 한 줄 요약 생성 (순수 함수, 컴포넌트 외부).
// 보유 중이면 5·20일 평균 위치 관찰, 미보유면 market_opinion 중심.
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
        const lossRate = holdingMatch?.avgPrice && stock.price
            ? (stock.price - holdingMatch.avgPrice) / holdingMatch.avgPrice * 100
            : null;
        // 손절 규칙(-7%)로 상태가 정해진 경우 — 이평선 위치가 아니라 손익 사실이 핵심.
        if (ho === '매도' && lossRate !== null && lossRate <= -7) {
            return `${name} 주가가 내 매수가보다 ${Math.abs(lossRate).toFixed(1)}% 낮아요. ${DEEPER_ANALYSIS_NUDGE}`;
        }
        const state = describeHoldingState(ho, lossRate, {
            smaAvailable: holdingMatch?.sma_available,
            subject: name,
        });
        if (state) return state;
        // 이평선 데이터가 아직 없으면 위치를 말하지 않고 데이터 상태만 알린다.
        return `${name}의 이동평균 데이터를 모으는 중이에요. 5영업일 이상 쌓이면 평균 가격 대비 위치를 보여드려요.`;
    }

    // B1 — 목표가 괴리("목표가 대비 N% 낮아요")를 매수 신호처럼 제시하던 문장 제거.
    // 애널리스트 목표가는 타인의 전망이고, 괴리율을 결론 문장에 넣으면 "싸니까 사라"로 읽힌다.
    // 아래 관점별 풀이와 균형 요약이 재료를 제공하고, 종합은 사용자가 한다.
    // 주어를 '{종목명}의 지표는'으로 고정 — 종목명 끝 자음에 따른 조사 이형태(테스트은/삼성전자은)를 피한다.
    if (opinion === '긍정적') {
        return `${name}의 지표는 밸류에이션·기술지표·수급에서 우호적인 신호가 더 많은 편이에요. 아래 관점별 풀이를 함께 확인해보세요.`;
    }
    if (opinion === '부정적') {
        return `${name}의 지표는 비우호적인 신호가 더 많은 편이에요. 아래 관점별 풀이를 함께 확인해보세요.`;
    }
    return `${name}의 지표는 한쪽으로 쏠리지 않은 상태예요. 아래 관점별 풀이를 함께 확인해보세요.`;
}

// "지금 할 수 있는 것" — 전부 **분석 안내**다. 매수/매도 방향 지시·손절 설정·거래 실행 안내는 넣지 않는다.
// 상태별로 먼저 볼 곳만 달라진다(설명은 풍부하게, 방향은 배제).
// 탭 이름은 3.13 VIS-6 3탭 구조([요약]/[차트·지표]/[기업])와 일치시킨다 —
// 결론 카드는 [요약] 탭에 있어 예전 "아래 차트에서…" 안내는 VIS-6 이후 이미 어긋난 상태였다.
const G_MA = '[차트·지표] 탭에서 5일·20일 평균 가격과 주가 위치를 확인해보세요';
const G_MA20 = '[차트·지표] 탭에서 20일 평균 가격(중기 흐름)이 어디쯤인지 확인해보세요';
const G_FLOW = '[차트·지표] 탭 투자자별 매매동향에서 외국인·기관 흐름을 확인해보세요';
const G_FIN = '[기업] 탭에서 재무제표와 최근 공시로 회사 상황을 확인해보세요';
const G_WEIGHT = '내 포트폴리오에서 이 종목 비중이 한쪽으로 쏠려 있지 않은지 확인해보세요';
const G_WATCH = '관심 종목에 추가하면 가격 변화를 알림으로 받을 수 있어요';

export function generateActionGuide(stock: StockDetail, isHolding: boolean): string[] {
    if (isHolding) {
        const ho = stock.holding_opinion;
        // 흐름이 약한 편인 구간 — 왜 그런지(재무·수급)를 먼저 보게 한다.
        if (ho === '매도') return [G_FIN, G_FLOW, G_MA];
        // 단기는 약하고 중기는 유지 — 중기 평균 위치부터.
        if (ho === '관망') return [G_MA20, G_FLOW, G_FIN];
        return [G_MA, G_WEIGHT, G_FIN];
    }
    return [G_MA, G_FIN, G_WATCH];
}
