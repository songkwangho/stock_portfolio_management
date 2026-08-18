// 지표 시계열 — **값 SSOT 동치**(수용기준 3) + 신규 지표 단위 테스트.
//
// `/api/stock/:code/indicators`는 최신값 1개만 주므로 오버레이는 클라에서 재계산한다.
// 공식이 조금이라도 다르면 **차트의 선과 IndicatorPanel의 숫자가 어긋난다** — 사용자에겐
// 둘 중 하나가 거짓말이다. 그래서 프로덕션 `calculateIndicators`를 pg 스텁으로 직접 호출해
// 마지막 값 일치를 고정한다(세션 1 computeTechnicalFromHistory 동치와 같은 규율).
import { describe, it, expect } from 'vitest';
import { calculateIndicators } from '@/server/domains/analysis/indicators';
import { toBars, smaSeries } from '@/lib/stockDetail/chartSeries';
import {
  rsiSeries, macdSeries, bollingerSeries, stochasticSeries,
  regressionChannel, pivotLevels, volumeMaSeries,
} from '@/lib/stockDetail/indicatorSeries';
import type { HistoryEntry } from '@/types/stock';

// 결정적 의사난수 — Math.random 금지(재현성).
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

function makeHistory(n: number, seed: number): HistoryEntry[] {
  const rand = rng(seed);
  const out: HistoryEntry[] = [];
  let p = 50000;
  for (let i = 0; i < n; i++) {
    p = Math.max(1000, Math.round(p * (1 + (rand() - 0.5) * 0.07)));
    const d = new Date(Date.UTC(2024, 0, 1 + i));
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const high = Math.round(p * (1 + rand() * 0.03));
    const low = Math.round(p * (1 - rand() * 0.03));
    out.push({ date: ymd, open: Math.round((high + low) / 2), high, low, price: p, volume: Math.round(1000 + rand() * 50000) } as HistoryEntry);
  }
  return out;
}

// pg는 NUMERIC/BIGINT를 **문자열**로 준다 → 프로덕션의 Number() 캐스팅 경로까지 태운다.
function pgStub(history: HistoryEntry[]) {
  return {
    query: async () => ({
      rows: history.map(h => ({
        date: h.date,
        price: String(h.price), open: String(h.open),
        high: String(h.high), low: String(h.low), volume: String(h.volume),
      })),
    }),
  };
}

describe('값 SSOT — 클라 롤링 시계열의 마지막 값 == 프로덕션 calculateIndicators', () => {
  // 여러 시드로 스윕 — 한 시계열에서 우연히 맞는 걸 배제한다.
  for (const seed of [1, 7, 20260819, 999]) {
    it(`seed ${seed} — RSI·MACD·볼린저 전부 일치`, async () => {
      const history = makeHistory(120, seed);
      const bars = toBars(history);
      const prod = await calculateIndicators(pgStub(history), '005930');

      const rsi = rsiSeries(bars);
      expect(rsi.length).toBeGreaterThan(0);
      expect(rsi[rsi.length - 1].value).toBe(prod.rsi);

      const m = macdSeries(bars);
      expect(m.macd[m.macd.length - 1].value).toBe(prod.macd.macdLine);
      expect(m.signal[m.signal.length - 1].value).toBe(prod.macd.signal);
      expect(m.histogram[m.histogram.length - 1].value).toBe(prod.macd.histogram);

      const b = bollingerSeries(bars);
      expect(b.upper[b.upper.length - 1].value).toBe(prod.bollinger.upper);
      expect(b.middle[b.middle.length - 1].value).toBe(prod.bollinger.middle);
      expect(b.lower[b.lower.length - 1].value).toBe(prod.bollinger.lower);
    });
  }

  it('비공회전 — 프로덕션 값이 실제로 서로 다른 시드에서 달라진다', async () => {
    const a = await calculateIndicators(pgStub(makeHistory(120, 1)), 'x');
    const b = await calculateIndicators(pgStub(makeHistory(120, 7)), 'x');
    expect(a.rsi).not.toBe(b.rsi);
    expect(a.bollinger.upper).not.toBe(b.bollinger.upper);
  });

  it('RSI 손실 0이면 100 (프로덕션 분기 보존)', () => {
    const rising = makeHistory(30, 3).map((h, i) => ({ ...h, price: 10000 + i * 100 }));
    const s = rsiSeries(toBars(rising));
    expect(s[s.length - 1].value).toBe(100);
  });
});

describe('시계열 형태', () => {
  const bars = toBars(makeHistory(120, 42));

  it('표본 미달 앞 구간은 점을 만들지 않는다 (가짜 선 방지)', () => {
    expect(rsiSeries(bars).length).toBe(bars.length - 14);
    expect(bollingerSeries(bars).upper.length).toBe(bars.length - 19);
    expect(macdSeries(bars).macd.length).toBe(bars.length - 25);
    expect(stochasticSeries(bars).k.length).toBe(bars.length - 13);
  });

  it('데이터가 짧으면 빈 배열 (던지지 않는다)', () => {
    const few = toBars(makeHistory(5, 1));
    expect(rsiSeries(few)).toEqual([]);
    expect(bollingerSeries(few).upper).toEqual([]);
    expect(macdSeries(few).macd).toEqual([]);
    expect(regressionChannel(few).mid).toEqual([]);
  });

  it('볼린저 중심선 == 20일 SMA — 겹쳐 그리기를 생략하는 근거', () => {
    // ChartSection은 이평선 칩이 켜져 있으면 볼린저 중심선을 그리지 않는다.
    // 그 근거가 "두 선이 같은 값"이라는 것이므로, 근거가 깨지면 선 하나가 조용히 사라진다.
    const mid = bollingerSeries(bars).middle;
    const sma20 = smaSeries(bars, 20);
    expect(mid).toEqual(sma20);
  });

  it('볼린저는 upper ≥ middle ≥ lower', () => {
    const b = bollingerSeries(bars);
    for (let i = 0; i < b.upper.length; i++) {
      expect(b.upper[i].value).toBeGreaterThanOrEqual(b.middle[i].value);
      expect(b.middle[i].value).toBeGreaterThanOrEqual(b.lower[i].value);
    }
  });

  it('MACD 히스토그램 색은 무채색 2단 — 방향색 금지(3.13)', () => {
    const h = macdSeries(bars).histogram;
    const colors = new Set(h.map(x => x.color));
    for (const c of colors) expect(['#6E7076', '#C9CAC6']).toContain(c);
    // 상승색(#D91C1C)·하락색(#1B5FD0)이 새어 들어오지 않았는지
    expect([...colors].join()).not.toContain('D91C1C');
    expect([...colors].join()).not.toContain('1B5FD0');
  });
});

describe('스토캐스틱', () => {
  it('%K는 0~100 범위', () => {
    const k = stochasticSeries(toBars(makeHistory(120, 11))).k;
    for (const p of k) { expect(p.value).toBeGreaterThanOrEqual(0); expect(p.value).toBeLessThanOrEqual(100); }
  });

  it('종가가 기간 최고면 100, 최저면 0', () => {
    const flat = makeHistory(20, 5).map((h, i) => ({ ...h, high: 200, low: 100, open: 150, price: i === 19 ? 200 : 150 }));
    const k = stochasticSeries(toBars(flat)).k;
    expect(k[k.length - 1].value).toBe(100);
    const flatLow = flat.map((h, i) => ({ ...h, price: i === 19 ? 100 : 150 }));
    expect(stochasticSeries(toBars(flatLow)).k.slice(-1)[0].value).toBe(0);
  });

  it('기간 고·저가 같으면 50 — 0으로 두면 "바닥"으로 오독된다', () => {
    const same = makeHistory(20, 6).map(h => ({ ...h, high: 100, low: 100, open: 100, price: 100 }));
    const k = stochasticSeries(toBars(same)).k;
    expect(k[k.length - 1].value).toBe(50);
  });

  it('%D는 %K의 SMA3', () => {
    const s = stochasticSeries(toBars(makeHistory(60, 12)));
    const last3 = s.k.slice(-3).reduce((a, x) => a + x.value, 0) / 3;
    expect(s.d[s.d.length - 1].value).toBe(parseFloat(last3.toFixed(1)));
  });
});

describe('회귀채널 LRC', () => {
  it('완전 직선이면 채널 폭 0 · 중심선이 데이터와 일치', () => {
    const linear = makeHistory(40, 8).map((h, i) => ({ ...h, price: 10000 + i * 100 }));
    const c = regressionChannel(toBars(linear), 20);
    expect(c.mid).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(c.upper[i].value).toBe(c.mid[i].value);
      expect(c.lower[i].value).toBe(c.mid[i].value);
    }
    // 마지막 점은 마지막 종가와 같아야 한다(직선 적합)
    expect(c.mid[19].value).toBe(10000 + 39 * 100);
  });

  it('상승 직선이면 기울기 양수 · 하락이면 음수', () => {
    const up = regressionChannel(toBars(makeHistory(40, 9).map((h, i) => ({ ...h, price: 10000 + i * 100 }))), 20);
    const down = regressionChannel(toBars(makeHistory(40, 9).map((h, i) => ({ ...h, price: 20000 - i * 100 }))), 20);
    expect(up.mid[19].value).toBeGreaterThan(up.mid[0].value);
    expect(down.mid[19].value).toBeLessThan(down.mid[0].value);
  });

  it('회귀 구간 밖으로 연장하지 않는다 — 예측선으로 읽히면 안 된다', () => {
    const bars = toBars(makeHistory(60, 10));
    const c = regressionChannel(bars, 20);
    expect(c.mid).toHaveLength(20);
    expect(c.mid[0].time).toBe(bars[bars.length - 20].time);
    expect(c.mid[19].time).toBe(bars[bars.length - 1].time);
  });

  it('채널이 잔차를 감싼다 — upper ≥ mid ≥ lower', () => {
    const c = regressionChannel(toBars(makeHistory(60, 13)), 20);
    for (let i = 0; i < c.mid.length; i++) {
      expect(c.upper[i].value).toBeGreaterThanOrEqual(c.mid[i].value);
      expect(c.lower[i].value).toBeLessThanOrEqual(c.mid[i].value);
    }
  });
});

describe('지지·저항 (피벗)', () => {
  it('저항은 현재가 위 · 지지는 현재가 아래', () => {
    const bars = toBars(makeHistory(120, 14));
    const p = pivotLevels(bars);
    const price = bars[bars.length - 1].close;
    if (p.resistance != null) expect(p.resistance).toBeGreaterThan(price);
    if (p.support != null) expect(p.support).toBeLessThan(price);
  });

  it('현재가 위/아래에 피벗이 없으면 null — 없는 선을 그리지 않는다', () => {
    // 단조 상승이면 현재가가 최고라 저항이 없다
    const up = toBars(makeHistory(80, 15).map((h, i) => ({ ...h, price: 10000 + i * 100, high: 10000 + i * 100, low: 9990 + i * 100 })));
    expect(pivotLevels(up).resistance).toBeNull();
  });

  it('표본이 너무 짧으면 둘 다 null', () => {
    expect(pivotLevels(toBars(makeHistory(3, 16)))).toEqual({ support: null, resistance: null, window: 3 });
  });
});

describe('거래량 20일 평균', () => {
  it('배너의 "평소의 N배"와 **같은 창**(20)을 쓴다', () => {
    const bars = toBars(makeHistory(60, 17));
    const ma = volumeMaSeries(bars, 20);
    const tail = bars.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
    expect(ma[ma.length - 1].value).toBe(Math.round(tail));
  });

  it('롤링 합이 순진한 재계산과 같다', () => {
    const bars = toBars(makeHistory(60, 18));
    const fast = volumeMaSeries(bars, 20);
    const naive = bars.map((b, i) => (i >= 19
      ? { time: b.time, value: Math.round(bars.slice(i - 19, i + 1).reduce((a, x) => a + x.volume, 0) / 20) }
      : null)).filter(Boolean);
    expect(fast).toEqual(naive);
  });
});
