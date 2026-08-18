// 지표 시계열 — **순수 함수**. 차트 오버레이용.
//
// ⚠️ 값 SSOT: RSI·MACD·볼린저는 `server/domains/analysis/indicators.js`의 **공식을 그대로**
//    롤링화한 것이다. `/api/stock/:code/indicators`는 최신값 1개만 주므로(시계열 아님)
//    오버레이는 클라에서 재계산할 수밖에 없는데, 공식이 조금이라도 다르면 차트의 선과
//    IndicatorPanel의 숫자가 어긋난다 — 사용자에겐 "둘 중 하나는 거짓말"이다.
//    `tests/stockDetail/indicatorSeries.test.ts`가 pg 스텁으로 프로덕션 함수를 직접 호출해
//    **마지막 값 일치**를 고정한다.
//
// ⚠️ 프로덕션 공식의 특이점을 **고치지 않는다**(고치면 SSOT가 깨진다):
//    · RSI: Wilder 평활이 아니라 최근 14일 단순 평균
//    · MACD signal: EMA9가 아니라 macdLine의 **SMA9**
//    · 볼린저: 표본표준편차가 아니라 모표준편차(÷20)
import type { Bar, Point } from './chartSeries';

/** 프로덕션 `indicators.js`의 ema — 앞 period개 SMA로 시드한 뒤 끝까지 흐른다. */
function ema(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let v = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) v = data[i] * k + v * (1 - k);
  return v;
}

/**
 * RSI(14) 시계열. 프로덕션과 동일 — 최근 14일 상승합/하락합의 **단순 평균** 비.
 * 손실이 0이면 100(프로덕션 분기 보존).
 */
export function rsiSeries(bars: Bar[], period = 14): Point[] {
  const out: Point[] = [];
  const p = bars.map(b => b.close);
  for (let i = period; i < p.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = p[j] - p[j - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    const v = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ time: bars[i].time, value: parseFloat(v.toFixed(1)) });
  }
  return out;
}

export type MacdSeries = { macd: Point[]; signal: Point[]; histogram: { time: string; value: number; color: string }[] };

/**
 * MACD(12, 26, signal=macdLine의 SMA9). 각 봉 t의 macdLine은 **접두 slice(0, t+1)** 로 계산한다
 * — 프로덕션 `recentMacds` 루프가 정확히 그 형태다.
 *
 * ⚠️ 히스토그램 색은 방향색을 쓰지 않는다(무채색 2단). 지표선에 방향색을 칠하면
 *    "양수=사라"로 읽힌다 — 3.13 방향색 규칙.
 */
export function macdSeries(bars: Bar[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const p = bars.map(b => b.close);
  const macd: Point[] = [];
  for (let i = slow - 1; i < p.length; i++) {
    const slice = p.slice(0, i + 1);
    macd.push({ time: bars[i].time, value: parseFloat((ema(slice, fast) - ema(slice, slow)).toFixed(0)) });
  }
  const signal: Point[] = [];
  for (let i = signalPeriod - 1; i < macd.length; i++) {
    const mean = macd.slice(i - signalPeriod + 1, i + 1).reduce((a, m) => a + m.value, 0) / signalPeriod;
    signal.push({ time: macd[i].time, value: parseFloat(mean.toFixed(0)) });
  }
  const sigByTime = new Map(signal.map(s => [s.time, s.value]));
  const histogram = macd
    .filter(m => sigByTime.has(m.time))
    .map(m => {
      const h = parseFloat((m.value - (sigByTime.get(m.time) as number)).toFixed(0));
      return { time: m.time, value: h, color: h >= 0 ? '#6E7076' : '#C9CAC6' };
    });
  return { macd, signal, histogram };
}

export type BollingerSeries = { upper: Point[]; middle: Point[]; lower: Point[] };

/** 볼린저(20, 2σ). 프로덕션과 동일 — **모표준편차(÷period)** + Math.round. */
export function bollingerSeries(bars: Bar[], period = 20, mult = 2): BollingerSeries {
  const upper: Point[] = [], middle: Point[] = [], lower: Point[] = [];
  const p = bars.map(b => b.close);
  for (let i = period - 1; i < p.length; i++) {
    const w = p.slice(i - period + 1, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(w.reduce((a, x) => a + (x - mean) ** 2, 0) / period);
    const t = bars[i].time;
    upper.push({ time: t, value: Math.round(mean + mult * sd) });
    middle.push({ time: t, value: Math.round(mean) });
    lower.push({ time: t, value: Math.round(mean - mult * sd) });
  }
  return { upper, middle, lower };
}

export type StochasticSeries = { k: Point[]; d: Point[] };

/**
 * 스토캐스틱 %K(14) · %D(3). 프로덕션에 없는 **신규** 지표라 표준 정의를 쓴다:
 *   %K = (종가 − 기간 최저) / (기간 최고 − 기간 최저) × 100,  %D = %K의 SMA3
 * 기간 고·저가 같으면(무거래 등) 50으로 둔다 — 0으로 두면 "바닥"으로 오독된다.
 */
export function stochasticSeries(bars: Bar[], kPeriod = 14, dPeriod = 3): StochasticSeries {
  const k: Point[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    const w = bars.slice(i - kPeriod + 1, i + 1);
    const hi = Math.max(...w.map(b => b.high));
    const lo = Math.min(...w.map(b => b.low));
    const v = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
    k.push({ time: bars[i].time, value: parseFloat(v.toFixed(1)) });
  }
  const d: Point[] = [];
  for (let i = dPeriod - 1; i < k.length; i++) {
    const mean = k.slice(i - dPeriod + 1, i + 1).reduce((a, x) => a + x.value, 0) / dPeriod;
    d.push({ time: k[i].time, value: parseFloat(mean.toFixed(1)) });
  }
  return { k, d };
}

export type RegressionChannel = { mid: Point[]; upper: Point[]; lower: Point[] };

/**
 * 선형회귀채널(LRC) — 최근 `period`봉 종가에 최소제곱 직선 + 잔차 표준편차 ±`mult`σ.
 * 채널은 **회귀 구간에만** 그린다(구간 밖으로 연장하면 예측선으로 읽힌다).
 */
export function regressionChannel(bars: Bar[], period = 20, mult = 2): RegressionChannel {
  const empty = { mid: [], upper: [], lower: [] };
  if (bars.length < period || period < 2) return empty;
  const w = bars.slice(-period);
  const n = period;
  const sumX = (n - 1) * n / 2;
  const sumXX = (n - 1) * n * (2 * n - 1) / 6;
  const sumY = w.reduce((a, b) => a + b.close, 0);
  const sumXY = w.reduce((a, b, i) => a + i * b.close, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return empty;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const fit = (i: number) => intercept + slope * i;
  // 잔차 모표준편차 — 볼린저와 같은 관례로 맞춘다(둘을 나란히 보므로 정의가 갈리면 안 된다).
  const sd = Math.sqrt(w.reduce((a, b, i) => a + (b.close - fit(i)) ** 2, 0) / n);
  const mid: Point[] = [], upper: Point[] = [], lower: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = w[i].time, f = fit(i);
    mid.push({ time: t, value: Math.round(f) });
    upper.push({ time: t, value: Math.round(f + mult * sd) });
    lower.push({ time: t, value: Math.round(f - mult * sd) });
  }
  return { mid, upper, lower };
}

export type PivotLevels = { support: number | null; resistance: number | null; window: number };

/**
 * 지지·저항 — 최근 `window`봉의 **피벗 고/저**.
 *
 * 정의를 단순하게 고정한다: 좌우 `strength`봉보다 높은 고가 = 피벗 고, 낮은 저가 = 피벗 저.
 * 그중 현재가보다 위에 있는 가장 가까운 피벗 고 = 저항, 아래 가장 가까운 피벗 저 = 지지.
 * (현재가를 기준으로 잡지 않으면 "이미 지나간 선"이 그려져 의미가 없다.)
 */
export function pivotLevels(bars: Bar[], window = 60, strength = 2): PivotLevels {
  const w = bars.slice(-window);
  if (w.length < strength * 2 + 1) return { support: null, resistance: null, window: w.length };
  const price = w[w.length - 1].close;
  const highs: number[] = [], lows: number[] = [];
  for (let i = strength; i < w.length - strength; i++) {
    const around = w.slice(i - strength, i + strength + 1);
    if (w[i].high >= Math.max(...around.map(b => b.high))) highs.push(w[i].high);
    if (w[i].low <= Math.min(...around.map(b => b.low))) lows.push(w[i].low);
  }
  const above = highs.filter(h => h > price).sort((a, b) => a - b);
  const below = lows.filter(l => l < price).sort((a, b) => b - a);
  return { resistance: above[0] ?? null, support: below[0] ?? null, window: w.length };
}

/** 거래량 20일 평균선 — 배너의 "평소의 N배" 근거와 **같은 창**을 쓴다. */
export function volumeMaSeries(bars: Bar[], period = 20): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].volume;
    if (i >= period) sum -= bars[i - period].volume;
    if (i >= period - 1) out.push({ time: bars[i].time, value: Math.round(sum / period) });
  }
  return out;
}
