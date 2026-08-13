import { describe, it, expect } from 'vitest';
import {
  classifyMaState, MA_STATES, simulateHolding, precomputeSmas, labeledStats, pairedDiff, variantMatchesProduction,
} from '@/scripts/backtest/holding.mjs';
import { calculateHoldingOpinion } from '@/server/domains/analysis/scoring';

// 세션 2 — HoldingOpinion 정책 시뮬.
//
// 핵심 계약 둘:
//  1) 프로덕션 규칙을 **복제하지 않는다** — production 모드는 calculateHoldingOpinion을 직접 부르고,
//     θ 스윕 변종은 프로덕션 파라미터에서 프로덕션과 같은 결정을 내야 한다.
//  2) 누수 0 — exit 결정은 각 날 j에서 ≤ j만 본다. j 이후를 조작해도 그때까지의 결정이 안 변해야 한다.

type Bar = { date: string; price: number };
const series = (prices: number[], start = 20260101): Bar[] =>
  prices.map((p, i) => ({ date: String(start + i), price: p }));

describe('classifyMaState — 규칙 SMA 분기와 대응', () => {
  it('이중이탈 / 단기이탈+중기지지', () => {
    expect(classifyMaState(90, 100, 95)).toBe('doubleBreakdown');       // 양 이평선 아래
    expect(classifyMaState(97, 100, 95)).toBe('shortBreachMidSupport'); // 5일선 아래·20일선 위
  });

  it('5일선 근접(100~101%)은 정배열보다 먼저 배정된다 (프로덕션 판정 순서)', () => {
    // 규칙은 근접(추가매수)을 정배열(보유)보다 먼저 본다 → 상태 라벨도 같은 집합이어야 한다.
    expect(classifyMaState(100, 100, 95)).toBe('near5MA');       // 정확히 5일선
    expect(classifyMaState(101, 100, 95)).toBe('near5MA');       // 101% 경계 포함
    expect(classifyMaState(101.5, 100, 95)).toBe('aligned');     // 근접 밖 + 정배열
  });

  it('정배열은 price > sma5 > sma20 일 때만', () => {
    expect(classifyMaState(120, 100, 95)).toBe('aligned');
    expect(classifyMaState(120, 100, 105)).toBe('other');   // 역배열
  });

  it('sma5가 없으면 other — 규칙도 손절 외 판단을 못 한다', () => {
    expect(classifyMaState(100, null, 95)).toBe('other');
    expect(classifyMaState(null, 100, 95)).toBe('other');
  });

  it('sma20이 없으면 근접만 판정 가능', () => {
    expect(classifyMaState(100, 100, null)).toBe('near5MA');
    expect(classifyMaState(90, 100, null)).toBe('other');
    expect(classifyMaState(120, 100, null)).toBe('other');
  });

  it('MA_STATES가 classifyMaState의 치역을 덮는다', () => {
    const seen = new Set<string>();
    for (const p of [80, 95, 97, 100, 100.5, 101, 110, 120]) {
      for (const s5 of [100, null]) for (const s20 of [95, 105, null]) {
        seen.add(classifyMaState(p, s5, s20));
      }
    }
    for (const s of seen) expect(MA_STATES).toContain(s);
  });
});

describe('변종 로직 == 프로덕션 규칙 (규칙 복제 검증)', () => {
  it('θ=-0.07 · 이중이탈 on 에서 프로덕션과 같은 결정을 낸다 (광범위 그리드)', () => {
    let checked = 0;
    for (const entry of [1000, 10000, 50000]) {
      for (const mul of [0.5, 0.85, 0.9, 0.925, 0.93, 0.935, 0.95, 1.0, 1.005, 1.01, 1.05, 1.3]) {
        const price = Math.round(entry * mul);
        for (const s5 of [null, price * 0.9, price, price * 1.1]) {
          for (const s20 of [null, price * 0.8, price * 1.2]) {
            expect(variantMatchesProduction(entry, price, s5, s20),
              `entry=${entry} price=${price} s5=${s5} s20=${s20}`).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);   // 스윕이 공회전하지 않음
  });
});

describe('simulateHolding — 정책 정합', () => {
  it('손절·이중이탈이 안 걸리면 매수후보유와 완전히 같다', () => {
    // 계속 오르면서 정배열 유지 → 청산 트리거 없음.
    const s = series(Array.from({ length: 90 }, (_, i) => 10000 + i * 100));
    const r = simulateHolding(s, 60, 20, { useProductionRule: true });
    expect(r.ok).toBe(true);
    expect(r.exited).toBe(false);
    expect(r.policy).toBe(r.buyHold);
    expect(r.holdingDays).toBe(20);
  });

  it('-7% 아래로 떨어지면 그 지점에서 청산한다', () => {
    // 60봉 평탄 후 급락. 진입 60, 다음날 -10% → 손절.
    const prices = [...Array.from({ length: 61 }, () => 10000), 9000, ...Array.from({ length: 30 }, () => 9000)];
    const r = simulateHolding(series(prices), 60, 20, { useProductionRule: true });
    expect(r.exited).toBe(true);
    expect(r.exitReason).toBe('stop_loss');
    expect(r.triggerDay).toBe(1);
    expect(r.policy).toBeCloseTo(-0.1, 10);
  });

  it('손절 사유가 이중이탈보다 먼저 귀속된다 (프로덕션 판정 순서)', () => {
    // -10% 하락이면 손절과 이중이탈이 동시에 성립한다 → 손절로 귀속.
    const prices = [...Array.from({ length: 61 }, (_, i) => 10000 + i), 9000, ...Array.from({ length: 30 }, () => 9000)];
    const r = simulateHolding(series(prices), 60, 20, { useProductionRule: true });
    expect(r.exitReason).toBe('stop_loss');
  });

  it('θ를 낮추면 청산이 늦어지거나 사라진다 (스윕이 실제로 작동)', () => {
    const prices = [...Array.from({ length: 61 }, () => 10000), 9200, ...Array.from({ length: 30 }, () => 9200)];
    const tight = simulateHolding(series(prices), 60, 20, { stopThreshold: -0.05, useDoubleBreakdown: false });
    const loose = simulateHolding(series(prices), 60, 20, { stopThreshold: -0.15, useDoubleBreakdown: false });
    expect(tight.exited).toBe(true);
    expect(loose.exited).toBe(false);
  });

  it('이중이탈 단독 정책(θ=-Infinity)은 손절로 귀속되지 않는다', () => {
    const prices = [...Array.from({ length: 61 }, () => 10000), 8000, ...Array.from({ length: 30 }, () => 8000)];
    const r = simulateHolding(series(prices), 60, 20, { stopThreshold: -Infinity, useDoubleBreakdown: true });
    expect(r.exited).toBe(true);
    expect(r.exitReason).toBe('double_breakdown');
  });

  it('청산 지연 1일이면 다음 거래일 종가로 채워진다', () => {
    const prices = [...Array.from({ length: 61 }, () => 10000), 9000, 8500, ...Array.from({ length: 30 }, () => 8500)];
    const lag0 = simulateHolding(series(prices), 60, 20, { useProductionRule: true, exitLagDays: 0 });
    const lag1 = simulateHolding(series(prices), 60, 20, { useProductionRule: true, exitLagDays: 1 });
    expect(lag0.policy).toBeCloseTo(-0.1, 10);      // 트리거 당일 9000
    expect(lag1.policy).toBeCloseTo(-0.15, 10);     // 다음날 8500
    expect(lag1.holdingDays).toBe(lag0.holdingDays + 1);
  });

  it('표본 경계 — i+N이 끝을 넘으면 제외', () => {
    const s = series(Array.from({ length: 70 }, () => 10000));
    expect(simulateHolding(s, 60, 20, { useProductionRule: true }).ok).toBe(false);
    expect(simulateHolding(s, -1, 5, {}).ok).toBe(false);
  });

  it('알려진 트레이드오프 재현 — -10% 후 완전 회복하면 손절이 회복분을 놓친다', () => {
    // 손절의 가치를 평균으로 재면 안 되는 이유를 하네스가 실제로 보여주는지 확인(양성 대조).
    const prices = [
      ...Array.from({ length: 61 }, () => 10000),
      9000,                                            // -10% → 손절 발동
      ...Array.from({ length: 30 }, (_, i) => 9000 + (i + 1) * 200),   // 이후 회복·초과
    ];
    const stopped = simulateHolding(series(prices), 60, 20, { useProductionRule: true });
    const noStop = simulateHolding(series(prices), 60, 20, { stopThreshold: -Infinity, useDoubleBreakdown: false });
    expect(stopped.policy).toBeCloseTo(-0.1, 10);
    expect(noStop.policy).toBeGreaterThan(0);
    expect(stopped.policy).toBeLessThan(noStop.policy);   // 손절이 평균을 깎는 쪽
  });

  it('반대로 계속 빠지면 손절이 손실을 자른다 (꼬리 보호)', () => {
    const prices = [
      ...Array.from({ length: 61 }, () => 10000),
      9000, ...Array.from({ length: 30 }, (_, i) => 9000 - (i + 1) * 200),
    ];
    const stopped = simulateHolding(series(prices), 60, 20, { useProductionRule: true });
    const noStop = simulateHolding(series(prices), 60, 20, { stopThreshold: -Infinity, useDoubleBreakdown: false });
    expect(stopped.policy).toBeGreaterThan(noStop.policy);
  });
});

describe('누수 가드 — exit 결정은 각 날 ≤ j만 본다', () => {
  const prices = [...Array.from({ length: 61 }, () => 10000), 9800, 9700, 9000, ...Array.from({ length: 40 }, () => 9000)];
  const s = series(prices);

  it('트리거 이후 봉을 통째로 조작해도 결과가 변하지 않는다', () => {
    const base = simulateHolding(s, 60, 20, { useProductionRule: true });
    expect(base.exited).toBe(true);
    const trig = 60 + base.triggerDay;
    // 청산 시점 이후를 3배로 부풀려도 이미 내려진 결정은 그대로여야 한다.
    const tampered = s.map((b, k) => (k > trig ? { ...b, price: b.price * 3 } : b));
    const after = simulateHolding(tampered, 60, 20, { useProductionRule: true });
    expect(after.exited).toBe(base.exited);
    expect(after.triggerDay).toBe(base.triggerDay);
    expect(after.policy).toBeCloseTo(base.policy, 12);
  });

  it('청산 전 경로를 바꾸면 결정이 달라진다 (가드가 공회전하지 않는 증거)', () => {
    // 상승 일변도라 base에는 트리거가 없다 → 중간에 급락을 심으면 그날 청산이 생겨야 한다.
    const rising = series(Array.from({ length: 90 }, (_, i) => 10000 + i * 100));
    const base = simulateHolding(rising, 60, 20, { useProductionRule: true });
    expect(base.exited).toBe(false);

    const injected = rising.map((b, k) => (k === 65 ? { ...b, price: 8000 } : b));
    const after = simulateHolding(injected, 60, 20, { useProductionRule: true });
    expect(after.exited).toBe(true);
    expect(after.triggerDay).toBe(5);
  });

  it('buyHold는 i+N 종가만 쓴다 — 경로를 바꿔도 값이 유지된다', () => {
    const base = simulateHolding(s, 60, 20, { stopThreshold: -Infinity, useDoubleBreakdown: false });
    const wiggle = s.map((b, k) => (k > 60 && k < 80 ? { ...b, price: b.price + 111 } : b));
    const after = simulateHolding(wiggle, 60, 20, { stopThreshold: -Infinity, useDoubleBreakdown: false });
    expect(after.buyHold).toBeCloseTo(base.buyHold, 12);
  });
});

describe('precomputeSmas — 즉석 계산 경로와 동일 결과', () => {
  it('미리 계산한 SMA로 돌려도 결과가 같다 (런너 최적화가 조용히 어긋나지 않게)', () => {
    let st = 7 >>> 0;
    const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
    let p = 10000;
    const s = Array.from({ length: 200 }, (_, i) => {
      p = Math.max(100, Math.round(p * (1 + (rnd() - 0.5) * 0.05)));
      return { date: String(20260101 + i), price: p };
    });
    const smas = precomputeSmas(s);
    for (const i of [60, 80, 100, 120]) {
      for (const n of [5, 20]) {
        const a = simulateHolding(s, i, n, { useProductionRule: true });
        const b = simulateHolding(s, i, n, { useProductionRule: true, precomputed: smas });
        expect(b).toEqual(a);
      }
    }
  });
});

describe('집계 헬퍼', () => {
  const rows = [
    { state: 'aligned', r20: 0.05 }, { state: 'aligned', r20: -0.01 },
    { state: 'doubleBreakdown', r20: 0.02 }, { state: 'doubleBreakdown', r20: 0.08 },
  ];

  it('labeledStats는 지정한 라벨 순서로 분포 통계를 낸다', () => {
    const out = labeledStats(rows, 'state', 'r20', ['aligned', 'doubleBreakdown', 'near5MA']);
    expect(out.map((o: { label: string }) => o.label)).toEqual(['aligned', 'doubleBreakdown', 'near5MA']);
    expect(out[0].n).toBe(2);
    expect(out[1].mean).toBeCloseTo(0.05, 10);
    expect(out[2].n).toBe(0);            // 표본 없는 라벨도 자리를 지킨다
    expect(out[2].mean).toBeNull();
  });

  it('p5·최소가 함께 나온다 (손절 판정은 왼쪽 꼬리로 한다)', () => {
    const out = labeledStats(rows, 'state', 'r20', ['aligned']);
    expect(out[0].min).toBeCloseTo(-0.01, 10);
    expect(out[0].p5).not.toBeNull();
  });

  it('pairedDiff — 정책 − 매수후보유의 분포와 개선 비율', () => {
    const d = pairedDiff([
      { policy: 0.01, buyHold: -0.05 },
      { policy: -0.07, buyHold: -0.20 },
      { policy: 0.03, buyHold: 0.03 },
      { policy: -0.07, buyHold: 0.10 },
    ]);
    expect(d.n).toBe(4);
    expect(d.betterRate).toBeCloseTo(0.5, 10);
    expect(d.sameRate).toBeCloseTo(0.25, 10);
    expect(d.mean).toBeCloseTo((0.06 + 0.13 + 0 - 0.17) / 4, 10);
  });
});

describe('프로덕션 규칙은 그대로다 (무변경 확인)', () => {
  it('calculateHoldingOpinion의 알려진 분기가 유지된다', () => {
    expect(calculateHoldingOpinion(10000, 9200, 9500, 9800)).toBe('매도');   // -8% 손절
    expect(calculateHoldingOpinion(10000, 9800, 9900, 9700)).toBe('관망');   // 5일선 아래·20일선 위
    expect(calculateHoldingOpinion(10000, 10050, 10000, 9500)).toBe('추가매수');
    expect(calculateHoldingOpinion(10000, 11000, 10500, 10000)).toBe('보유');
    expect(calculateHoldingOpinion(10000, 9600, 9800, 9700)).toBe('매도');   // 이중이탈
  });
});
