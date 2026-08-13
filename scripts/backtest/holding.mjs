// Phase 4 세션 2 — HoldingOpinion 상태 분류 + exit 정책 시뮬레이션. **순수 모듈** → 단위 테스트 대상.
//
// 왜 IC가 아닌가: HoldingOpinion은 연속 점수가 아니라 **범주 결정**이고 `avgPrice`(사용자 진입가)에
// 의존한다 → 종목 랭킹이 아니라 포지션별 결정이다. 그래서
//   Part A: MA-상태 → forward 분포 (진입가 무관)
//   Part B: 실제 규칙을 exit 트리거로 돌린 정책 시뮬 (진입가 의존)
// 로 나눠 잰다.
//
// ⚠️ 프로덕션 규칙을 **복제하지 않는다**. 프로덕션 파라미터에서는 `calculateHoldingOpinion`을
//    그대로 호출하고, θ 스윕 변종만 별도 구현한다. 그리고 변종이 프로덕션 파라미터에서
//    프로덕션 함수와 **같은 결정을 내는지** 테스트로 고정한다(세션 1 동치 테스트와 같은 규율).
import { calculateHoldingOpinion } from '../../server/domains/analysis/scoring.js';
import { smaAt } from './returns.mjs';
import { distributionStats } from './ic.mjs';

// ── Part A — MA-상태 분류 (진입가 무관) ─────────────────────────
//
// 규칙(scoring.js:273)의 SMA 분기와 대응:
//   doubleBreakdown        → '매도'    (price < sma5 && price < sma20)
//   shortBreachMidSupport  → '관망'    (price < sma5 && price >= sma20)
//   near5MA                → '추가매수' (sma5 <= price <= sma5×1.01)
//   aligned                → '보유'    (price > sma5 > sma20)
//   other                  → 나머지
//
// ⚠️ near5MA와 aligned은 겹칠 수 있다(정배열이면서 5일선 바로 위). 프로덕션 규칙의 **판정 순서**를
//    따라 근접을 먼저 본다 — 그래야 상태 라벨이 실제 '추가매수' 판정과 같은 집합이 된다.
export function classifyMaState(price, sma5, sma20) {
    if (!Number.isFinite(price) || !Number.isFinite(sma5)) return 'other';   // sma5 없으면 규칙도 '보유' 폴백
    if (Number.isFinite(sma20) && price < sma5 && price < sma20) return 'doubleBreakdown';
    if (Number.isFinite(sma20) && price < sma5 && price >= sma20) return 'shortBreachMidSupport';
    if (price >= sma5 && price <= sma5 * 1.01) return 'near5MA';
    if (Number.isFinite(sma20) && price > sma5 && sma5 > sma20) return 'aligned';
    return 'other';
}

export const MA_STATES = ['doubleBreakdown', 'shortBreachMidSupport', 'near5MA', 'aligned', 'other'];

// ── exit 결정 ───────────────────────────────────────────────────
//
// production 모드: `calculateHoldingOpinion(...) === '매도'` — 규칙 복제 0.
// variant 모드: θ·이중이탈 on/off를 바꿔 보는 스윕용. θ=-0.07 & dbd=true면 production과 동일해야 한다.
//
// 청산 사유는 규칙의 **판정 순서**대로 귀속한다(손절이 이중이탈보다 먼저 — scoring.js 동일).
function exitDecision(entry, price, sma5, sma20, opts) {
    const { stopThreshold, useDoubleBreakdown, useProductionRule } = opts;
    const lossRate = (price - entry) / entry;

    const sell = useProductionRule
        ? calculateHoldingOpinion(entry, price, sma5, sma20) === '매도'
        : variantSell(lossRate, price, sma5, sma20, stopThreshold, useDoubleBreakdown);
    if (!sell) return null;

    // 손절 문턱이 -Infinity면(이중이탈 단독 정책) 손절로 귀속되지 않는다.
    const stopHit = Number.isFinite(stopThreshold) && lossRate <= stopThreshold;
    return stopHit ? 'stop_loss' : 'double_breakdown';
}

function variantSell(lossRate, price, sma5, sma20, stopThreshold, useDoubleBreakdown) {
    if (Number.isFinite(stopThreshold) && lossRate <= stopThreshold) return true;
    if (!Number.isFinite(sma5)) return false;      // 프로덕션도 sma5 없으면 손절 외 판단 불가 → 보유
    if (useDoubleBreakdown && Number.isFinite(sma20) && price < sma5 && price < sma20) return true;
    return false;
}

// 변종 로직이 프로덕션 파라미터에서 프로덕션 함수와 같은 결정을 내는지 — 런타임에서도 쓸 수 있게 export.
export function variantMatchesProduction(entry, price, sma5, sma20) {
    const prod = calculateHoldingOpinion(entry, price, sma5, sma20) === '매도';
    const lossRate = (price - entry) / entry;
    return prod === variantSell(lossRate, price, sma5, sma20, -0.07, true);
}

// ── Part B — 정책 시뮬레이션 ────────────────────────────────────
//
// 누수 차단: exit 판정은 j 오름차순으로 진행하고 각 j에서 **≤ j만** 본다(price[j], sma5_j, sma20_j).
// i+1..i+N 스캔은 미래를 "보는" 게 아니라 순차 진행이다 — 미래 가격으로 exit를 결정하지 않는다.
//
// exitLagDays: 트리거 당일(0) 또는 다음 거래일(1) 종가로 청산. 지연분 종가가 없으면 표본 제외.
//   프로덕션은 어제 종가로 판정해 다음날 08:00 알림 → 실사용자는 최소 1일 지연이다.
//
// precomputed: { sma5: number[], sma20: number[] } — 런너가 종목별로 한 번만 만들어 넘긴다
//              (없으면 smaAt으로 즉석 계산. 두 경로가 같은 값을 내는지 테스트로 고정).
export function simulateHolding(series, i, n, opts = {}) {
    const {
        stopThreshold = -0.07,
        useDoubleBreakdown = true,
        useProductionRule = false,
        exitLagDays = 0,
        precomputed = null,
    } = opts;

    const s = series || [];
    if (!Number.isInteger(i) || i < 0 || i + n >= s.length) return { ok: false, reason: 'horizon_beyond_series' };
    const entry = s[i].price;
    if (!Number.isFinite(entry) || entry <= 0) return { ok: false, reason: 'entry_price_missing' };

    const exitAt = s[i + n].price;
    if (!Number.isFinite(exitAt) || exitAt <= 0) return { ok: false, reason: 'exit_price_missing' };
    const buyHold = exitAt / entry - 1;

    const sma5Of = (j) => (precomputed ? precomputed.sma5[j] : smaAt(s, j, 5));
    const sma20Of = (j) => (precomputed ? precomputed.sma20[j] : smaAt(s, j, 20));

    for (let j = i + 1; j <= i + n; j++) {
        const price = s[j].price;
        if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'path_price_missing' };

        const reason = exitDecision(entry, price, sma5Of(j), sma20Of(j), { stopThreshold, useDoubleBreakdown, useProductionRule });
        if (!reason) continue;

        // 트리거는 j에서 났고, 실제 청산은 j+lag 종가.
        const k = j + exitLagDays;
        if (k >= s.length) return { ok: false, reason: 'exit_lag_beyond_series' };
        const fill = s[k].price;
        if (!Number.isFinite(fill) || fill <= 0) return { ok: false, reason: 'exit_lag_price_missing' };
        return {
            ok: true, buyHold,
            policy: fill / entry - 1,
            exited: true, exitReason: reason,
            triggerDay: j - i, holdingDays: k - i,
            entryDate: s[i].date, exitDate: s[k].date,
        };
    }

    // 끝까지 '매도' 없음 → t+N 종가 청산(= 매수후보유와 동일)
    return {
        ok: true, buyHold, policy: buyHold,
        exited: false, exitReason: null,
        triggerDay: null, holdingDays: n,
        entryDate: s[i].date, exitDate: s[i + n].date,
    };
}

// 종목 시계열 → sma5/sma20 배열 미리 계산(런너 성능용). smaAt과 **같은 정의**여야 한다.
export function precomputeSmas(series) {
    const n = (series || []).length;
    const sma5 = new Array(n).fill(null);
    const sma20 = new Array(n).fill(null);
    for (let j = 0; j < n; j++) {
        sma5[j] = smaAt(series, j, 5);
        sma20[j] = smaAt(series, j, 20);
    }
    return { sma5, sma20 };
}

// 라벨별 분포 통계 — bucketStats와 **같은 distributionStats**를 쓴다(통계 정의 일원화).
export function labeledStats(rows, labelKey, valueKey, labels) {
    const order = labels || [...new Set((rows || []).map(r => r[labelKey]))].sort();
    return order.map(label => ({
        label,
        ...distributionStats((rows || []).filter(r => r[labelKey] === label).map(r => r[valueKey])),
    }));
}

// 쌍체(paired) 차이 — 같은 (종목, 진입일) 표본에서 정책 − 매수후보유.
// 표본이 중첩돼 있어(진입 그리드 5일 · 보유 최대 60일) t는 부풀려진다 → 리포트에 중첩 명시.
export function pairedDiff(rows) {
    const d = (rows || [])
        .filter(r => Number.isFinite(r.policy) && Number.isFinite(r.buyHold))
        .map(r => r.policy - r.buyHold);
    const stats = distributionStats(d);
    const tNaive = stats.std && stats.std > 0 && stats.n > 1 ? stats.mean / (stats.std / Math.sqrt(stats.n)) : null;
    return { ...stats, tNaive, betterRate: d.length ? d.filter(v => v > 0).length / d.length : null, sameRate: d.length ? d.filter(v => v === 0).length / d.length : null };
}
