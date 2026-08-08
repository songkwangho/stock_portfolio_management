import { describe, it, expect } from 'vitest';
import {
  ATTENTION_CONSTANTS, discComponent, moveComponent, unrealizedComponent, stakeComponent,
  scoreItem, rankAttention,
} from '@/server/domains/attention/score';

const C = ATTENTION_CONSTANTS;
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b) < eps).toBe(true);

// 후보 팩토리 — 기본은 '아무 일도 없는 종목'.
type Cand = {
  code: string; name?: string; held?: boolean;
  weightPct?: number | null; unrealizedPct?: number | null;
  ret5d?: number | null; volSurge?: number | null;
  discCount?: number; discLatestDaysAgo?: number | null; discCategories?: string[];
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

  it('미실현 — 캡(30%)·부호 무관. 보유 아니면 baseline, 보유인데 시세 없으면 0', () => {
    close(unrealizedComponent(15, true), 0.5);
    expect(unrealizedComponent(-45, true)).toBe(1);
    expect(unrealizedComponent(null, true)).toBe(0);        // 승격 전 종목 — 모르는 값을 점수화하지 않음
    expect(unrealizedComponent(null, false)).toBe(C.watchlistBaseline);
    expect(unrealizedComponent(99, false)).toBe(C.watchlistBaseline);
  });

  it('비중 — 캡(30%). 관심은 baseline, 0·null은 0', () => {
    close(stakeComponent(15, true), 0.5);
    expect(stakeComponent(50, true)).toBe(1);
    expect(stakeComponent(0, true)).toBe(0);
    expect(stakeComponent(null, true)).toBe(0);
    expect(stakeComponent(null, false)).toBe(C.watchlistBaseline);
  });

  it('공시 — 최신성 주도 + 건수 보조(건수 상한 3), 0건·날짜없음은 0', () => {
    expect(discComponent(0, 0)).toBe(0);
    expect(discComponent(3, null)).toBe(0);
    close(discComponent(5, 0), 1);                       // 오늘 · 상한 이상 건수 → 1
    close(discComponent(1, 0), 0.8);                     // 오늘 1건도 0.8 — 건수가 최신성을 지배하지 않음
    close(discComponent(1, 7), Math.exp(-1) * 0.8);      // 1주 경과 → 약 0.37배 감쇠
    expect(discComponent(2, 0)).toBeGreaterThan(discComponent(1, 0));
    expect(discComponent(1, 0)).toBeGreaterThan(discComponent(1, 3));
  });
});

describe('attention score — 곱 결합', () => {
  it('바닥값 — 전 컴포넌트 0이어도 0으로 붕괴하지 않는다(0.1^4)', () => {
    const { score, components } = scoreItem(cand({ code: 'A', held: true }));
    expect(components).toEqual({ disc: 0, move: 0, unrl: 0, stake: 0 });
    close(score, 0.0001);
  });

  it('상한 — 전 컴포넌트 1이면 1', () => {
    const { score } = scoreItem(cand({
      code: 'A', held: true, discCount: 5, discLatestDaysAgo: 0, ret5d: 20, unrealizedPct: 50, weightPct: 50,
    }));
    close(score, 1);
  });

  it('관심은 미실현·비중이 baseline이라 같은 사건에서도 보유보다 낮다', () => {
    const facts = { discCount: 1, discLatestDaysAgo: 0, ret5d: 10 };
    const hold = scoreItem(cand({ code: 'A', held: true, unrealizedPct: 40, weightPct: 40, ...facts }));
    const watch = scoreItem(cand({ code: 'A', held: false, ...facts }));
    expect(watch.score).toBeLessThan(hold.score);
    close(watch.components.unrl, C.watchlistBaseline);
    close(watch.components.stake, C.watchlistBaseline);
  });
});

describe('attention rank — 정렬·바닥 컷·상위 K·dedupe', () => {
  it('공시+급변+고비중이 조용한 고비중보다 위 — 조용한 쪽은 아예 컷', () => {
    const loud = cand({ code: '000001', held: true, discCount: 2, discLatestDaysAgo: 0, ret5d: 12, weightPct: 25, unrealizedPct: 10 });
    const quiet = cand({ code: '000002', held: true, ret5d: 0.3, weightPct: 40, unrealizedPct: 2 });
    const out = rankAttention([quiet, loud]);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['000001']);
  });

  it('관심 종목은 가격 현저성이 충분할 때만 노출된다', () => {
    const quietWatch = cand({ code: '000010', held: false, ret5d: 1 });
    const movedWatch = cand({ code: '000011', held: false, ret5d: 9 });
    const out = rankAttention([quietWatch, movedWatch]);
    expect(out.map((i: { code: string }) => i.code)).toEqual(['000011']);
    expect(out[0].source).toBe('watchlist');
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
      cand({ code: '000001', held: true, ret5d: 0.5, weightPct: 10, unrealizedPct: 1 }),
      cand({ code: '000002', held: false, ret5d: -0.8 }),
    ]);
    expect(out).toEqual([]);
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
