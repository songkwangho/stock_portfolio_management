import { describe, it, expect } from 'vitest';
import { computeRoundtrips, summarize, evaluateOpenLots } from '@/server/domains/journal/roundtrip.js';
import { disposition } from '@/server/domains/journal/biases/disposition.js';
import { overtrading } from '@/server/domains/journal/biases/overtrading.js';
import { anchoring } from '@/server/domains/journal/biases/anchoring.js';
import { chasing } from '@/server/domains/journal/biases/chasing.js';
import { avgdown } from '@/server/domains/journal/biases/avgdown.js';

const T = (code: string, side: string, quantity: number, price: number, tradedAt: string) =>
  ({ code, side, quantity, price, tradedAt });
// F2: computeRoundtrips가 { roundtrips, unmatched } 객체 반환 → 배열만 필요한 곳은 이 헬퍼로.
const rts = (trades: ReturnType<typeof T>[]) => computeRoundtrips(trades).roundtrips;

describe('computeRoundtrips — FIFO', () => {
  it('단순 매수→매도 청산', () => {
    const rt = rts([
      T('005930', 'buy', 10, 70000, '2026-01-05'),
      T('005930', 'sell', 10, 80000, '2026-01-15'),
    ]);
    expect(rt).toHaveLength(1);
    expect(rt[0]).toMatchObject({ quantity: 10, buyPrice: 70000, sellPrice: 80000, holdingDays: 10, pnl: 100000 });
    expect(rt[0].pnlRate).toBeCloseTo(14.2857, 3);
  });
  it('FIFO — 두 매수 lot을 하나의 매도가 순서대로 소진(부분 매칭)', () => {
    const rt = rts([
      T('A', 'buy', 5, 100, '2026-01-01'),
      T('A', 'buy', 5, 200, '2026-01-02'),
      T('A', 'sell', 8, 300, '2026-01-10'),
    ]);
    expect(rt).toHaveLength(2);
    expect(rt[0]).toMatchObject({ quantity: 5, buyPrice: 100 });   // 첫 lot 전량
    expect(rt[1]).toMatchObject({ quantity: 3, buyPrice: 200 });   // 둘째 lot 부분
  });
  it('당일 매수가 당일 매도에 매칭(데이트레이딩, holdingDays 0)', () => {
    const rt = rts([
      T('A', 'sell', 5, 110, '2026-01-05'),   // 입력 순서가 뒤섞여도
      T('A', 'buy', 5, 100, '2026-01-05'),
    ]);
    expect(rt).toHaveLength(1);
    expect(rt[0]).toMatchObject({ holdingDays: 0, pnl: 50 });
  });
  it('종목 분리 — 다른 종목끼리 매칭 안 됨', () => {
    const rt = rts([
      T('A', 'buy', 5, 100, '2026-01-01'),
      T('B', 'sell', 5, 110, '2026-01-05'),
    ]);
    expect(rt).toHaveLength(0);
  });
});

describe('computeRoundtrips — 미매칭 매도 집계 (F2 coverage)', () => {
  it('매수기록 없는 매도 전량 → unmatched 집계', () => {
    const { roundtrips, unmatched } = computeRoundtrips([T('A', 'sell', 5, 110, '2026-01-05')]);
    expect(roundtrips).toHaveLength(0);
    expect(unmatched.sellCount).toBe(1);
    expect(unmatched.sellQty).toBe(5);
  });
  it('부분 미매칭 — 매수 3 / 매도 5 → 청산 1건(3) + 잔여 2', () => {
    const { roundtrips, unmatched } = computeRoundtrips([
      T('A', 'buy', 3, 100, '2026-01-01'),
      T('A', 'sell', 5, 120, '2026-01-10'),
    ]);
    expect(roundtrips).toHaveLength(1);
    expect(roundtrips[0].quantity).toBe(3);
    expect(unmatched.sellCount).toBe(1);
    expect(unmatched.sellQty).toBe(2);
  });
  it('전량 매칭이면 unmatched 0', () => {
    const { unmatched } = computeRoundtrips([
      T('A', 'buy', 5, 100, '2026-01-01'),
      T('A', 'sell', 5, 120, '2026-01-10'),
    ]);
    expect(unmatched.sellCount).toBe(0);
    expect(unmatched.sellQty).toBe(0);
  });
});

describe('computeRoundtrips — 미청산 보유분 openLots (C-2)', () => {
  it('매수 10 / 매도 4 → openLot 잔여 6, 첫 매수일 보존', () => {
    const { openLots } = computeRoundtrips([
      T('A', 'buy', 10, 100, '2026-01-01'),
      T('A', 'sell', 4, 120, '2026-01-10'),
    ]);
    expect(openLots).toHaveLength(1);
    expect(openLots[0]).toMatchObject({ code: 'A', quantity: 6, avgBuyPrice: 100, firstBuyDate: '2026-01-01' });
  });
  it('여러 lot 부분 소진 → 잔여 가중평균가', () => {
    const { openLots } = computeRoundtrips([
      T('A', 'buy', 5, 100, '2026-01-01'),   // 첫 lot
      T('A', 'buy', 5, 200, '2026-01-02'),   // 둘째 lot
      T('A', 'sell', 3, 150, '2026-01-10'),  // 첫 lot에서 3 소진 → 잔여: 첫 2@100 + 둘째 5@200
    ]);
    expect(openLots[0].quantity).toBe(7);
    expect(openLots[0].avgBuyPrice).toBeCloseTo((2 * 100 + 5 * 200) / 7, 6);
    expect(openLots[0].firstBuyDate).toBe('2026-01-01');
  });
  it('전량 매도면 openLots 없음', () => {
    const { openLots } = computeRoundtrips([
      T('A', 'buy', 5, 100, '2026-01-01'), T('A', 'sell', 5, 120, '2026-01-10'),
    ]);
    expect(openLots).toHaveLength(0);
  });
});

describe('evaluateOpenLots — 미실현 평가(순수, 리뷰 수정)', () => {
  const lot = (code: string, quantity: number, avgBuyPrice: number, firstBuyDate: string) => ({ code, quantity, avgBuyPrice, firstBuyDate });

  it('손실 종목 카운트 + 종목별 날짜로 보유일', () => {
    const r = evaluateOpenLots(
      [lot('A', 10, 1000, '2025-08-01'), lot('B', 5, 500, '2025-08-10')],
      { A: { close: 800, date: '2025-08-27' }, B: { close: 600, date: '2025-08-27' } },   // A 손실, B 이익
    );
    expect(r.openLossCount).toBe(1);
    expect(r.asOfDate).toBe('2025-08-27');
    expect(r.openLossAvgHoldDays).toBe(26);   // 08-01 → 08-27
  });
  it('보유일 음수 클램프 — 최신 종가보다 뒤에 산 보유분(오늘 매수·어제 종가)', () => {
    const r = evaluateOpenLots(
      [lot('A', 1, 10000, '2025-08-28')],   // firstBuyDate가 asOfDate보다 뒤
      { A: { close: 9500, date: '2025-08-27' } },   // 손실
    );
    expect(r.openLossCount).toBe(1);
    expect(r.openLossAvgHoldDays).toBe(0);   // -1 → 0 클램프 (음수 '평균 -1일' 방지)
  });
  it('stocks.price 폴백(날짜 없음) → 전역 asOfDate 기준 보유일', () => {
    const r = evaluateOpenLots(
      [lot('A', 1, 1000, '2025-08-01'), lot('B', 1, 1000, '2025-08-05')],
      { A: { close: 900, date: '2025-08-27' }, B: { close: 900, date: null } },   // B는 폴백
    );
    expect(r.openLossCount).toBe(2);
    expect(r.asOfDate).toBe('2025-08-27');   // 히스토리 있는 A에서 도출
  });
  it('평가 불가(가격 없음) → unvalued', () => {
    const r = evaluateOpenLots([lot('A', 1, 1000, '2025-08-01')], { A: { close: null as unknown as number, date: null } });
    expect(r.unvaluedCount).toBe(1);
    expect(r.openLossCount).toBe(0);
  });
  it('빈 openLots', () => {
    expect(evaluateOpenLots([], {})).toMatchObject({ openLossCount: 0, asOfDate: null, openLossAvgHoldDays: null });
  });
});

describe('summarize — 실현손익 요약', () => {
  it('승률·손익비·평균보유(이익/손실)·MDD', () => {
    const rt = rts([
      T('A', 'buy', 1, 100, '2026-01-01'), T('A', 'sell', 1, 150, '2026-01-11'),  // +50, 10일
      T('B', 'buy', 1, 100, '2026-01-01'), T('B', 'sell', 1, 80, '2026-02-20'),   // -20, 50일
    ]);
    const s = summarize(rt);
    expect(s.roundtripCount).toBe(2);
    expect(s.realizedLossCount).toBe(1);   // C-2: B 청산이 손실
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

// 이익 roundtrip(5D 기본) / 손실 roundtrip 생성 헬퍼
const win = (code: string, sell = '2026-01-06') => [T(code, 'buy', 1, 100, '2026-01-01'), T(code, 'sell', 1, 150, sell)];
const loss = (code: string, sell = '2026-02-15') => [T(code, 'buy', 1, 100, '2026-01-01'), T(code, 'sell', 1, 80, sell)];

describe('편향 — 수치·flag만 (텍스트 없음)', () => {
  it('disposition(F3) — 격차 큼 + 표본 n>=3 → flag true', () => {
    const d = disposition(rts([
      ...win('W1'), ...win('W2'), ...win('W3'),          // 각 5일 이익
      ...loss('L1'), ...loss('L2'), ...loss('L3'),       // 각 45일 손실
    ]));
    expect(d.available).toBe(true);
    expect(d.winnerAvgHold).toBe(5);
    expect(d.loserAvgHold).toBe(45);
    expect(d.flag).toBe(true);
    expect(d.thresholds.provisional).toBe(true);
    expect(Object.keys(d)).not.toContain('text');   // 텍스트는 프론트가 생성
  });
  it('disposition(F3) — 소표본(n<3)이면 격차 커도 flag false', () => {
    const d = disposition(rts([...win('W1'), ...loss('L1')]));   // n=1씩
    expect(d.available).toBe(true);
    expect(d.flag).toBe(false);
  });
  it('disposition(F3) — 격차 작으면(<3일) flag false', () => {
    const d = disposition(rts([
      ...win('W1'), ...win('W2'), ...win('W3'),                          // 5일
      ...loss('L1', '2026-01-07'), ...loss('L2', '2026-01-07'), ...loss('L3', '2026-01-07'),   // 6일 (격차 1)
    ]));
    expect(d.flag).toBe(false);
  });
  it('disposition — 한쪽 그룹만이면 available:false', () => {
    expect(disposition(rts(win('W1'))).available).toBe(false);
  });
  it('overtrading — 월평균 매매횟수·평균보유일', () => {
    const trades = [...win('A'), ...loss('B')];
    const o = overtrading(trades, rts([...win('A'), ...loss('B')]));
    expect(o.available).toBe(true);
    expect(o.totalTrades).toBe(4);
    expect(o.thresholds.provisional).toBe(true);
  });
  it('anchoring — 본전 근처(±3%) 청산 비율', () => {
    const rt = rts([
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
    const reader = (_code: string, tradedAt: string) => (tradedAt === '2026-02-01' ? 20 : 2);
    const c = await chasing(buys, reader);
    expect(c.available).toBe(true);
    expect(c.evaluatedCount).toBe(2);
    expect(c.chasedCount).toBe(1);
    expect(c.chasingRatio).toBe(50);
  });
  it('chasing — 히스토리 부족(null) skip → coverage', async () => {
    const c = await chasing([T('A', 'buy', 1, 100, '2026-02-01')], () => null);
    expect(c.available).toBe(false);
    expect(c.coverage.skipped).toBe(1);
  });

  it('avgdown(C-3) — 딥노이드 하락 재매수 시퀀스 → 첫 매수 제외, 3건 감지, flag', () => {
    const a = avgdown([
      T('DEEP', 'buy', 1, 1440, '2026-01-01'),   // 첫 매수(제외)
      T('DEEP', 'buy', 1, 1315, '2026-01-05'),   // < 1440 → 이벤트1
      T('DEEP', 'buy', 1, 1250, '2026-01-10'),   // < 1377.5 → 이벤트2
      T('DEEP', 'buy', 1, 1227, '2026-01-15'),   // < 1335 → 이벤트3
    ]);
    expect(a.available).toBe(true);
    expect(a.count).toBe(3);
    expect(a.evaluableBuys).toBe(3);
    expect(a.codes).toEqual(['DEEP']);
    expect(a.flag).toBe(true);   // 한 종목 3회 ≥ perStockMin 2
    expect(a.thresholds.provisional).toBe(true);
  });
  it('avgdown(C-3) — 상승 재매수는 이벤트 아님', () => {
    const a = avgdown([
      T('A', 'buy', 1, 100, '2026-01-01'), T('A', 'buy', 1, 120, '2026-01-05'),   // 120 > 100 → 이벤트 아님
    ]);
    expect(a.available).toBe(true);
    expect(a.count).toBe(0);
  });
  it('avgdown(C-3) — 매도는 평단 미변경 (재매수 비교는 매수 누적 평단 기준)', () => {
    const a = avgdown([
      T('A', 'buy', 1, 100, '2026-01-01'),
      T('A', 'sell', 1, 130, '2026-01-03'),      // 매도 → 평단 미변경(100 유지)
      T('A', 'buy', 1, 90, '2026-01-05'),         // 90 < 100 → 이벤트
    ]);
    expect(a.count).toBe(1);
  });
  it('avgdown(C-3) — 종목당 매수 1회뿐이면 available:false(비교 불가)', () => {
    expect(avgdown([T('A', 'buy', 1, 100, '2026-01-01')]).available).toBe(false);
  });
});
