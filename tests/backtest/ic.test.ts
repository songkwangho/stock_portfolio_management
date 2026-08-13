import { describe, it, expect } from 'vitest';
import {
  spearman, rankWithTies, computeIC, bucketStats, benjaminiHochberg, neweyWestSE, overlapLag, quantile,
} from '@/scripts/backtest/ic.mjs';

// IC 계산이 틀리면 백테스트 결론 전체가 틀린다. 알려진 정답으로 고정한다.

describe('Spearman Rank IC', () => {
  it('완전 단조 증가 → 1, 완전 역상관 → -1', () => {
    const x = [1, 2, 3, 4, 5];
    expect(spearman(x, [10, 20, 30, 40, 50])).toBeCloseTo(1, 10);
    expect(spearman(x, [50, 40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it('순위 상관이라 단조 변환에 불변 (선형 상관과 다른 점)', () => {
    const x = [1, 2, 3, 4, 5];
    expect(spearman(x, [1, 4, 9, 16, 25])).toBeCloseTo(1, 10);   // 제곱해도 순위는 그대로
    expect(spearman(x, [1, 100, 101, 102, 1000])).toBeCloseTo(1, 10);
  });

  it('동순위는 평균 랭크로 처리한다', () => {
    expect(rankWithTies([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(rankWithTies([5, 5, 5])).toEqual([2, 2, 2]);
  });

  it('한쪽이 상수면 상관 정의 불가 → null (0으로 뭉개지 않는다)', () => {
    expect(spearman([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(spearman([1, 2, 3, 4], [7, 7, 7, 7])).toBeNull();
  });

  it('표본 3개 미만·길이 불일치는 null', () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 2, 3], [1, 2])).toBeNull();
    expect(spearman(null, null)).toBeNull();
  });

  it('무상관 난수는 0 근처', () => {
    let s = 12345 >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const a = Array.from({ length: 500 }, () => rnd());
    const b = Array.from({ length: 500 }, () => rnd());
    expect(Math.abs(spearman(a, b)!)).toBeLessThan(0.15);
  });
});

describe('computeIC — 날짜별 횡단면 → 시계열 평균', () => {
  // 날짜별로 완전 단조인 관측을 만들면 각 날 IC=1, 평균도 1.
  const perfectDays = Array.from({ length: 20 }, (_, d) => ({
    date: `2026010${d}`.slice(0, 8),
    values: Array.from({ length: 12 }, (_, k) => ({ score: k, ret: k * 0.01 })),
  }));

  it('매일 완전 상관이면 평균 IC = 1, 표준편차 0', () => {
    const r = computeIC(perfectDays, { minCrossSection: 10 });
    expect(r.n).toBe(20);
    expect(r.mean).toBeCloseTo(1, 10);
    expect(r.std).toBeCloseTo(0, 10);
    expect(r.obs).toBe(240);
    expect(r.avgCrossSection).toBe(12);
  });

  it('횡단면이 최소 종목 수에 못 미치는 날은 통째로 제외', () => {
    const thin = [
      { date: '20260101', values: Array.from({ length: 5 }, (_, k) => ({ score: k, ret: k })) },
      ...perfectDays.slice(0, 3),
    ];
    expect(computeIC(thin, { minCrossSection: 10 }).n).toBe(3);
  });

  it('그날 점수가 전부 같으면(상관 정의 불가) 그 날짜만 빠진다', () => {
    const flat = { date: '20260199', values: Array.from({ length: 12 }, (_, k) => ({ score: 1, ret: k })) };
    expect(computeIC([...perfectDays, flat], { minCrossSection: 10 }).n).toBe(20);
  });

  it('비유한 값(NaN·null)은 관측에서 제외', () => {
    const dirty = [{
      date: '20260101',
      values: [...Array.from({ length: 11 }, (_, k) => ({ score: k, ret: k * 0.01 })),
        { score: NaN, ret: 0.5 }, { score: 3, ret: null }],
    }];
    const r = computeIC(dirty, { minCrossSection: 10 });
    expect(r.n).toBe(1);
    expect(r.obs).toBe(11);
  });

  it('표본 없으면 전부 null — 0으로 보고하지 않는다', () => {
    const r = computeIC([], { minCrossSection: 10 });
    expect(r.n).toBe(0);
    expect(r.mean).toBeNull();
    expect(r.tStat).toBeNull();
  });

  it('ICIR 연환산은 √(252/N) 배 — 호라이즌이 길수록 독립 기간이 줄어 작아진다', () => {
    // 5일 중 4일은 IC=+1, 1일은 -1 → 평균 0.6, 표준편차 > 0 (0/0이 되지 않게 편향을 준다).
    const noisy = Array.from({ length: 40 }, (_, d) => ({
      date: `2026${String(d).padStart(4, '0')}`,
      values: Array.from({ length: 12 }, (_, k) => ({ score: k, ret: (d % 5 === 0 ? -k : k) * 0.01 })),
    }));
    const short = computeIC(noisy, { minCrossSection: 10, periodsPerYear: 252 / 5 });
    const long = computeIC(noisy, { minCrossSection: 10, periodsPerYear: 252 / 60 });
    expect(short.mean).toBeCloseTo(0.6, 10);
    expect(short.std!).toBeGreaterThan(0);
    expect(Math.abs(short.icir!)).toBeGreaterThan(Math.abs(long.icir!));
    expect(short.icir! / long.icir!).toBeCloseTo(Math.sqrt((252 / 5) / (252 / 60)), 6);
  });
});

describe('Newey-West · 중첩 lag', () => {
  it('중첩 lag = floor((N-1)/step) — step보다 짧은 호라이즌은 겹치지 않는다', () => {
    expect(overlapLag(5, 5)).toBe(0);
    expect(overlapLag(20, 5)).toBe(3);
    expect(overlapLag(60, 5)).toBe(11);
    expect(overlapLag(1, 5)).toBe(0);
  });

  it('lag 0이면 통상 표준오차(모분산 기준)와 같다', () => {
    const x = [0.1, -0.05, 0.2, 0.0, 0.15, -0.1];
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const plain = Math.sqrt(x.reduce((a, v) => a + (v - mean) ** 2, 0) / x.length / x.length);
    expect(neweyWestSE(x, 0)).toBeCloseTo(plain, 12);
  });

  it('양의 자기상관이 있으면 SE가 커진다 → t가 부풀지 않는다', () => {
    // 중첩된 IC 시계열을 흉내: 인접 관측이 같은 방향으로 붙어 있다.
    const autocorr = [0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12, 0.11];
    expect(neweyWestSE(autocorr, 3)!).toBeGreaterThan(neweyWestSE(autocorr, 0)!);
  });

  it('표본 1개 이하는 null', () => {
    expect(neweyWestSE([0.1], 0)).toBeNull();
    expect(neweyWestSE([], 0)).toBeNull();
  });
});

describe('버킷 통계', () => {
  const obs = [
    { score: 0.5, ret: -0.02 }, { score: 0.8, ret: -0.01 },
    { score: 1.2, ret: 0.00 }, { score: 1.9, ret: 0.02 },
    { score: 2.4, ret: 0.05 }, { score: 3.0, ret: 0.09 },
  ];
  const buckets = [
    { label: '[0,1)', min: 0, max: 1 },
    { label: '[1,2)', min: 1, max: 2 },
    { label: '[2,3]', min: 2, max: 3.0001 },
  ];

  it('경계는 [min, max) — 상한 포함 버킷만 max에 여유를 준다', () => {
    const s = bucketStats(obs, buckets);
    expect(s.map((b: { n: number }) => b.n)).toEqual([2, 2, 2]);
    expect(s[2].n).toBe(2);   // score 3.0이 마지막 버킷에 들어간다
  });

  it('평균·중앙·사분위·승률', () => {
    const s = bucketStats(obs, buckets);
    expect(s[0].mean).toBeCloseTo(-0.015, 10);
    expect(s[0].winRate).toBe(0);
    expect(s[2].winRate).toBe(1);
    expect(s[1].median).toBeCloseTo(0.01, 10);
  });

  it('빈 버킷은 n=0 + null — 0%로 보고하지 않는다', () => {
    const s = bucketStats([], buckets);
    expect(s.every((b: { n: number; mean: number | null; winRate: number | null }) => b.n === 0 && b.mean === null && b.winRate === null)).toBe(true);
  });

  it('quantile은 선형 보간', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('Benjamini-Hochberg 다중검정 보정', () => {
  it('보정 p는 원 p 이상이고 단조 비감소', () => {
    const raw = [0.001, 0.008, 0.02, 0.04, 0.3, 0.7];
    const adj = benjaminiHochberg(raw);
    for (let i = 0; i < raw.length; i++) expect(adj[i]).toBeGreaterThanOrEqual(raw[i] - 1e-12);
    const paired = raw.map((p, i) => ({ p, a: adj[i] })).sort((x, y) => x.p - y.p);
    for (let i = 1; i < paired.length; i++) expect(paired[i].a).toBeGreaterThanOrEqual(paired[i - 1].a - 1e-12);
  });

  it('가장 큰 p는 그대로, 1을 넘지 않는다', () => {
    const adj = benjaminiHochberg([0.01, 0.5, 0.9]);
    expect(adj[2]).toBeCloseTo(0.9, 10);
    expect(Math.max(...adj)).toBeLessThanOrEqual(1);
  });

  it('비유한 p는 null로 남기고 나머지만 보정한다', () => {
    const adj = benjaminiHochberg([0.01, null as unknown as number, 0.02]);
    expect(adj[1]).toBeNull();
    expect(adj[0]).not.toBeNull();
  });
});
