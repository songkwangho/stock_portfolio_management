// Phase 1 — 차트 시리즈 변환(순수). lightweight-charts 전환의 데이터 계약을 고정한다.
import { describe, it, expect } from 'vitest';
import { toBars, smaSeries, volumeSeries, toIsoDate, formatPriceAxis, formatVolumeAxis } from '@/lib/stockDetail/chartSeries';
import type { HistoryEntry } from '@/types/stock';

const h = (date: string, o: number, hi: number, lo: number, c: number, v = 1000): HistoryEntry =>
  ({ date, open: o, high: hi, low: lo, price: c, volume: v } as HistoryEntry);

describe('toIsoDate', () => {
  it('YYYYMMDD → YYYY-MM-DD', () => {
    expect(toIsoDate('20260814')).toBe('2026-08-14');
  });
});

describe('toBars', () => {
  it('OHLC를 그대로 옮긴다 (price → close)', () => {
    const b = toBars([h('20260101', 100, 110, 90, 105)]);
    expect(b).toEqual([{ time: '2026-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 }]);
  });

  it('OHLC 결측·0 행은 **버린다** — 0으로 채우면 캔들이 바닥까지 그려져 축이 망가진다', () => {
    const rows = [
      h('20260101', 100, 110, 90, 105),
      { date: '20260102', price: 105, volume: 10 } as HistoryEntry,      // open/high/low 없음
      h('20260103', 0, 110, 90, 105),                                   // open 0
      h('20260106', 100, 110, 90, 106),
    ];
    expect(toBars(rows).map(b => b.time)).toEqual(['2026-01-01', '2026-01-06']);
  });

  it('날짜 오름차순으로 정렬한다 — 정렬 안 된 데이터는 엔진이 던진다', () => {
    const b = toBars([h('20260103', 1, 2, 1, 2), h('20260101', 1, 2, 1, 2), h('20260102', 1, 2, 1, 2)]);
    expect(b.map(x => x.time)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('날짜 형식이 아니면 버린다', () => {
    expect(toBars([h('2026-01-01', 1, 2, 1, 2)])).toEqual([]);
  });

  it('빈 입력·undefined에 던지지 않는다', () => {
    expect(toBars(undefined)).toEqual([]);
    expect(toBars([])).toEqual([]);
  });

  it('거래량 결측은 0 — 캔들과 달리 막대 높이 0은 정직한 표현이다', () => {
    const b = toBars([{ date: '20260101', open: 1, high: 2, low: 1, price: 2 } as HistoryEntry]);
    expect(b[0].volume).toBe(0);
  });
});

describe('smaSeries', () => {
  const bars = toBars(Array.from({ length: 25 }, (_, i) => h(`202601${String(i + 1).padStart(2, '0')}`, 100, 100, 100, 100 + i)));

  it('표본이 찬 시점부터만 점을 만든다 — 앞 구간을 채우면 가짜 선이 그려진다', () => {
    const s5 = smaSeries(bars, 5);
    expect(s5.length).toBe(bars.length - 4);
    expect(s5[0].time).toBe(bars[4].time);
  });

  it('기존 ChartSection·프로덕션 getSMA와 같은 정의 — 최근 N개 평균을 Math.round', () => {
    const s5 = smaSeries(bars, 5);
    // bars[4] 종가 = 100..104 → 평균 102
    expect(s5[0].value).toBe(102);
    const last = s5[s5.length - 1];
    const tail = bars.slice(-5).reduce((a, b) => a + b.close, 0) / 5;
    expect(last.value).toBe(Math.round(tail));
  });

  it('롤링 합 최적화가 순진한 재계산과 같은 값을 낸다', () => {
    for (const p of [5, 20]) {
      const fast = smaSeries(bars, p);
      const naive = bars
        .map((b, i) => (i >= p - 1 ? { time: b.time, value: Math.round(bars.slice(i - p + 1, i + 1).reduce((a, x) => a + x.close, 0) / p) } : null))
        .filter(Boolean);
      expect(fast).toEqual(naive);
    }
  });

  it('표본보다 긴 기간이면 빈 배열', () => {
    expect(smaSeries(bars, 100)).toEqual([]);
    expect(smaSeries(bars, 0)).toEqual([]);
  });
});

describe('volumeSeries — 방향색은 가격 봉에만', () => {
  it('오른 날 빨강 · 내린 날 파랑 (한국 증시 색)', () => {
    const bars = toBars([h('20260101', 100, 110, 90, 105), h('20260102', 105, 110, 90, 100)]);
    const v = volumeSeries(bars);
    expect(v[0].color).toBe('#D91C1C40');
    expect(v[1].color).toBe('#1B5FD040');
  });

  it('보합(종가=시가)은 오른 쪽으로 — 기존 isUp 규칙(>=) 보존', () => {
    const bars = toBars([h('20260101', 100, 110, 90, 100)]);
    expect(volumeSeries(bars)[0].color).toBe('#D91C1C40');
  });
});

describe('축 포맷 — 3.13 규칙 보존', () => {
  it('원 단위 종목이 뭉개지지 않는다', () => {
    expect(formatPriceAxis(2000)).toBe('₩2,000');
    expect(formatPriceAxis(70000)).toBe('₩7만');
    expect(formatPriceAxis(74500)).toBe('₩7.5만');
    expect(formatPriceAxis(150_000_000)).toBe('₩1.5억');
  });

  it('거래량은 한국식 단위', () => {
    expect(formatVolumeAxis(5000)).toBe('5,000');
    expect(formatVolumeAxis(120_000)).toBe('12만');
    expect(formatVolumeAxis(3_500_000)).toBe('3.5백만');
  });
});
