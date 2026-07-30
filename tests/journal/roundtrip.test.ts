import { describe, it, expect } from 'vitest';
import { computeRoundtrips, summarize } from '@/server/domains/journal/roundtrip.js';
import { disposition } from '@/server/domains/journal/biases/disposition.js';
import { overtrading } from '@/server/domains/journal/biases/overtrading.js';
import { anchoring } from '@/server/domains/journal/biases/anchoring.js';
import { chasing } from '@/server/domains/journal/biases/chasing.js';

const T = (code: string, side: string, quantity: number, price: number, tradedAt: string) =>
  ({ code, side, quantity, price, tradedAt });

describe('computeRoundtrips — FIFO', () => {
  it('단순 매수→매도 청산', () => {
    const rt = computeRoundtrips([
      T('005930', 'buy', 10, 70000, '2026-01-05'),
      T('005930', 'sell', 10, 80000, '2026-01-15'),
    ]);
    expect(rt).toHaveLength(1);
    expect(rt[0]).toMatchObject({ quantity: 10, buyPrice: 70000, sellPrice: 80000, holdingDays: 10, pnl: 100000 });
    expect(rt[0].pnlRate).toBeCloseTo(14.2857, 3);
  });
  it('FIFO — 두 매수 lot을 하나의 매도가 순서대로 소진(부분 매칭)', () => {
    const rt = computeRoundtrips([
      T('A', 'buy', 5, 100, '2026-01-01'),
      T('A', 'buy', 5, 200, '2026-01-02'),
      T('A', 'sell', 8, 300, '2026-01-10'),
    ]);
    expect(rt).toHaveLength(2);
    expect(rt[0]).toMatchObject({ quantity: 5, buyPrice: 100 });   // 첫 lot 전량
    expect(rt[1]).toMatchObject({ quantity: 3, buyPrice: 200 });   // 둘째 lot 부분
  });
  it('당일 매수가 당일 매도에 매칭(데이트레이딩, holdingDays 0)', () => {
    const rt = computeRoundtrips([
      T('A', 'sell', 5, 110, '2026-01-05'),   // 입력 순서가 뒤섞여도
      T('A', 'buy', 5, 100, '2026-01-05'),
    ]);
    expect(rt).toHaveLength(1);
    expect(rt[0]).toMatchObject({ holdingDays: 0, pnl: 50 });
  });
  it('매수기록 없는 매도(공매도/이관)는 skip', () => {
    const rt = computeRoundtrips([T('A', 'sell', 5, 110, '2026-01-05')]);
    expect(rt).toHaveLength(0);
  });
  it('종목 분리 — 다른 종목끼리 매칭 안 됨', () => {
    const rt = computeRoundtrips([
      T('A', 'buy', 5, 100, '2026-01-01'),
      T('B', 'sell', 5, 110, '2026-01-05'),
    ]);
    expect(rt).toHaveLength(0);
  });
});

describe('summarize — 실현손익 요약', () => {
  it('승률·손익비·평균보유(이익/손실)·MDD', () => {
    const rt = computeRoundtrips([
      T('A', 'buy', 1, 100, '2026-01-01'), T('A', 'sell', 1, 150, '2026-01-11'),  // +50, 10일
      T('B', 'buy', 1, 100, '2026-01-01'), T('B', 'sell', 1, 80, '2026-02-20'),   // -20, 50일
    ]);
    const s = summarize(rt);
    expect(s.roundtripCount).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.avgHoldWin).toBe(10);
    expect(s.avgHoldLoss).toBe(50);
    expect(s.profitFactor).toBe(2.5);   // 50 / 20
    expect(s.totalPnl).toBe(30);
  });
  it('빈 입력', () => {
    expect(summarize([])).toMatchObject({ roundtripCount: 0, winRate: null, maxDrawdown: 0 });
  });
});

describe('편향 — 수치·flag만 (텍스트 없음)', () => {
  const winLoss = computeRoundtrips([
    T('A', 'buy', 1, 100, '2026-01-01'), T('A', 'sell', 1, 150, '2026-01-06'),   // 이익, 5일
    T('B', 'buy', 1, 100, '2026-01-01'), T('B', 'sell', 1, 80, '2026-03-01'),    // 손실, 59일
  ]);

  it('disposition — 손실을 더 오래 보유하면 flag', () => {
    const d = disposition(winLoss);
    expect(d.available).toBe(true);
    expect(d.winnerAvgHold).toBe(5);
    expect(d.loserAvgHold).toBe(59);
    expect(d.flag).toBe(true);
    // 텍스트 필드가 없어야 함(프론트가 생성)
    expect(Object.keys(d)).not.toContain('text');
  });
  it('disposition — 한쪽 그룹만이면 available:false', () => {
    const onlyWins = computeRoundtrips([T('A', 'buy', 1, 100, '2026-01-01'), T('A', 'sell', 1, 150, '2026-01-06')]);
    expect(disposition(onlyWins).available).toBe(false);
  });
  it('overtrading — 월평균 매매횟수·평균보유일', () => {
    const trades = [
      T('A', 'buy', 1, 100, '2026-01-01'), T('A', 'sell', 1, 150, '2026-01-06'),
      T('B', 'buy', 1, 100, '2026-01-01'), T('B', 'sell', 1, 80, '2026-03-01'),
    ];
    const o = overtrading(trades, winLoss);
    expect(o.available).toBe(true);
    expect(o.totalTrades).toBe(4);
    expect(o.thresholds.provisional).toBe(true);
  });
  it('anchoring — 본전 근처(±3%) 청산 비율', () => {
    const rt = computeRoundtrips([
      T('A', 'buy', 1, 100, '2026-01-01'), T('A', 'sell', 1, 101, '2026-01-06'),   // +1% 본전근처
      T('B', 'buy', 1, 100, '2026-01-01'), T('B', 'sell', 1, 150, '2026-01-06'),   // +50%
    ]);
    const a = anchoring(rt);
    expect(a.nearBreakevenCount).toBe(1);
    expect(a.total).toBe(2);
    expect(a.anchoringRatio).toBe(50);
  });

  it('chasing — 급등 직후 매수 비율(priceReader 주입)', async () => {
    const buys = [T('A', 'buy', 1, 100, '2026-02-01'), T('A', 'buy', 1, 100, '2026-03-01')];
    // 첫 매수: 직전 +20% 급등 / 둘째: +2% (급등 아님) / null이면 skip
    const reader = (_code: string, tradedAt: string) => (tradedAt === '2026-02-01' ? 20 : 2);
    const c = await chasing(buys, reader);
    expect(c.available).toBe(true);
    expect(c.evaluatedCount).toBe(2);
    expect(c.chasedCount).toBe(1);
    expect(c.chasingRatio).toBe(50);
  });
  it('chasing — 히스토리 부족(null) skip → coverage', async () => {
    const buys = [T('A', 'buy', 1, 100, '2026-02-01')];
    const c = await chasing(buys, () => null);
    expect(c.available).toBe(false);
    expect(c.coverage.skipped).toBe(1);
  });
});
