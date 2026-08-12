import { describe, it, expect } from 'vitest';
import {
  interpretAttribution, computePortfolioTotals, CONCENTRATION_SHARE,
} from '@/lib/portfolio/attribution';
import { FORBIDDEN_ATTRIBUTION } from '../forbiddenWords';
import type { Holding } from '@/types/stock';

// D — 종목별 기여 분해.
//
// 이 모듈의 핵심 계약은 **합산 정확성**이다: Σ contribPP === 대시보드 히어로의 손익률.
// 어긋나면 사용자는 "히어로는 -36%인데 분해 합은 -35%"를 보게 되고, 그 순간 두 숫자 다
// 못 믿게 된다(40행 history를 '52주'라 부르던 사고와 같은 계열).

const h = (code: string, name: string, avgPrice: number, currentPrice: number, quantity: number): Holding =>
  ({ code, name, avgPrice, currentPrice, quantity, value: 0 });

const sumPP = (r: { contributions: { contribPP: number }[] }) =>
  r.contributions.reduce((a, c) => a + c.contribPP, 0);

describe('computePortfolioTotals — 히어로와 공유하는 합계', () => {
  it('대시보드 히어로 식과 같은 값을 낸다', () => {
    const rows = [h('A', 'A', 100, 120, 10), h('B', 'B', 200, 150, 5)];
    const t = computePortfolioTotals(rows);
    expect(t.totalCost).toBe(100 * 10 + 200 * 5);       // 2000
    expect(t.totalAsset).toBe(120 * 10 + 150 * 5);      // 1950
    expect(t.totalPnL).toBe(-50);
    expect(t.profitRatePct).toBeCloseTo(-2.5, 10);
  });

  it('값이 모자란 행은 세지 않고 skippedCount로 남긴다', () => {
    const rows = [
      h('A', 'A', 100, 120, 10),
      { code: 'B', name: 'B', avgPrice: NaN, currentPrice: 100, quantity: 5, value: 0 } as Holding,
      { code: 'C', name: 'C', avgPrice: 100, currentPrice: 100, quantity: 0, value: 0 } as Holding,
    ];
    const t = computePortfolioTotals(rows);
    expect(t.validCount).toBe(1);
    expect(t.skippedCount).toBe(2);
    expect(Number.isFinite(t.profitRatePct)).toBe(true);   // 결측이 NaN으로 번지지 않는다
  });

  it('빈 입력은 0 — 나눗셈이 NaN/Infinity로 새지 않는다', () => {
    for (const input of [[], null, undefined]) {
      const t = computePortfolioTotals(input);
      expect(t.profitRatePct).toBe(0);
      expect(Number.isFinite(t.totalCost)).toBe(true);
    }
  });
});

describe('interpretAttribution — 합산 정확성(SSOT)', () => {
  const cases: Holding[][] = [
    [h('A', 'A', 100, 120, 10), h('B', 'B', 200, 150, 5)],
    [h('A', 'A', 50000, 32000, 3), h('B', 'B', 12000, 16000, 40), h('C', 'C', 9000, 8900, 100)],
    [h('A', 'A', 1000, 1000, 1), h('B', 'B', 2000, 2000, 2)],                     // 손익 0
    [h('A', 'A', 100, 200, 10), h('B', 'B', 100, 50, 20), h('D', 'D', 700, 690, 3)],
  ];

  it.each(cases.map((c, i) => [i, c] as [number, Holding[]]))('구성 %i — Σ contribPP === portfolioProfitRate', (_i, rows) => {
    const r = interpretAttribution(rows);
    expect(r.available).toBe(true);
    expect(Math.abs(sumPP(r) - r.portfolioProfitRate)).toBeLessThan(1e-9);
  });

  it('portfolioProfitRate가 (총자산-원금)/원금 식과 같다 (히어로 식)', () => {
    for (const rows of cases) {
      const t = computePortfolioTotals(rows);
      expect(interpretAttribution(rows).portfolioProfitRate)
        .toBeCloseTo((t.totalAsset - t.totalCost) / t.totalCost * 100, 10);
    }
  });

  it('원금 비중 합은 100%', () => {
    for (const rows of cases) {
      const r = interpretAttribution(rows);
      expect(r.contributions.reduce((a, c) => a + c.weightPct, 0)).toBeCloseTo(100, 8);
    }
  });
});

describe('interpretAttribution — 정렬·가드', () => {
  it('|contribPP| 내림차순 — 부호가 아니라 크기로 정렬한다', () => {
    const r = interpretAttribution([
      h('A', '작은이익', 100, 105, 10),     // +50
      h('B', '큰손실', 100, 60, 10),        // -400
      h('C', '중간이익', 100, 120, 10),     // +200
    ]);
    expect(r.contributions.map(c => c.name)).toEqual(['큰손실', '중간이익', '작은이익']);
    expect(r.topContributor!.name).toBe('큰손실');
  });

  it('동률은 코드 오름차순으로 고정 — 렌더 순서가 흔들리지 않게', () => {
    const r = interpretAttribution([
      h('000200', 'Z', 100, 110, 10),
      h('000100', 'Y', 100, 90, 10),   // 같은 크기, 반대 부호
    ]);
    expect(r.contributions.map(c => c.code)).toEqual(['000100', '000200']);
  });

  it('보유 0·원금 0·결측만 있으면 available:false', () => {
    expect(interpretAttribution([]).available).toBe(false);
    expect(interpretAttribution(null).available).toBe(false);
    expect(interpretAttribution([h('A', 'A', 0, 100, 10)]).available).toBe(false);      // 평단 0
    expect(interpretAttribution([h('A', 'A', 100, 100, 0)]).available).toBe(false);     // 수량 0
    expect(interpretAttribution([
      { code: 'A', name: 'A', avgPrice: 100, currentPrice: NaN, quantity: 1, value: 0 } as Holding,
    ]).available).toBe(false);
  });

  it('1종목은 축약 문장 — 과잉 분해하지 않는다', () => {
    const r = interpretAttribution([h('A', '삼성전자', 100, 80, 10)]);
    expect(r.available).toBe(true);
    expect(r.concentrated).toBe(false);
    expect(r.text).toContain('보유가 1종목이라');
    expect(r.text).toContain('삼성전자');
    expect(r.text).not.toContain('다음은');
    expect(r.portfolioProfitRate).toBeCloseTo(-20, 10);
  });
});

describe('interpretAttribution — 혼합 부호', () => {
  const r = interpretAttribution([
    h('A', '큰손실', 100, 40, 10),    // -600
    h('B', '이익종목', 100, 160, 5),  // +300
    h('C', '소폭', 100, 99, 5),       // -5
  ]);

  it('+ 종목과 - 종목이 모두 표기된다', () => {
    expect(r.text).toContain('큰손실');
    expect(r.text).toContain('이익종목');
    expect(r.contributions.some(c => c.contribPP > 0)).toBe(true);
    expect(r.contributions.some(c => c.contribPP < 0)).toBe(true);
  });

  it('+ 기여 종목을 칭찬하지 않는다 (판정 대칭)', () => {
    for (const w of ['효자', '잘한', '좋은']) expect(r.text.includes(w)).toBe(false);
  });

  it('부호가 텍스트에 드러난다 (+/-)', () => {
    expect(r.text).toMatch(/\+\d/);
    expect(r.text).toMatch(/-\d/);
  });
});

describe('interpretAttribution — 집중도(provisional)', () => {
  it('한 종목이 전체 손익 변동의 과반이면 true + 문장 추가', () => {
    const r = interpretAttribution([
      h('A', '지배종목', 100, 40, 100),   // -6000
      h('B', 'B', 100, 105, 10),          // +50
    ]);
    expect(r.concentrated).toBe(true);
    expect(r.text).toContain('전체 손익 변동의 절반 이상');
  });

  it('고르게 분산되면 false — 문장도 없다', () => {
    const r = interpretAttribution([
      h('A', 'A', 100, 90, 10),   // -100
      h('B', 'B', 100, 90, 10),   // -100
      h('C', 'C', 100, 90, 10),   // -100
    ]);
    expect(r.concentrated).toBe(false);
    expect(r.text).not.toContain('절반 이상');
  });

  it('이익·손실이 상쇄돼 전체 손익률이 0이어도 총 변동량으로 판정한다', () => {
    // 초안(|top| >= |전체 손익률| × 0.5)은 상쇄로 분모가 0이 되면 **어떤 구성이든** 집중으로 찍힌다.
    // 총 변동량 기준은 상쇄와 무관하게 "이 종목이 움직임의 몇 할인가"를 그대로 잰다.
    const two = interpretAttribution([
      h('A', 'A', 100, 130, 10),   // +300
      h('B', 'B', 100, 70, 10),    // -300  → 반반, 정확히 경계(>= 이므로 true)
    ]);
    expect(two.portfolioProfitRate).toBeCloseTo(0, 10);
    const gross = two.contributions.reduce((a, c) => a + Math.abs(c.contribPP), 0);
    expect(Math.abs(two.topContributor!.contribPP) / gross).toBeCloseTo(CONCENTRATION_SHARE, 10);
    expect(two.concentrated).toBe(true);

    // 같은 '전체 0%'인데 움직임이 여럿으로 갈리면 집중이 아니다.
    // 초안 공식이었다면 분모가 0이라 이 구성도 집중으로 찍혔다 — 그게 이 판정을 바꾼 이유다.
    const many = interpretAttribution([
      h('A', 'A', 100, 120, 10),   // +200
      h('B', 'B', 100, 110, 10),   // +100
      h('C', 'C', 100, 85, 10),    // -150
      h('D', 'D', 100, 85, 10),    // -150  → 합 0, gross 600, top 200/600 ≈ 0.33
    ]);
    expect(many.portfolioProfitRate).toBeCloseTo(0, 10);
    expect(many.concentrated).toBe(false);
  });

  it('경계 바로 아래는 집중이 아니다', () => {
    const r = interpretAttribution([
      h('A', 'A', 100, 140, 10),   // +400
      h('B', 'B', 100, 75, 10),    // -250
      h('C', 'C', 100, 75, 10),    // -250  → gross 900, top 400/900 ≈ 0.44
    ]);
    const gross = r.contributions.reduce((a, c) => a + Math.abs(c.contribPP), 0);
    expect(Math.abs(r.topContributor!.contribPP) / gross).toBeLessThan(CONCENTRATION_SHARE);
    expect(r.concentrated).toBe(false);
    expect(r.text).not.toContain('절반 이상');
  });
});

describe('interpretAttribution — 이름 나열은 상위 3까지', () => {
  it('4종목 이상이면 나머지를 "외 N종목"으로 접는다', () => {
    const rows = Array.from({ length: 6 }, (_, i) => h(`00000${i}`, `종목${i}`, 100, 100 + (6 - i) * 10, 10));
    const r = interpretAttribution(rows);
    expect(r.text).toContain('외 3종목');
    expect(r.contributions).toHaveLength(6);   // 목록 자체는 전부 유지(UI가 더 보여줄 수 있게)
    expect(r.text).toContain('종목0');
    expect(r.text).not.toContain('종목4');
  });

  it('정확히 3종목이면 "외 N종목"을 붙이지 않는다', () => {
    const r = interpretAttribution([
      h('A', 'A', 100, 130, 10), h('B', 'B', 100, 120, 10), h('C', 'C', 100, 110, 10),
    ]);
    expect(r.text).not.toContain('외 ');
  });
});

describe('D — FORBIDDEN_ATTRIBUTION 전수 스윕', () => {
  const texts: string[] = [];
  // 대손실·대이익·집중·분산·1종목·상쇄·소액 등 광범위 구성.
  const configs: Holding[][] = [
    [h('A', '컴투스홀딩스', 50000, 30000, 10)],
    [h('A', '컴투스홀딩스', 50000, 30000, 10), h('B', '유유제약', 12000, 10000, 30)],
    [h('A', 'A', 100, 40, 100), h('B', 'B', 100, 105, 10)],
    [h('A', 'A', 100, 300, 10), h('B', 'B', 100, 90, 10), h('C', 'C', 100, 99, 10)],
    [h('A', 'A', 100, 130, 10), h('B', 'B', 100, 70, 10)],
    [h('A', 'A', 100, 100, 10), h('B', 'B', 100, 100, 10)],
    Array.from({ length: 8 }, (_, i) => h(`0000${i}`, `종목${i}`, 100, 100 + (i - 4) * 25, 10)),
  ];
  for (const rows of configs) {
    const r = interpretAttribution(rows);
    if (r.available) texts.push(r.text);
  }

  it('스윕이 공회전하지 않는다', () => {
    expect(texts.length).toBeGreaterThan(5);
  });

  it('전 출력에 금지 표현 없음 (특히 효자·발목·회복·본전·매도)', () => {
    for (const t of texts) {
      for (const w of FORBIDDEN_ATTRIBUTION) {
        expect(t.includes(w), `"${t}" 에 금지 표현 "${w}" 포함`).toBe(false);
      }
    }
  });

  it("'매수'는 미차단, '매도'만 차단 (DIRECTIVE 계승)", () => {
    expect(FORBIDDEN_ATTRIBUTION.includes('매도')).toBe(true);
    expect(FORBIDDEN_ATTRIBUTION.includes('매수')).toBe(false);
  });
});
