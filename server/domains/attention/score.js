// A차(주목 레이어 / 트리아지) — 현저성 점수. 순수 함수(DB·네트워크 의존 0) → 단위 테스트 대상.
//
// ─────────────────────────────────────────────────────────────
// R1 불변식 (변경 금지)
//  - '좋음/나쁨'이 아니라 **현저성**으로만 정렬한다. 절대 임계 라벨(위험/기회/우량) 금지.
//  - 방향(상승/하락)은 점수에 **넣지 않는다** — 크기(절대값)만 쓴다. 부호는 UI 색으로만.
//  - 네 컴포넌트(공시 최신성 · 가격변동 · 미실현변동 · 비중)를 각 0~1로 정규화 후 곱한다.
// 임계·캡 상수는 전부 provisional(실증 검증 전, Phase 4 백테스팅 대상).
// ─────────────────────────────────────────────────────────────
//
// 단위 규약: 퍼센트는 전부 **퍼센트 수치**(3.2 = 3.2%)로 다룬다. 비율(0.032) 아님.

export const ATTENTION_CONSTANTS = {
    windowTradingDays: 5,   // 가격변동 창 = 5거래일 (운영자 결정)
    discLookbackDays: 14,   // 공시 집계 룩백(캘린더). 5거래일보다 넓게 잡고 최신성 감쇠로 자연 감쇠시킨다.
    discDecayDays: 7,       // exp(-days/7) — 1주 지난 공시는 약 0.37배
    discCountCap: 3,        // 건수 상한(다발 공시 종목 과대평가 방지)
    moveCapPct: 15,         // |5거래일 수익률| 캡
    unrealizedCapPct: 30,   // |미실현 수익률| 캡
    stakeCapPct: 30,        // 비중(%) 캡
    watchlistBaseline: 0.3, // 관심 종목은 포지션이 없어 미실현·비중 개념 자체가 없음 → 중립 baseline
    floorFactor: 0.1,       // 곱 결합의 0-붕괴 방지 바닥값 (comp=0이어도 0.1은 남음)
    scoreFloor: 0.006,      // 이 아래는 '두드러진 변화 없음'으로 보고 노출하지 않는다
    topK: 5,
};
//
// scoreFloor — 지시문의 예시값 0.12에서 조정했다(곱 형태와 수치가 맞지 않음).
//   `Π(0.1 + 0.9·c)`에서 어떤 컴포넌트가 0이면 그 항은 0.1로 고정된다. 따라서
//     · 공시 없는 **보유**의 이론 최대 = 0.1 × 1 × 1 × 1        = 0.1
//     · 공시 없는 **관심**의 이론 최대 = 0.1 × 1 × 0.37 × 0.37  = 0.0137  (baseline 0.3 → 0.37 두 항)
//   → 0.12를 쓰면 사실상 '공시 필수' 필터가 되고, 0.02를 써도 관심 종목은 영구 미노출이다.
//     DART 적재가 아직 운영 대기라(CLAUDE.md 4.5a ⚠️) 그 경우 블록이 상시 빈 상태가 된다.
//
//   0.006의 통과 경계(전부 공시 0건 가정, provisional):
//     보유 · 조용(비중10%·미실현3%·5일 1%)          0.0012  제외
//     관심 · 조용(5일 1%)                            0.0022  제외
//     관심 · 5일 |6%|                                0.0063  노출  ← 관심의 실질 문턱 ≈ ±5.7%
//     보유 · 5일 |8%| + 비중20% + 미실현15%          0.0223  노출
//     보유 · 공시 2건(오늘)+5일 12%+비중25%+미실현10%  0.2537  최상단  (공시가 있으면 자릿수가 달라진다)
//   실데이터로 튜닝할 첫 번째 상수다.

const clamp01 = (x) => (!Number.isFinite(x) ? 0 : x < 0 ? 0 : x > 1 ? 1 : x);
const finiteOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v, n) => (v == null ? null : Number(v.toFixed(n)));

// ── 공시 최신성 × 건수 ─────────────────────────────────────────
// 지시문의 "exp(-d/7) × min(count,3)/3 블렌드(건수 과대 방지)"를 **블렌드**로 구현한다.
// 순수 곱이면 오늘 나온 공시 1건이 1/3로 깎여 오히려 '건수'가 최신성을 지배한다(취지 반대).
// → 최신성 주도(0.7) + 건수 보조(0.3)의 가중 블렌드.
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

// ── 미실현 변동(보유만). 관심은 포지션이 없어 baseline ──────────
// 보유인데 시세를 못 얻은 경우(승격 전 종목)는 0 — 모르는 것을 점수로 만들지 않는다.
export function unrealizedComponent(unrealizedPct, held, C = ATTENTION_CONSTANTS) {
    if (!held) return C.watchlistBaseline;
    const u = finiteOrNull(unrealizedPct);
    if (u == null) return 0;
    return clamp01(Math.abs(u) / C.unrealizedCapPct);
}

// ── 비중(보유만). 관심은 baseline ──────────────────────────────
export function stakeComponent(weightPct, held, C = ATTENTION_CONSTANTS) {
    if (!held) return C.watchlistBaseline;
    const w = finiteOrNull(weightPct);
    if (w == null || w <= 0) return 0;
    return clamp01(w / C.stakeCapPct);
}

// candidate → { components, score }. candidate는 원시 사실만 담은 객체.
export function scoreItem(candidate, C = ATTENTION_CONSTANTS) {
    const held = candidate.held === true;
    const components = {
        disc: discComponent(candidate.discCount, candidate.discLatestDaysAgo, C),
        move: moveComponent(candidate.ret5d, C),
        unrl: unrealizedComponent(candidate.unrealizedPct, held, C),
        stake: stakeComponent(candidate.weightPct, held, C),
    };
    const score = Object.values(components)
        .reduce((acc, c) => acc * (C.floorFactor + (1 - C.floorFactor) * c), 1);
    return { components, score: round(score, 5) };
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
