import { describe, it, expect } from 'vitest';
import { computePriceStats, summarizeDisclosures, isoFromYmd, ymdOf, shiftIso, daysBetween } from '@/server/domains/attention/facts';

type Row = { date: string; price: number | null; volume: number | null };
// n개 거래일 행 생성 — price/volume은 인덱스별 오버라이드.
// volumes를 넘기면 그 값을 그대로 쓴다(명시적 null 포함). 안 넘기면 전부 1000.
const hist = (prices: (number | null)[], volumes?: (number | null)[]): Row[] =>
  prices.map((p, i) => ({ date: `2026080${(i % 9) + 1}`, price: p, volume: volumes ? volumes[i] : 1000 }));

describe('attention facts — 가격 통계', () => {
  it('5거래일 수익률 — 마지막 종가 vs 5거래일 전 종가', () => {
    // index: 0..6 (7행) → base = closes[len-1-5] = index 1 = 100, last = 110 → +10%
    const st = computePriceStats(hist([90, 100, 101, 102, 103, 104, 110]));
    expect(st.ret5d).toBe(10);
    expect(st.close).toBe(110);
  });

  it('행이 6개 미만이면 수익률 null — 추정하지 않는다', () => {
    expect(computePriceStats(hist([100, 101, 102, 103, 104])).ret5d).toBeNull();
    expect(computePriceStats(hist([100, 101, 102, 103, 104, 105])).ret5d).toBe(5);
    expect(computePriceStats([]).ret5d).toBeNull();
    expect(computePriceStats([]).close).toBeNull();
  });

  it('결측·0 종가는 계산에서 제외(0 나눗셈·거짓 급변 방지)', () => {
    const st = computePriceStats(hist([100, null, 0, 100, 100, 100, 100, 120]));
    // 유효 종가만: [100,100,100,100,100,120] → base=100, last=120
    expect(st.ret5d).toBe(20);
    expect(st.close).toBe(120);
  });

  it('거래량 배수 — 최신 ÷ 직전 20거래일 평균', () => {
    const prices = Array(7).fill(1000);
    const volumes = [100, 100, 100, 100, 100, 100, 250];
    expect(computePriceStats(hist(prices, volumes)).volSurge).toBe(2.5);
  });

  it('거래량 표본 부족·결측이면 null', () => {
    expect(computePriceStats(hist(Array(5).fill(1000), [10, 10, 10, 10, 10])).volSurge).toBeNull();
    expect(computePriceStats(hist(Array(7).fill(1000), Array(7).fill(null))).volSurge).toBeNull();
  });
});

describe('attention facts — 공시 집계', () => {
  it('건수·최신 경과일·중립 라벨(최대 3)', () => {
    const s = summarizeDisclosures([
      { rcept_dt: '20260801', category: 'earnings' },
      { rcept_dt: '20260806', category: 'dividend' },
      { rcept_dt: '20260805', category: 'treasury' },
      { rcept_dt: '20260804', category: 'merger' },
    ], '2026-08-07');
    expect(s.count).toBe(4);
    expect(s.latestDaysAgo).toBe(1);
    expect(s.categories).toHaveLength(3);
    // events는 라벨과 달리 **전건**을 남긴다 — score.js가 건별 (카테고리, 경과일)로 가중한다.
    expect(s.events).toHaveLength(4);
    expect(s.events).toContainEqual({ category: 'dividend', daysAgo: 1 });
    expect(s.events).toContainEqual({ category: 'earnings', daysAgo: 6 });
    expect(s.categories).toContain('실적');
  });

  it('당일 공시는 0일, 미래 날짜는 0으로 클램프', () => {
    expect(summarizeDisclosures([{ rcept_dt: '20260807', category: 'other' }], '2026-08-07').latestDaysAgo).toBe(0);
    expect(summarizeDisclosures([{ rcept_dt: '20260809', category: 'other' }], '2026-08-07').latestDaysAgo).toBe(0);
  });

  it('공시 없음은 0건 — 정상 경로(에러 아님)', () => {
    expect(summarizeDisclosures([], '2026-08-07')).toEqual({ count: 0, latestDaysAgo: null, categories: [], events: [] });
    expect(summarizeDisclosures(null, '2026-08-07').count).toBe(0);
  });

  it('분류 없는 공시(category null)도 중립 라벨로 집계', () => {
    const s = summarizeDisclosures([{ rcept_dt: '20260807', category: null }], '2026-08-07');
    expect(s.categories).toEqual(['기타']);
  });
});

describe('attention facts — 날짜 헬퍼', () => {
  it('YYYYMMDD ↔ ISO 변환·이동·차이', () => {
    expect(isoFromYmd('20260807')).toBe('2026-08-07');
    expect(ymdOf('2026-08-07')).toBe('20260807');
    expect(shiftIso('2026-08-07', -14)).toBe('2026-07-24');
    expect(daysBetween('2026-08-01', '2026-08-07')).toBe(6);
    // 월 경계를 넘어가도 달력 기준으로 센다.
    expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1);
  });
});
