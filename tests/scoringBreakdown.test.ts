import { describe, it, expect } from 'vitest';
import { CATEGORY_LABELS } from '@/components/stock/ScoringBreakdownPanel';
import { calculateTrendScore } from '@/server/domains/analysis/scoring';
import { FORBIDDEN_BASE, FORBIDDEN_DIRECTIVE } from './forbiddenWords';
import type { ScoringBreakdown } from '@/types/stock';

// 방향단정 스윕 — 항목별 점수 설명에서 verdict('상승 흐름이에요'/'하락 추세예요')를 걷어냈다.
// 동시에 trend 분기가 **계산과 어긋나 있던 버그**를 고쳤으므로 매핑을 여기서 고정한다.

const trend = CATEGORY_LABELS.find(c => c.key === 'trend')!;
const detail = (reason?: string) => ({ trend: reason ? { reason } : undefined }) as unknown as ScoringBreakdown['detail'];

describe('추세 항목 — calculateTrendScore가 내는 점수와 문구가 1:1로 맞는다', () => {
  // 서버 규칙(scoring.js): 2.0 정배열 / 1.0 주가>5일선·역배열 / 0.5 20일선 위·5일선 아래 / 0.0 양 이평선 아래
  const cases: Array<[string, number, number, number, string]> = [
    // [설명, price, sma5, sma20, 기대 문구 조각]
    ['정배열',              1200, 1100, 1000, '5일선 위, 5일선이 20일선 위'],
    ['5일선 위·역배열',      1200, 1100, 1300, '5일선 위지만, 5일선이 20일선 아래'],
    ['20일선 위·5일선 아래', 1050, 1100, 1000, '5일선 아래, 20일선 위'],
    ['양 이평선 아래',        900, 1100, 1000, '5일선·20일선 모두 아래'],
  ];

  it.each(cases)('%s → 문구가 실제 위치와 일치', (_label, price, sma5, sma20, expected) => {
    const score = calculateTrendScore(price, sma5, sma20);
    expect(trend.descFn(score.total, detail(score.detail.reason))).toContain(expected);
  });

  it('이평선 데이터 부족(총점 1.0)을 "5일선 아래"로 오표기하지 않는다', () => {
    // 회귀 방지: 데이터 부족도 total 1.0이라, pct 구간으로 고르던 옛 코드는
    // "20일선은 지지하지만 5일선 아래예요"라는 **거짓 위치**를 표시했다.
    const score = calculateTrendScore(1200, null, null);
    expect(score.total).toBe(1.0);
    const text = trend.descFn(score.total, detail(score.detail.reason));
    expect(text).toContain('모으는 중');
    expect(text).not.toContain('아래');
  });

  it('총점 1.0(주가가 5일선 위)을 "5일선 아래"라고 말하지 않는다', () => {
    const score = calculateTrendScore(1200, 1100, 1300);   // price > sma5 → 5일선 위
    expect(score.total).toBe(1.0);
    expect(trend.descFn(score.total, detail(score.detail.reason))).not.toContain('5일선 아래');
  });
});

describe('항목별 점수 설명 금지어 전수 스윕', () => {
  it('전 항목·전 점수 구간에 방향 verdict·판단어가 없다', () => {
    const outputs: string[] = [];
    const details = [
      detail(),
      detail('이평선 데이터 부족'),
      detail('정배열: 주가 > 5일선 > 20일선'),
      { supplyDemand: { foreignConsecutive: 3, instConsecutive: 2 } } as unknown as ScoringBreakdown['detail'],
    ];
    for (const cat of CATEGORY_LABELS) {
      for (let s = 0; s <= cat.max; s += 0.25) {
        for (const d of details) outputs.push(cat.descFn(s, d));
      }
    }
    const banned = [
      ...FORBIDDEN_BASE, ...FORBIDDEN_DIRECTIVE,
      '긍정적 추세', '강세', '상승 흐름이에요', '하락 추세예요', '좋은 신호',
    ];
    for (const t of new Set(outputs)) {
      for (const w of banned) {
        expect(t.includes(w), `"${t}" 에 금지 표현 "${w}" 포함`).toBe(false);
      }
    }
  });
});
