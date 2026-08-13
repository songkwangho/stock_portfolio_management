import { describe, it, expect } from 'vitest';
import { signalsAt } from '@/scripts/backtest/signals.mjs';
import { forwardReturn, signalIndices } from '@/scripts/backtest/returns.mjs';
import { groupByDate, computeIC } from '@/scripts/backtest/ic.mjs';

// 파이프라인 통합 — load.mjs(DB)만 빼고 signalsAt → forwardReturn → groupByDate → computeIC를
// 합성 패널로 끝까지 돌린다. 운영자가 DB 실행을 태우기 전에 조립이 맞는지 여기서 걸러야 한다.

type Bar = { date: string; price: number; open: number; high: number; low: number; volume: number };

function makeSeries(n: number, seed: number, drift: number, amp: number): Bar[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: Bar[] = [];
  let price = 10000;
  for (let i = 0; i < n; i++) {
    price = Math.max(100, Math.round(price * (1 + drift + (rnd() - 0.5) * amp)));
    const d = new Date(Date.UTC(2023, 0, 1 + i));
    out.push({
      date: d.toISOString().slice(0, 10).replace(/-/g, ''),
      price,
      open: Math.round(price * 0.99),
      high: Math.round(price * 1.02),
      low: Math.round(price * 0.98),
      volume: Math.round(100000 + rnd() * 900000),
    });
  }
  return out;
}

describe('누수 가드 — 시점 t 신호는 미래를 볼 수 없다', () => {
  const series = makeSeries(300, 11, 0.001, 0.03);
  const i = 200;

  it('접두 슬라이스로 계산해도 전체 배열로 계산한 것과 같다', () => {
    expect(signalsAt(series, i)).toEqual(signalsAt(series.slice(0, i + 1), i));
  });

  it('i 이후 봉을 통째로 바꿔도 시점 i 신호는 변하지 않는다 (직접 누수 검사)', () => {
    // 이게 깨지면 IC 전체가 미래 정보로 오염된 값이다.
    const before = signalsAt(series, i);
    const tampered = series.map((b, k) => (k > i ? { ...b, price: b.price * 3, volume: b.volume * 7 } : b));
    expect(signalsAt(tampered, i)).toEqual(before);
  });

  it('i 이후를 잘라내도 동일 — 미래 길이에 의존하지 않는다', () => {
    expect(signalsAt(series.slice(0, i + 50), i)).toEqual(signalsAt(series, i));
  });

  it('반대로 **최근** 과거를 바꾸면 신호가 달라진다 (가드가 공회전하지 않는 증거)', () => {
    const changed = series.map((b, k) => (k >= i - 10 && k <= i ? { ...b, price: Math.round(b.price * 1.5) } : b));
    expect(signalsAt(changed, i)).not.toEqual(signalsAt(series, i));
  });

  it('아주 먼 과거(170봉 전)는 사실상 영향이 없다 — EMA 시드가 감쇠해 사라진다', () => {
    // 처음엔 "이전을 바꾸면 무조건 달라진다"고 봤는데 아니었다. RSI·볼린저·거래량은 뒤쪽
    // 고정 개수만 보고, MACD의 EMA 시드는 k=2/13로 170스텝이면 (1-k)^170 ≈ 0으로 죽는다.
    // 그래서 접두를 통째로 넘겨야 하는 이유는 '시드' 때문이 아니라 MACD 루프 시작점이
    // `prices.length - 20`이라 **어느 구간을 평균하는지가 바뀌기** 때문이다.
    const changed = series.map((b, k) => (k < 30 ? { ...b, price: Math.round(b.price * 1.5) } : b));
    expect(signalsAt(changed, i)).toEqual(signalsAt(series, i));
  });

  it('신호는 축 점수와 SMA를 모두 낸다', () => {
    const sig = signalsAt(series, i);
    expect(sig.technical).toBeGreaterThanOrEqual(0);
    expect(sig.technical).toBeLessThanOrEqual(3);
    expect([0, 0.5, 1, 2]).toContain(sig.trend);
    expect(sig.partialSum).toBeCloseTo(sig.technical + sig.trend, 10);
    expect(sig.detail.sma5).toBeGreaterThan(0);
    expect(sig.detail.sma20).toBeGreaterThan(0);
  });
});

describe('파이프라인 end-to-end (합성 패널)', () => {
  // 20종목 × 400봉. 종목마다 드리프트를 달리해 횡단면에 차이를 만든다.
  const panel = Array.from({ length: 20 }, (_, k) => ({
    code: `T${String(k).padStart(5, '0')}`,
    series: makeSeries(400, 100 + k, (k - 10) * 0.0004, 0.03),
  }));

  function collect(horizons: number[]) {
    const records: Record<string, number | string>[] = [];
    for (const { code, series } of panel) {
      for (const i of signalIndices(series.length, { minWarmup: 60, stepDays: 5, maxHorizon: Math.max(...horizons) })) {
        const sig = signalsAt(series, i);
        const rec: Record<string, number | string> = {
          code, date: series[i].date, technical: sig.technical, trend: sig.trend, partialSum: sig.partialSum,
        };
        for (const n of horizons) {
          const fr = forwardReturn(series, i, n);
          if (fr.ok) rec[`r${n}`] = fr.ret;
        }
        records.push(rec);
      }
    }
    return records;
  }

  const records = collect([5, 20]);

  it('표본이 생기고 모든 신호일에 forward return이 붙는다 (그리드가 상한을 지킨다)', () => {
    expect(records.length).toBeGreaterThan(1000);
    expect(records.every(r => Number.isFinite(r.r5) && Number.isFinite(r.r20))).toBe(true);
  });

  it('같은 날짜에 여러 종목이 모여 횡단면이 만들어진다', () => {
    const daily = groupByDate(records, 'technical', 'r20');
    expect(daily.length).toBeGreaterThan(30);
    expect(Math.max(...daily.map((d: { values: unknown[] }) => d.values.length))).toBeGreaterThanOrEqual(10);
    // 날짜 오름차순 — IC 시계열의 자기상관 보정이 순서를 전제한다.
    const ds = daily.map((d: { date: string }) => d.date);
    expect([...ds].sort()).toEqual(ds);
  });

  it('IC가 계산되고 통계 필드가 채워진다', () => {
    const res = computeIC(groupByDate(records, 'technical', 'r20'), { minCrossSection: 10, lag: 3, periodsPerYear: 252 / 20 });
    expect(res.n).toBeGreaterThan(20);
    expect(Number.isFinite(res.mean)).toBe(true);
    expect(Number.isFinite(res.tStatNW)).toBe(true);
    expect(res.avgCrossSection).toBeGreaterThanOrEqual(10);
    expect(Math.abs(res.mean)).toBeLessThanOrEqual(1);
  });

  it('심어놓은 신호를 실제로 잡아낸다 — 점수 = 미래수익이면 IC ≈ 1', () => {
    // 파이프라인이 신호를 통과시키는지 확인하는 양성 대조군. 이게 1이 아니면 배관이 끊긴 것이다.
    const planted = records.map(r => ({ ...r, technical: r.r20 as number }));
    const res = computeIC(groupByDate(planted, 'technical', 'r20'), { minCrossSection: 10 });
    expect(res.mean).toBeCloseTo(1, 6);
  });

  it('점수를 무작위로 섞으면 IC가 0 근처로 무너진다 (음성 대조군)', () => {
    let s = 999 >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const shuffled = records.map(r => ({ ...r, technical: rnd() }));
    const res = computeIC(groupByDate(shuffled, 'technical', 'r20'), { minCrossSection: 10 });
    expect(Math.abs(res.mean)).toBeLessThan(0.1);
  });

  it('추세 축도 같은 배관을 탄다 (이산 점수라 동순위가 많다)', () => {
    const res = computeIC(groupByDate(records, 'trend', 'r5'), { minCrossSection: 10, lag: 0 });
    expect(res.n).toBeGreaterThan(20);
    expect(Number.isFinite(res.mean)).toBe(true);
  });
});
