// attention 사건성 프록시 — 시점 t 현저성 재구성. **순수 모듈** → 단위 테스트 대상.
//
// ⚠️ 이건 **예측 검증이 아니다.** 세션 1~3은 방향 예측(점수 vs 부호 있는 수익)을 쟀고 전부
//    무신호~역방향이었다. attention 현저성의 목적은 다르다 — 조언·예측이 아니라 "지금 볼 것"의
//    **트리아지**다. 그래서 target도 다르다: 부호 있는 수익이 아니라 **|forward return|**(사건 크기).
//
//    → 여기선 **양(+) IC가 좋은 결과**다(현저성↑ → |move|↑ = 트리아지 정상 작동).
//      세션 1~3과 정반대 해석이므로 리포트에 반드시 함께 적는다.
//
// ⚠️ 프로덕션 규칙을 **복제하지 않는다** — score.js·facts.js의 순수 함수를 그대로 호출하고
//    상수도 ATTENTION_CONSTANTS 그대로 쓴다(세션 1·2와 같은 규율).
import { scoreItem, ATTENTION_CONSTANTS } from '../../server/domains/attention/score.js';
import { computePriceStats, summarizeDisclosures, isoFromYmd, ymdOf, shiftIso } from '../../server/domains/attention/facts.js';

// 재구성 가능한 컴포넌트는 **시장 관찰분 2개뿐**이다:
//   move (|5거래일 수익률|)  ✅ stock_history
//   disc (공시 최신성×건수)   ⚠️ dart_disclosures 깊이에 의존
//   unrl (|미실현|) · stake (비중)  ❌ 사용자 포지션 의존 → **개념적으로 제외가 옳다**.
//      "이 종목이 얼마나 사건적인가"가 아니라 "나에게 얼마나 중요한가"라, 시장 이벤트
//      프록시에 넣으면 재는 대상이 섞인다. held:false로 두면 두 컴포넌트가 0을 반환한다.
export const OBSERVATION_ONLY = { held: false };

/**
 * 시점 t의 공시 룩백 슬라이스. **≤ t 상한이 누수 차단 지점이다.**
 *
 * 프로덕션(`attention/service.js`)은 `rcept_dt >= today - discLookbackDays`로 하한만 건다
 * (today가 곧 상한이라 필요가 없다). 백테스트에선 상한이 필수다.
 *
 * @param discAsc 종목의 공시 전건(rcept_dt 오름차순)
 * @param asOfYmd 시점 t ('YYYYMMDD')
 */
export function disclosuresAsOf(discAsc, asOfYmd, C = ATTENTION_CONSTANTS) {
    const all = discAsc || [];
    if (all.length === 0) return [];
    const fromYmd = ymdOf(shiftIso(isoFromYmd(asOfYmd), -C.discLookbackDays));
    // date는 'YYYYMMDD' 고정폭 → 사전식 비교 = 시간순 비교.
    return all.filter(r => r.rcept_dt >= fromYmd && r.rcept_dt <= asOfYmd);
}

/**
 * 시점 t의 관찰-only 현저성. unrl·stake는 held:false로 0이 되고 noisy-OR은 {move, disc}만 남는다.
 *
 * @param seriesPrefix 종목 시계열의 **≤ t 접두**([{price, volume}] 오름차순)
 * @param discAsc      종목 공시 전건(오름차순). null이면 disc=0
 * @param asOfYmd      시점 t
 * @returns { salience, moveOnly, discOnly, ret5d, discCount, components }
 */
export function attentionAt(seriesPrefix, discAsc, asOfYmd, C = ATTENTION_CONSTANTS) {
    // computePriceStats는 **뒤에서부터** 고정 개수만 본다(ret5d = 마지막 W+1, volSurge = 마지막 21).
    // 그래서 접두 길이에 의존하지 않는다 — computeTechnicalFromHistory(MACD 루프가 length에
    // 의존)와 다른 성질이라, 접두 전체를 넘겨도 꼬리만 넘겨도 같다(테스트로 고정).
    const stats = computePriceStats(seriesPrefix, C);
    const window = disclosuresAsOf(discAsc, asOfYmd, C);
    const summary = summarizeDisclosures(window, isoFromYmd(asOfYmd));

    const base = { ...OBSERVATION_ONLY, ret5d: stats.ret5d, discEvents: summary.events };

    const combined = scoreItem(base, C);
    // 컴포넌트 기여 분해 — 어느 축이 |move|를 더 잘 추적하는지 보려면 단독 점수가 필요하다.
    const moveOnly = scoreItem({ ...OBSERVATION_ONLY, ret5d: stats.ret5d, discEvents: [] }, C);
    const discOnly = scoreItem({ ...OBSERVATION_ONLY, ret5d: null, discEvents: summary.events }, C);

    return {
        salience: combined.score,
        moveOnly: moveOnly.score,
        discOnly: discOnly.score,
        components: combined.components,
        ret5d: stats.ret5d,
        volSurge: stats.volSurge,
        discCount: summary.count,
        discLatestDaysAgo: summary.latestDaysAgo,
    };
}

// target = |forward return|. 부호를 버리는 게 이 검증의 핵심이다 —
// "얼마나 크게 움직였나"(사건 크기)를 재지, "올랐나 내렸나"를 재지 않는다.
export function absTarget(ret) {
    return Number.isFinite(ret) ? Math.abs(ret) : null;
}
