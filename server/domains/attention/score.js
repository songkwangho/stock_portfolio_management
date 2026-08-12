// A차(주목 레이어 / 트리아지) — 현저성 점수. 순수 함수(DB·네트워크 의존 0) → 단위 테스트 대상.
//
// ─────────────────────────────────────────────────────────────
// R1 불변식 (변경 금지)
//  - '좋음/나쁨'이 아니라 **현저성**으로만 정렬한다. 절대 임계 라벨(위험/기회/우량) 금지.
//  - 방향(상승/하락)은 점수에 **넣지 않는다** — 크기(절대값)만 쓴다. 부호는 UI 색으로만.
//  - 네 컴포넌트(공시 · 가격변동 · 미실현변동 · 비중)를 각 0~1로 정규화한 뒤 결합한다.
// 임계·캡·가중치 상수는 전부 provisional(실증 검증 전, Phase 4 백테스팅 대상).
// ─────────────────────────────────────────────────────────────
//
// 단위 규약: 퍼센트는 전부 **퍼센트 수치**(3.2 = 3.2%)로 다룬다. 비율(0.032) 아님.
//
// ═══ 집계 형태: 곱(AND) → noisy-OR (2026-08-12 재설계) ═══════
//
// 이전: score = Π(0.1 + 0.9·c) — **논리곱** 의미론("모든 축이 어느 정도 있어야 점수가 산다,
// 한 축이 낮으면 전체를 누른다"). floor 0.1은 AND가 0으로 죽는 걸 막는 땜질이었고,
// 그 땜질이 "컴포넌트 0→최대 = 10배 스윙"을 만들어 **중요도 역전**을 낳았다.
//
//   실계좌 관찰: 유유제약(미실현 -14.75%, 12일 전 '기타' 공시 1건) 0.0431 = 1위
//               컴투스홀딩스(미실현 **-39.13%**, 비중 **63%**, 공시 없음) 0.0245 = 2위
//   → 잡공시 하나가 disc를 0→0.144로 올려 인자를 0.1→0.23(2.3배)로 키우고,
//     가장 확인이 필요한 포지션을 눌렀다.
//
// 트리아지가 원하는 의미론은 정반대인 **논리합(OR)**: 심하게 빠졌거나, 또는 크게 움직였거나,
// 또는 공시가 떴거나, 또는 큰 덩어리면 — 어느 하나만 강해도 상단.
//
//   score = 1 − Π(1 − w_k · c_k)      (noisy-OR)
//
// c=1인 단일 신호가 주는 점수 = 그 축의 가중치 w_k. [0,1] 경계·자연 캡.
//
// ⚠️ 이 OR 전환은 **attention 레이어 한정**이다. 7관점 균형 요약(quality 레이어)은
//    곱/균형이 맞다(한 축 독주 방지). 두 레이어의 집계 형태는 **반대여야** 한다 —
//    이번 결함은 attention이 quality용 균형-곱을 잘못 빌려온 것이다.

export const ATTENTION_CONSTANTS = {
    windowTradingDays: 5,   // 가격변동 창 = 5거래일 (운영자 결정)
    discLookbackDays: 14,   // 공시 집계 룩백(캘린더). 5거래일보다 넓게 잡고 최신성 감쇠로 자연 감쇠시킨다.
    discDecayDays: 7,       // exp(-days/7) — 1주 지난 공시는 약 0.37배
    discCountCap: 3,        // 건수 상한(다발 공시 종목 과대평가 방지)
    moveCapPct: 15,         // |5거래일 수익률| 캡
    unrealizedCapPct: 30,   // |미실현 수익률| 캡
    stakeCapPct: 30,        // 비중(%) 캡

    // ── noisy-OR 가중치 ──────────────────────────────────────
    // 의미: 그 축이 최대(c=1)일 때 단독으로 보장되는 점수.
    //   unrl  내 손익 — 단독으로도 상단이어야 하는 1순위
    //   stake 큰 덩어리는 단독으로도 주목 가치 (§4 결정: 크기 게이팅 없이 (A) 유지)
    //   move  시장 사건성, 중간
    //   disc  신뢰도·노이즈 최다 → 정보는 주되 단독 지배 금지
    weights: { unrl: 0.85, stake: 0.70, move: 0.45, disc: 0.25 },

    // ── 공시 카테고리 가중 (dartCategory.js의 category id) ────
    // "기타"(미분류)는 신호가치가 미상이라 감쇠시킨다 — 이번 역전의 직접 원인이 12일 전
    // '기타' 1건이었다. 소유상황·대량보유류는 적재 단계 NOISE_PATTERNS에서 이미 걸러진다.
    // ⚠️ earnings는 정기보고서(예정된 일정)와 실적발표(사건)가 한 카테고리에 섞여 있어
    //    중간값을 준다. 분리하려면 dartCategory.js의 표시 라벨까지 건드려야 해 보류.
    discCategoryWeights: {
        capital_increase: 1, capital_decrease: 1, dividend: 1, treasury: 1,
        merger: 1, clarification: 1, major: 1,
        earnings: 0.8,
        other: 0.4,
    },
    discCategoryWeightDefault: 0.4,   // 모르는 category id — '기타'와 같게 취급

    scoreFloor: 0.15,       // 이 아래는 '두드러진 변화 없음'으로 보고 노출하지 않는다
    topK: 5,
};
//
// scoreFloor 0.15 — noisy-OR 스케일의 초기값(provisional). 점수 분포가 곱 시절
// [0, 0.05]에서 [0, 0.96]로 바뀌었으므로 옛 0.006은 의미가 없다.
//
//   통과 경계 (실측 계산):
//     잡공시 단독 (기타 1건·12일 전, disc 0.058)      0.014   제외  ← 약신호는 못 넘는다
//     관심 · 5일 |5%|                                 0.150   경계  ← 관심 실질 문턱 ≈ ±5%
//     관심 · 5일 |9%|                                 0.270   노출
//     보유 · 비중 6.4% (조용)                          0.150   경계  ← 아래 ⚠️
//     보유 · 미실현 |30%|↑ 단독                        0.850   최상단
//
//   기존 곱 형태의 관심 문턱이 ≈±5.7%였으므로 관심 쪽 감도는 사실상 유지된다.
//
//   ⚠️ 성질 변화(의도된 것): **비중 6.4% 이상 보유 종목은 조용해도 항상 노출**된다.
//      w_stake=0.70이 "큰 덩어리는 단독으로도 주목 가치"를 뜻하기 때문이다(§4 (A)).
//      곱 시절엔 조용하면 통째로 컷됐다. 보유 수가 적으면 전부 뜨고, 많으면 topK=5가
//      시끄러운 쪽부터 고른다. 이 문턱을 올리려면 scoreFloor↑ 또는 w_stake↓ —
//      둘 다 관심 종목 문턱을 함께 밀어 올리므로 실데이터 관찰 후 조정한다.
//
// ⚠️ 관심 종목의 미실현·비중은 **0**이다(옛 watchlistBaseline 0.3 폐기).
//    곱에서 baseline은 감점(0.37배)이었지만 OR에서는 **가점**이라 부호가 뒤집힌다:
//    아무 일도 없는 관심 종목이 1−(1−0.85·0.3)(1−0.70·0.3) = **0.411**을 받아
//    실제 사건(잡공시 단독 0.014)보다 27배 높은 점수로 상위 K를 잠식한다.
//    OR에서 "증거 없음"은 0이어야 한다 — 모르는 것을 점수로 만들지 않는다(R1과 동일 원칙).

const clamp01 = (x) => (!Number.isFinite(x) ? 0 : x < 0 ? 0 : x > 1 ? 1 : x);
const finiteOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v, n) => (v == null ? null : Number(v.toFixed(n)));

// ── 공시: 카테고리 가중 × 최신성 감쇠, 건수 보조 ────────────────
// 최신성 주도(0.7) + 건수 보조(0.3). 순수 곱이면 오늘 나온 1건이 1/3로 깎여 '건수'가
// 최신성을 지배한다(취지 반대) → 블렌드.
export function categoryWeight(category, C = ATTENTION_CONSTANTS) {
    const w = C.discCategoryWeights?.[category];
    return Number.isFinite(w) ? w : C.discCategoryWeightDefault;
}

// events: [{ category, daysAgo }] — 룩백 안의 공시 전건.
// 종목의 공시 신호 = **가장 강한 한 건**(카테고리 가중 × 감쇠)이 주도 + 건수 보조.
// 카테고리 가중이 전부 1이면 옛 공식 exp(-최소경과일/7)·(0.7+0.3·min(n,3)/3)과 정확히 같다
// (즉 이 함수는 옛 동작의 일반화이지 다른 계산이 아니다).
export function discComponentFromEvents(events, C = ATTENTION_CONSTANTS) {
    const list = (events || []).filter(e => e && finiteOrNull(e.daysAgo) != null && e.daysAgo >= 0);
    if (list.length === 0) return 0;
    const strongest = Math.max(...list.map(e => categoryWeight(e.category, C) * Math.exp(-e.daysAgo / C.discDecayDays)));
    const volume = Math.min(list.length, C.discCountCap) / C.discCountCap;
    return clamp01(strongest * (0.7 + 0.3 * volume));
}

// 폴백 — 카테고리별 경과일을 모르고 건수·최신 경과일만 아는 경우.
// 카테고리 미상이므로 가중 1.0(=감쇠만)으로 본다. 모르는 것을 감점하지도, 부풀리지도 않는다.
export function discComponent(discCount, discLatestDaysAgo, C = ATTENTION_CONSTANTS) {
    const count = finiteOrNull(discCount) ?? 0;
    const days = finiteOrNull(discLatestDaysAgo);
    if (count <= 0 || days == null || days < 0) return 0;
    const recency = Math.exp(-days / C.discDecayDays);
    const volume = Math.min(count, C.discCountCap) / C.discCountCap;
    return clamp01(recency * (0.7 + 0.3 * volume));
}

// ── 5거래일 가격변동(부호 배제, 크기만) ────────────────────────
export function moveComponent(ret5d, C = ATTENTION_CONSTANTS) {
    const r = finiteOrNull(ret5d);
    if (r == null) return 0;
    return clamp01(Math.abs(r) / C.moveCapPct);
}

// ── 미실현 변동(보유만) ────────────────────────────────────────
// 관심은 포지션이 없어 이 축의 증거가 아예 없다 → 0(OR에서 '기여 없음').
// 보유인데 시세를 못 얻은 경우(승격 전 종목)도 0 — 모르는 것을 점수로 만들지 않는다.
export function unrealizedComponent(unrealizedPct, held, C = ATTENTION_CONSTANTS) {
    if (!held) return 0;
    const u = finiteOrNull(unrealizedPct);
    if (u == null) return 0;
    return clamp01(Math.abs(u) / C.unrealizedCapPct);
}

// ── 비중(보유만). 관심은 0 ─────────────────────────────────────
export function stakeComponent(weightPct, held, C = ATTENTION_CONSTANTS) {
    if (!held) return 0;
    const w = finiteOrNull(weightPct);
    if (w == null || w <= 0) return 0;
    return clamp01(w / C.stakeCapPct);
}

// candidate → { components, score }. candidate는 원시 사실만 담은 객체.
export function scoreItem(candidate, C = ATTENTION_CONSTANTS) {
    const held = candidate.held === true;
    // discEvents(카테고리+경과일)가 있으면 그쪽을 쓰고, 없으면 건수·최신 경과일 폴백.
    const events = Array.isArray(candidate.discEvents) ? candidate.discEvents : null;
    const components = {
        disc: events
            ? discComponentFromEvents(events, C)
            : discComponent(candidate.discCount, candidate.discLatestDaysAgo, C),
        move: moveComponent(candidate.ret5d, C),
        unrl: unrealizedComponent(candidate.unrealizedPct, held, C),
        stake: stakeComponent(candidate.weightPct, held, C),
    };
    // noisy-OR — 어느 한 축만 강해도 상단. 축이 늘어도 [0,1]을 벗어나지 않는다.
    const miss = Object.entries(components)
        .reduce((acc, [k, c]) => acc * (1 - (C.weights[k] ?? 0) * c), 1);
    return { components, score: round(1 - miss, 5) };
}

// candidates[] → 현저성 상위 K. 바닥(scoreFloor) 미달은 제외 → 조용한 날엔 적게/빈 배열.
// dedupe: 같은 코드가 보유·관심 양쪽에 있으면 **보유로 취급**(포지션이 있는 쪽이 정보량이 많다).
export function rankAttention(candidates, options = {}) {
    const C = { ...ATTENTION_CONSTANTS, ...(options.constants || {}) };

    const byCode = new Map();
    for (const c of candidates || []) {
        if (!c || !c.code) continue;
        const prev = byCode.get(c.code);
        if (!prev) { byCode.set(c.code, c); continue; }
        if (c.held === true && prev.held !== true) byCode.set(c.code, c);
    }

    const scored = [];
    for (const c of byCode.values()) {
        const { components, score } = scoreItem(c, C);
        scored.push({ ...c, held: c.held === true, source: c.held === true ? 'holding' : 'watchlist', components, score });
    }

    // 동점은 코드 오름차순으로 고정 — 렌더 순서가 호출마다 흔들리지 않게.
    return scored
        .filter(s => s.score >= C.scoreFloor)
        .sort((a, b) => (b.score - a.score) || a.code.localeCompare(b.code))
        .slice(0, C.topK);
}
