// 차트 시리즈 변환 — **순수 함수**. lightweight-charts 입력 형태로 옮기고 축을 포맷한다.
// 지표 수식은 여기 두지 않는다(indicatorSeries.ts). 이 파일은 표현 계층 접착제다.
import type { HistoryEntry } from '@/types/stock';

export type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number };
export type Point = { time: string; value: number };

/** 'YYYYMMDD' → 'YYYY-MM-DD' (lightweight-charts BusinessDay 문자열) */
export function toIsoDate(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * 히스토리 → 캔들 바. OHLC가 결측인 행은 **버린다**.
 *
 * ⚠️ 0으로 채우지 않는다 — 캔들에서 0은 "바닥까지 떨어진 봉"으로 그려져 축을 통째로 망친다
 *    (기존 Recharts 코드가 `d.open || 0`으로 채우고 있어 Y축 min이 0으로 끌려갔다).
 */
export function toBars(history: HistoryEntry[] | undefined): Bar[] {
  const out: Bar[] = [];
  for (const d of history || []) {
    const close = Number(d.price);
    const open = Number(d.open);
    const high = Number(d.high);
    const low = Number(d.low);
    if (![close, open, high, low].every(v => Number.isFinite(v) && v > 0)) continue;
    if (!/^\d{8}$/.test(String(d.date))) continue;
    out.push({
      time: toIsoDate(String(d.date)),
      open, high, low, close,
      volume: Number.isFinite(Number(d.volume)) ? Number(d.volume) : 0,
    });
  }
  // 날짜 오름차순 보장 — lightweight-charts는 정렬되지 않은 데이터를 던진다.
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * 단순이동평균. 기존 ChartSection·프로덕션 `getSMA`와 **같은 정의**(최근 N개 종가 평균을 Math.round).
 * 표본이 모자란 앞 구간은 점을 만들지 않는다(0이나 종가로 채우면 가짜 선이 그려진다).
 */
export function smaSeries(bars: Bar[], period: number): Point[] {
  const out: Point[] = [];
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: bars[i].time, value: Math.round(sum / period) });
  }
  return out;
}

/** 거래량 바 — 방향색은 여기(가격 봉)에만 허용된다(3.13 규칙). 반투명으로 캔들을 가리지 않게. */
export function volumeSeries(bars: Bar[]): { time: string; value: number; color: string }[] {
  return bars.map(b => ({
    time: b.time,
    value: b.volume,
    color: b.close >= b.open ? '#D91C1C40' : '#1B5FD040',
  }));
}

/** 주가 축 포맷 — 3.13 종목상세 TASK 1의 규칙을 그대로 옮긴다(원 단위 종목이 ₩2k로 뭉개지던 회귀 수정). */
export function formatPriceAxis(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (v >= 100_000_000) return `₩${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) { const m = v / 10_000; return `₩${m % 1 === 0 ? m.toLocaleString() : m.toFixed(1)}만`; }
  return `₩${Math.round(v).toLocaleString()}`;
}

/** 거래량 축 — 한국식 단위(UX-H). */
export function formatVolumeAxis(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}백만`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return Math.round(v).toLocaleString();
}
