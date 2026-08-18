// 차트 칩 + "지금 눈에 띄는 것" 배너 — 관찰형 고정 + 금지어 전수 스윕.
import { describe, it, expect } from 'vitest';
import { CHIPS, DEFAULT_ON, MOBILE_PANEL_LIMIT, chartNotices, NOTICE_EMPTY } from '@/lib/stockDetail/chartChips';
import { toBars } from '@/lib/stockDetail/chartSeries';
import { FORBIDDEN_CHART } from '../forbiddenWords';
import type { HistoryEntry } from '@/types/stock';

function mk(n: number, closeAt: (i: number) => number, volAt: (i: number) => number = () => 10000): HistoryEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    const c = closeAt(i);
    return {
      date: `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`,
      open: c, high: Math.round(c * 1.01), low: Math.round(c * 0.99), price: c, volume: volAt(i),
    } as HistoryEntry;
  });
}

describe('칩 정의', () => {
  it('9종이고 키가 유일하다', () => {
    expect(CHIPS).toHaveLength(9);
    expect(new Set(CHIPS.map(c => c.key)).size).toBe(9);
  });

  it('기본 on은 캔들·이동평균선·볼린저밴드·거래량 4종 (운영자 결정)', () => {
    expect([...DEFAULT_ON].sort()).toEqual(['bollinger', 'candle', 'ma', 'volume']);
  });

  it('나머지 5종은 opt-in — "심플하게 두고 스스로 켜본다"', () => {
    const off = CHIPS.filter(c => !c.defaultOn).map(c => c.key).sort();
    expect(off).toEqual(['lrc', 'macd', 'rsi', 'stochastic', 'supportResistance']);
  });

  it('서브패널 칩은 4종 — 모바일 상한 대상', () => {
    expect(CHIPS.filter(c => c.panel).map(c => c.key).sort()).toEqual(['macd', 'rsi', 'stochastic', 'volume']);
    expect(MOBILE_PANEL_LIMIT).toBe(2);
  });

  it('모든 칩이 도움말 키를 갖는다 — [?]가 빈 팝업을 열면 안 된다', () => {
    for (const c of CHIPS) expect(c.help).toBeTruthy();
  });
});

describe('chartNotices — 관찰 사실만', () => {
  it('표본이 짧으면 빈 배열 (신규상장 등)', () => {
    expect(chartNotices(toBars(mk(3, () => 10000)))).toEqual([]);
  });

  it('거래량 급증을 배수로 말한다', () => {
    const bars = toBars(mk(30, () => 10000, i => (i === 29 ? 300000 : 10000)));
    const n = chartNotices(bars);
    const v = n.find(x => x.key === 'volume')!;
    expect(v.text).toMatch(/거래량이 평소의 [\d.]+배예요/);
  });

  it('거래량이 줄어든 것도 말한다 (사실은 양방향)', () => {
    const bars = toBars(mk(30, () => 10000, i => (i === 29 ? 1000 : 10000)));
    expect(chartNotices(bars).some(x => x.text.includes('줄었어요'))).toBe(true);
  });

  it('5거래일 ±5% 이상만 말한다 — 잔변동은 눈에 띄는 사실이 아니다', () => {
    const big = toBars(mk(30, i => (i >= 25 ? 12000 : 10000)));
    expect(chartNotices(big).some(x => x.key === 'move')).toBe(true);
    const flat = toBars(mk(30, i => 10000 + i));   // 총 +0.3%
    expect(chartNotices(flat).some(x => x.key === 'move')).toBe(false);
  });

  it('5거래일 변동은 부호를 붙이되 해석을 붙이지 않는다', () => {
    const down = toBars(mk(30, i => (i >= 25 ? 8000 : 10000)));
    const m = chartNotices(down).find(x => x.key === 'move')!;
    expect(m.text).toMatch(/^최근 5거래일 -[\d.]+%로 움직였어요$/);
  });

  it('볼린저 상·하단 근처를 말한다', () => {
    // 평평하다가 마지막에 크게 튀면 상단 근처
    const up = toBars(mk(40, i => (i === 39 ? 13000 : 10000 + (i % 2) * 20)));
    expect(chartNotices(up).some(x => x.key === 'bollinger' && x.text.includes('위쪽'))).toBe(true);
    const dn = toBars(mk(40, i => (i === 39 ? 7000 : 10000 + (i % 2) * 20)));
    expect(chartNotices(dn).some(x => x.key === 'bollinger' && x.text.includes('아래쪽'))).toBe(true);
  });

  it('조용한 종목은 아무 사실도 만들지 않는다 → 호출부가 빈 문구를 띄운다', () => {
    // 거래량 일정 · 변동 미미 · 밴드 중앙
    const quiet = toBars(mk(40, i => 10000 + (i % 3), () => 10000));
    expect(chartNotices(quiet)).toEqual([]);
    expect(NOTICE_EMPTY).toContain('눈에 띄는 신호가 없어요');
  });
});

describe('금지어 전수 스윕 — 칩 라벨 + 배너 출력', () => {
  // 광범위 입력에서 나오는 **모든** 배너 문구를 모아 훑는다.
  const surfaces: string[] = [
    ...CHIPS.map(c => c.label),
    NOTICE_EMPTY,
  ];
  const shapes: HistoryEntry[][] = [
    mk(40, () => 10000, i => (i === 39 ? 500000 : 10000)),
    mk(40, () => 10000, i => (i === 39 ? 500 : 10000)),
    mk(40, i => (i >= 35 ? 15000 : 10000)),
    mk(40, i => (i >= 35 ? 6000 : 10000)),
    mk(40, i => (i === 39 ? 14000 : 10000 + (i % 2) * 30)),
    mk(40, i => (i === 39 ? 6000 : 10000 + (i % 2) * 30)),
    mk(40, i => 10000 + i * 3),
    mk(6, () => 10000),
    mk(3, () => 10000),
  ];
  for (const s of shapes) surfaces.push(...chartNotices(toBars(s)).map(n => n.text));

  it('스윕이 공회전하지 않는다 — 실제 배너 문구가 모였다', () => {
    expect(surfaces.length).toBeGreaterThan(15);
    expect(surfaces.some(t => t.includes('거래량이 평소의'))).toBe(true);
    expect(surfaces.some(t => t.includes('볼린저'))).toBe(true);
    expect(surfaces.some(t => t.includes('최근 5거래일'))).toBe(true);
  });

  for (const word of FORBIDDEN_CHART) {
    it(`'${word}' 미포함`, () => {
      const hit = surfaces.filter(t => t.includes(word));
      expect(hit, `금지어 '${word}' 발견: ${hit.join(' | ')}`).toEqual([]);
    });
  }
});
