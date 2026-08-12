import { describe, it, expect } from 'vitest';
import {
  ATTENTION_CONSTANTS, discComponent, discComponentFromEvents, categoryWeight,
  moveComponent, unrealizedComponent, stakeComponent, scoreItem, rankAttention,
} from '@/server/domains/attention/score';

const C = ATTENTION_CONSTANTS;
const W = C.weights;
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b) < eps).toBe(true);

// 후보 팩토리 — 기본은 '아무 일도 없는 종목'.
type Ev = { category: string; daysAgo: number };
type Cand = {
  code: string; name?: string; held?: boolean;
  weightPct?: number | null; unrealizedPct?: number | null;
  ret5d?: number | null; volSurge?: number | null;
  discCount?: number; discLatestDaysAgo?: number | null; discCategories?: string[]; discEvents?: Ev[];
};
const cand = (over: Cand): Cand => ({
  name: over.code, held: false, weightPct: null, unrealizedPct: null,
  ret5d: null, volSurge: null, discCount: 0, discLatestDaysAgo: null, discCategories: [],
  ...over,
});

describe('attention score — 컴포넌트 정규화(R1: 크기만, 방향 배제)', () => {
  it('가격변동 — 캡(15%)에서 1, 부호 무관 대칭', () => {
    close(moveComponent(7.5), 0.5);
    expect(moveComponent(15)).toBe(1);
    expect(moveComponent(40)).toBe(1);
    expect(moveComponent(-40)).toBe(1);
    // 방향은 점수에 들어가지 않는다 — +8%와 -8%는 동일 현저성.
    expect(moveComponent(8)).toBe(moveComponent(-8));
    expect(moveComponent(null)).toBe(0);
    expect(moveComponent(NaN)).toBe(0);
  });

  it('미실현 — 캡(30%)·부호 무관. 관심·시세없음은 0', () => {
    close(unrealizedComponent(15, true), 0.5);
    expect(unrealizedComponent(-45, true)).toBe(1);
    expect(unrealizedComponent(null, true)).toBe(0);        // 승격 전 종목 — 모르는 값을 점수화하지 않음
    // OR 전환: 관심은 이 축의 **증거가 없다** → 0. (옛 baseline 0.3은 OR에서 가점이 돼 폐기)
    expect(unrealizedComponent(null, false)).toBe(0);
    expect(unrealizedComponent(99, false)).toBe(0);
  });

  it('비중 — 캡(30%). 관심·0·null은 0', () => {
    close(stakeComponent(15, true), 0.5);
    expect(stakeComponent(50, true)).toBe(1);
    expect(stakeComponent(0, true)).toBe(0);
    expect(stakeComponent(null, true)).toBe(0);
    expect(stakeComponent(null, false)).toBe(0);
    expect(stakeComponent(40, false)).toBe(0);
  });

  it('공시(폴백) — 최신성 주도 + 건수 보조(건수 상한 3), 0건·날짜없음은 0', () => {
    expect(discComponent(0, 0)).toBe(0);
    expect(discComponent(3, null)).toBe(0);
    close(discComponent(5, 0), 1);                       // 오늘 · 상한 이상 건수 → 1
    close(discComponent(1, 0), 0.8);                     // 오늘 1건도 0.8 — 건수가 최신성을 지배하지 않음
    close(discComponent(1, 7), Math.exp(-1) * 0.8);      // 1주 경과 → 약 0.37배 감쇠
    expect(discComponent(2, 0)).toBeGreaterThan(discComponent(1, 0));
    expect(discComponent(1, 0)).toBeGreaterThan(discComponent(1, 3));
  });
});

describe('attention score — 공시 카테고리 가중', () => {
  it('가중치가 1이면 옛 공식(감쇠×건수 블렌드)과 정확히 같다', () => {
    // 이 함수는 옛 동작의 **일반화**이지 다른 계산이 아니다 — 회귀 기준선으로 못 박는다.
    const evs = (n: number, d: number) => Array.from({ length: n }, () => ({ category: 'dividend', daysAgo: d }));
    for (const [n, d] of [[1, 0], [1, 7], [2, 3], [5, 12]] as [number, number][]) {
      close(discComponentFromEvents(evs(n, d)), discComponent(n, d));
    }
  });

  it("'기타'(미분류)는 감쇠된다 — 이번 역전의 직접 원인", () => {
    const other = discComponentFromEvents([{ category: 'other', daysAgo: 12 }]);
    const material = discComponentFromEvents([{ category: 'capital_increase', daysAgo: 12 }]);
    expect(other).toBeLessThan(material);
    close(other, material * C.discCategoryWeights.other);
    close(other, 0.4 * Math.exp(-12 / 7) * 0.8);   // 실계좌 유유제약 케이스: 0.144 → 0.058
  });

  it('모르는 category id는 기타와 같게 취급 — 조용히 1.0으로 부풀리지 않는다', () => {
    expect(categoryWeight('made_up_kind')).toBe(C.discCategoryWeightDefault);
    expect(categoryWeight(null)).toBe(C.discCategoryWeightDefault);
    expect(categoryWeight('dividend')).toBe(1);
  });

  it('가장 강한 한 건이 주도한다 — 잡공시 다발이 material 1건을 이기지 못한다', () => {
    const noisy = discComponentFromEvents(Array.from({ length: 8 }, (_, i) => ({ category: 'other', daysAgo: i })));
    const one = discComponentFromEvents([{ category: 'merger', daysAgo: 0 }]);
    expect(one).toBeGreaterThan(noisy);
  });

  it('빈·잘못된 이벤트는 0', () => {
    expect(discComponentFromEvents([])).toBe(0);
    expect(discComponentFromEvents(null)).toBe(0);
    expect(discComponentFromEvents([{ category: 'dividend', daysAgo: -3 }])).toBe(0);
    expect(discComponentFromEvents([null, undefined])).toBe(0);
  });

  it('scoreItem은 discEvents가 있으면 그쪽을, 없으면 건수 폴백을 쓴다', () => {
    const withEvents = scoreItem(cand({ code: 'A', held: true, discEvents: [{ category: 'other', daysAgo: 12 }] }));
    const fallback = scoreItem(cand({ code: 'A', held: true, discCount: 1, discLatestDaysAgo: 12 }));
    close(withEvents.components.disc, discComponentFromEvents([{ category: 'other', daysAgo: 12 }]));
    close(fallback.components.disc, discComponent(1, 12));
    expect(withEvents.components.disc).toBeLessThan(fallback.components.disc);
  });
});

describe('attention score — noisy-OR 결합', () => {
  it('전 컴포넌트 0이면 0 — 조용한 종목은 점수가 없다', () => {
    const { score, components } = scoreItem(cand({ code: 'A', held: true }));
    expect(components).toEqual({ disc: 0, move: 0, unrl: 0, stake: 0 });
    expect(score).toBe(0);
  });

  it('상한 — 전 컴포넌트 1이어도 1을 넘지 않는다', () => {
    const { score } = scoreItem(cand({
      code: 'A', held: true, discCount: 5, discLatestDaysAgo: 0, ret5d: 20, unrealizedPct: 50, weightPct: 50,
    }));
    // score는 5자리 반올림 → eps는 그보다 크게.
    close(score, 1 - (1 - W.disc) * (1 - W.move) * (1 - W.unrl) * (1 - W.stake), 1e-5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('단일 축이 최대면 그 축의 가중치만큼은 보장된다 (OR 의미론)', () => {
    close(scoreItem(cand({ code: 'A', held: true, unrealizedPct: -40 })).score, W.unrl);
    close(scoreItem(cand({ code: 'A', held: true, weightPct: 40 })).score, W.stake);
    close(scoreItem(cand({ code: 'A', held: true, ret5d: 30 })).score, W.move);
  });

  it('한 축이 0이어도 다른 축을 누르지 않는다 (곱 시절 역전의 원인)', () => {
    // 옛 곱에서는 disc=0이 인자를 0.1로 고정해 전체를 1/10로 눌렀다.
    const withDisc = scoreItem(cand({ code: 'A', held: true, unrealizedPct: -40, discCount: 1, discLatestDaysAgo: 0 }));
    const without = scoreItem(cand({ code: 'A', held: true, unrealizedPct: -40 }));
    expect(without.score).toBeGreaterThanOrEqual(W.unrl);
    expect(withDisc.score).toBeGreaterThan(without.score);
    // 공시가 붙어도 '없을 때의 10배'처럼 튀지 않는다.
    expect(withDisc.score / without.score).toBeLessThan(1.3);
  });

  it('관심은 미실현·비중 축이 비어 같은 사건에서도 보유보다 낮다', () => {
    const facts = { discCount: 1, discLatestDaysAgo: 0, ret5d: 10 };
    const hold = scoreItem(cand({ code: 'A', held: true, unrealizedPct: 40, weightPct: 40, ...facts }));
    const watch = scoreItem(cand({ code: 'A', held: false, ...facts }));
    expect(watch.score).toBeLessThan(hold.score);
    expect(watch.components.unrl).toBe(0);
    expect(watch.components.stake).toBe(0);
  });

  it('아무 일 없는 관심 종목은 0점 — baseline이 가점으로 뒤집히지 않는다', () => {
    // 회귀 방지: baseline 0.3을 OR에 그대로 두면 무사건 관심이 0.411을 받아
    // 실제 사건(잡공시 단독 ≈0.014)보다 27배 높은 점수로 상위 K를 잠식했다.
    const idle = scoreItem(cand({ code: 'A', held: false }));
    expect(idle.score).toBe(0);
    const oneQuietWatch = scoreItem(cand({ code: 'A', held: false, ret5d: 0.5 }));
    expect(oneQuietWatch.score).toBeLessThan(C.scoreFloor);
  });
});

describe('attention — 실계좌 역전 케이스 (§8 수용 기준 1·2)', () => {
  // 2026-08-12 라이브 관찰값. 곱 시절 점수: 유유 0.0431(1위) > 컴투스 0.0245(2위) > 딥노이드 0.0064.
  const comtus = cand({ code: '063080', name: '컴투스홀딩스', held: true, ret5d: -2.41, unrealizedPct: -39.13, weightPct: 63 });
  const deepnoid = cand({ code: '315640', name: '딥노이드', held: true, ret5d: 6.55, unrealizedPct: 33, weightPct: 1 });
  const yuyu = cand({
    code: '000220', name: '유유제약', held: true, ret5d: 4.1, unrealizedPct: -14.75, weightPct: 35,
    discEvents: [{ category: 'other', daysAgo: 12 }],
  });

  it('심한 손실+큰 비중이 12일 전 잡공시를 이긴다 (중요도 역전 해소)', () => {
    const out = rankAttention([yuyu, deepnoid, comtus]);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['063080', '315640', '000220']);
    const s = Object.fromEntries(out.map((i: { code: string; score: number }) => [i.code, i.score]));
    expect(s['063080']).toBeGreaterThan(s['000220']);
  });

  it('단일 강신호는 상단 진입, 단일 약신호는 미진입', () => {
    const strong = cand({ code: '000001', held: true, unrealizedPct: -30 });   // unrl 단독
    const weak = cand({ code: '000002', held: true, discEvents: [{ category: 'other', daysAgo: 12 }] });
    const out = rankAttention([strong, weak]);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['000001']);
    expect(scoreItem(weak).score).toBeLessThan(C.scoreFloor);
  });
});

describe('attention — 공시 다수 종목이 상위를 독점하지 않는다 (§8 수용 기준 4)', () => {
  // 실계좌엔 공시가 1건뿐이라 독점 스트레스 테스트가 불가능하다 → 합성 픽스처로 보강.
  it('공시만 잔뜩 있는 조용한 종목들이, 공시 없는 심각한 손실 포지션을 밀어내지 못한다', () => {
    const noisy = Array.from({ length: 4 }, (_, i) =>
      cand({
        code: `10000${i}`, held: true, weightPct: 4, unrealizedPct: 1, ret5d: 0.4,
        discEvents: Array.from({ length: 5 }, (_, j) => ({ category: 'other', daysAgo: j })),
      })
    );
    const hurting = cand({ code: '200000', held: true, unrealizedPct: -35, weightPct: 20 });
    const out = rankAttention([...noisy, hurting]);
    expect(out[0].code).toBe('200000');
  });

  it('material 공시가 다발이면 상위에 오른다 — 카테고리 가중이 공시를 죽이는 게 아니다', () => {
    const material = cand({
      code: '100000', held: true, weightPct: 5,
      discEvents: [{ category: 'capital_increase', daysAgo: 0 }, { category: 'merger', daysAgo: 1 }, { category: 'dividend', daysAgo: 2 }],
    });
    const quiet = cand({ code: '100001', held: true, weightPct: 5, ret5d: 0.2 });
    const out = rankAttention([material, quiet]);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['100000']);
  });
});

describe('attention rank — 정렬·바닥 컷·상위 K·dedupe', () => {
  it('공시+급변+고비중이 조용한 소액보다 위 — 조용한 소액은 아예 컷', () => {
    const loud = cand({ code: '000001', held: true, discCount: 2, discLatestDaysAgo: 0, ret5d: 12, weightPct: 25, unrealizedPct: 10 });
    const quiet = cand({ code: '000002', held: true, ret5d: 0.3, weightPct: 2, unrealizedPct: 1 });
    const out = rankAttention([quiet, loud]);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['000001']);
  });

  it('관심 종목은 가격 현저성이 충분할 때만 노출된다 (문턱 ≈ ±5%)', () => {
    const quietWatch = cand({ code: '000010', held: false, ret5d: 1 });
    const movedWatch = cand({ code: '000011', held: false, ret5d: 9 });
    const out = rankAttention([quietWatch, movedWatch]);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['000011']);
    expect(out[0].source).toBe('watchlist');
    // 문턱 자체를 못 박는다 — floor를 만지면 여기서 먼저 걸린다.
    expect(scoreItem(cand({ code: 'x', held: false, ret5d: 4 })).score).toBeLessThan(C.scoreFloor);
    expect(scoreItem(cand({ code: 'x', held: false, ret5d: 6 })).score).toBeGreaterThan(C.scoreFloor);
  });

  it('상위 K(5)만 반환하고 점수 내림차순 — 동점은 코드 오름차순', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      cand({ code: `00000${i}`, held: true, ret5d: 5 + i, weightPct: 30, unrealizedPct: 30, discCount: 1, discLatestDaysAgo: 0 })
    );
    const out = rankAttention(many);
    expect(out).toHaveLength(C.topK);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['000007', '000006', '000005', '000004', '000003']);
    const scores = out.map((i: { score: number }) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const tied = [
      cand({ code: '000200', held: true, ret5d: 10, weightPct: 30, unrealizedPct: 30 }),
      cand({ code: '000100', held: true, ret5d: 10, weightPct: 30, unrealizedPct: 30 }),
    ];
    expect(rankAttention(tied).map((i: { code: string }) => i.code)).toEqual(['000100', '000200']);
  });

  it('전부 바닥 미만이면 빈 배열 — 조용한 날엔 아무것도 띄우지 않는다', () => {
    const out = rankAttention([
      cand({ code: '000001', held: true, ret5d: 0.5, weightPct: 2, unrealizedPct: 1 }),
      cand({ code: '000002', held: false, ret5d: -0.8 }),
    ]);
    expect(out).toEqual([]);
  });

  it('⚠️ 성질 변화: 비중이 큰 보유는 조용해도 노출된다 (w_stake 단독 진입)', () => {
    // 곱 시절엔 조용하면 통째로 컷됐다. OR에서는 "큰 덩어리는 그 자체로 주목 대상"이
    // 설계 의도(§4 A)라 통과한다. 의도치 않게 바뀌지 않도록 문턱을 명시적으로 고정한다.
    const threshold = (C.scoreFloor / W.stake) * C.stakeCapPct;   // ≈ 6.43%
    expect(rankAttention([cand({ code: '000001', held: true, weightPct: threshold + 0.5 })])).toHaveLength(1);
    expect(rankAttention([cand({ code: '000001', held: true, weightPct: threshold - 0.5 })])).toHaveLength(0);
  });

  it('dedupe — 보유·관심 중복 코드는 보유로 취급(입력 순서 무관)', () => {
    const h = cand({ code: '005930', held: true, ret5d: 12, weightPct: 30, unrealizedPct: 30 });
    const w = cand({ code: '005930', held: false, ret5d: 12 });
    for (const input of [[h, w], [w, h]]) {
      const out = rankAttention(input);
      expect(out).toHaveLength(1);
      expect(out[0].source).toBe('holding');
      expect(out[0].held).toBe(true);
    }
  });

  it('빈 입력·잘못된 원소는 조용히 무시', () => {
    expect(rankAttention([])).toEqual([]);
    expect(rankAttention(null)).toEqual([]);
    expect(rankAttention([null, { name: '코드없음' }])).toEqual([]);
  });
});
