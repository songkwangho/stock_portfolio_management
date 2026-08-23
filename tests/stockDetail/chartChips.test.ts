// 차트 칩 + "지금 눈에 띄는 것" 배너 — 관찰형 고정 + 금지어 전수 스윕.
import { describe, it, expect } from 'vitest';
import {
  CHIPS, DEFAULT_ON, MOBILE_PANEL_LIMIT, chartNotices, NOTICE_EMPTY,
  OVERLAY_MIN_BARS, PANEL_MIN_BARS, MACD_SIGNAL_MIN_BARS, STOCH_D_MIN_BARS,
  OVERLAY_LEGEND, PANEL_LABEL, panelSampleNotice, type PanelIndicatorKey,
} from '@/lib/stockDetail/chartChips';
import { toBars, smaSeries } from '@/lib/stockDetail/chartSeries';
import {
  rsiSeries, macdSeries, bollingerSeries, stochasticSeries, regressionChannel, volumeMaSeries,
} from '@/lib/stockDetail/indicatorSeries';
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

// 최근 상장·확대적재 종목(스트라드비젼 475040 ≈ 35거래일 등)에서 실제로 걸리는 문턱.
// 표의 숫자와 계산 함수가 갈리면 안내 문구가 거짓이 되고, 범례에 없는 선의 표식이 남는다.
describe('표본 문턱 ↔ 실제 계산 (문구·범례의 근거)', () => {
  // 종가가 다 같으면 회귀·표준편차가 0인 경계라 점 유무만 보기엔 오히려 안전하지만,
  // 실제 형태에서 재기 위해 완만한 추세 + 매일 다른 거래량을 준다.
  const bars = (n: number) => toBars(mk(n, i => 10000 + i * 13, i => 10000 + i * 7));

  const overlays: Array<[keyof typeof OVERLAY_MIN_BARS, (n: number) => number]> = [
    ['sma5', n => smaSeries(bars(n), 5).length],
    ['sma20', n => smaSeries(bars(n), 20).length],
    ['sma60', n => smaSeries(bars(n), 60).length],
    ['bollinger', n => bollingerSeries(bars(n)).upper.length],
    ['lrc', n => regressionChannel(bars(n), 20).mid.length],
  ];
  for (const [key, count] of overlays) {
    it(`${key}: ${OVERLAY_MIN_BARS[key]}봉에서 생기고 그 직전엔 없다`, () => {
      const min = OVERLAY_MIN_BARS[key];
      expect(count(min - 1)).toBe(0);
      expect(count(min)).toBeGreaterThan(0);
    });
  }

  const panels: Array<[PanelIndicatorKey, (n: number) => number]> = [
    ['rsi', n => rsiSeries(bars(n)).length],
    ['macd', n => macdSeries(bars(n)).macd.length],
    ['stochastic', n => stochasticSeries(bars(n)).k.length],
  ];
  for (const [key, count] of panels) {
    it(`${key}: ${PANEL_MIN_BARS[key]}봉에서 패널이 그려지고 그 직전엔 안내로 빠진다`, () => {
      const min = PANEL_MIN_BARS[key];
      expect(count(min - 1)).toBe(0);
      expect(count(min)).toBeGreaterThan(0);
    });
  }

  // 보조선은 주선보다 늦게 붙는다 → 그 사이 구간은 안내가 아니라 **라벨**로 처리한다.
  // (안내로 처리하면 "%K가 그려지는데 못 그린다"는 거짓말이 된다.)
  it('MACD 시그널선은 본선보다 늦다 — 그 사이엔 본선만 그려진다', () => {
    expect(macdSeries(bars(MACD_SIGNAL_MIN_BARS - 1)).signal.length).toBe(0);
    expect(macdSeries(bars(MACD_SIGNAL_MIN_BARS - 1)).macd.length).toBeGreaterThan(0);
    expect(macdSeries(bars(MACD_SIGNAL_MIN_BARS)).signal.length).toBeGreaterThan(0);
    expect(MACD_SIGNAL_MIN_BARS).toBeGreaterThan(PANEL_MIN_BARS.macd);
  });

  it('스토캐스틱 %D는 %K보다 늦다 — 그 사이엔 %K만 그려진다', () => {
    expect(stochasticSeries(bars(STOCH_D_MIN_BARS - 1)).d.length).toBe(0);
    expect(stochasticSeries(bars(STOCH_D_MIN_BARS - 1)).k.length).toBeGreaterThan(0);
    expect(stochasticSeries(bars(STOCH_D_MIN_BARS)).d.length).toBeGreaterThan(0);
    expect(STOCH_D_MIN_BARS).toBeGreaterThan(PANEL_MIN_BARS.stochastic);
  });

  it('거래량 평균선이 없으면 라벨에서 "20일 평균"을 뺄 근거가 있다', () => {
    expect(volumeMaSeries(bars(19), 20).length).toBe(0);
    expect(volumeMaSeries(bars(20), 20).length).toBeGreaterThan(0);
  });

  it('짧은 히스토리 종목(≈35거래일)에서 빠지는 건 60일선뿐 — 5·20일선은 그려진다', () => {
    const b = bars(35);
    expect(smaSeries(b, 5).length).toBeGreaterThan(0);
    expect(smaSeries(b, 20).length).toBeGreaterThan(0);
    expect(smaSeries(b, 60).length).toBe(0);
    // 서브패널 3종은 이 길이에서 전부 계산된다 → 안내가 아니라 정상 렌더가 맞다.
    expect(rsiSeries(b).length).toBeGreaterThan(0);
    expect(macdSeries(b).macd.length).toBeGreaterThan(0);
    expect(stochasticSeries(b).k.length).toBeGreaterThan(0);
  });
});

describe('panelSampleNotice — 사실만 (필요 거래일 + 현재 거래일)', () => {
  it('지표별 조사를 규칙이 아니라 표로 고정한다 (RSI는 / 스토캐스틱은)', () => {
    expect(panelSampleNotice('rsi', 8)).toContain('RSI는 최소 15거래일');
    expect(panelSampleNotice('stochastic', 8)).toContain('스토캐스틱은 최소 14거래일');
    expect(panelSampleNotice('macd', 8)).toContain('MACD는 최소 26거래일');
  });

  it('현재 표본 수를 그대로 말한다 — "부족하다"로 뭉개지 않는다', () => {
    expect(panelSampleNotice('rsi', 8)).toContain('지금은 8거래일치');
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
    ...Object.values(OVERLAY_LEGEND),
    ...Object.values(PANEL_LABEL),
    // 표본 부족 안내 — 문턱 근처 전 조합
    ...(['rsi', 'macd', 'stochastic'] as PanelIndicatorKey[])
      .flatMap(k => [1, 5, 13, 25, 33].map(n => panelSampleNotice(k, n))),
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

  it('스윕이 공회전하지 않는다 — 실제 배너·범례·안내 문구가 모였다', () => {
    expect(surfaces.length).toBeGreaterThan(15);
    expect(surfaces.some(t => t.includes('거래량이 평소의'))).toBe(true);
    expect(surfaces.some(t => t.includes('볼린저'))).toBe(true);
    expect(surfaces.some(t => t.includes('최근 5거래일'))).toBe(true);
    expect(surfaces.some(t => t.includes('아직 그릴 수 없어요'))).toBe(true);
    expect(surfaces.some(t => t.includes('시그널선은'))).toBe(true);
  });

  for (const word of FORBIDDEN_CHART) {
    it(`'${word}' 미포함`, () => {
      const hit = surfaces.filter(t => t.includes(word));
      expect(hit, `금지어 '${word}' 발견: ${hit.join(' | ')}`).toEqual([]);
    });
  }
});
