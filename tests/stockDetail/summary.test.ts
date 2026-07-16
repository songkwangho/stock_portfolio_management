import { describe, it, expect } from 'vitest';
import { generateStockSummary, generateActionGuide } from '@/lib/stockDetail/summary';
import type { StockDetail, Holding } from '@/types/stock';

// 현재 동작을 고정하는 테스트 (behavior-pinning). 함수를 고치지 않는다.
// generateStockSummary/generateActionGuide는 3.9차 결론 카드 로직.

// 필요한 필드만 채운 최소 StockDetail (history는 요약 로직에서 안 읽지만 타입상 필수).
function sd(partial: Partial<StockDetail>): StockDetail {
  return { code: '000000', name: '테스트', price: 10000, history: [], ...partial } as StockDetail;
}
function hold(avgPrice: number): Holding {
  return { code: '000000', name: '테스트', value: 0, avgPrice, currentPrice: 0, quantity: 1 };
}

describe('generateStockSummary', () => {
  it('보유 + 매도 + 손실 -7% 이하 → 손실률 포함 문구', () => {
    const s = sd({ price: 9000, holding_opinion: '매도' });
    const out = generateStockSummary(s, true, hold(10000)); // (9000-10000)/10000 = -10.0%
    expect(out).toContain('-10.0% 손실 중');
    expect(out).toContain('하락 추세가 이어지고 있어요');
  });

  it('보유 + 매도 + 손실 -7% 미만(경미) → 이평선 문구 (손실률 미포함)', () => {
    const s = sd({ price: 9700, holding_opinion: '매도' });
    const out = generateStockSummary(s, true, hold(10000)); // -3.0%
    expect(out).toContain('단기·중기 이평선 모두 아래로 내려갔어요');
    expect(out).not.toContain('손실 중');
  });

  it('보유 + 관망 → 관망 문구', () => {
    const out = generateStockSummary(sd({ holding_opinion: '관망' }), true, hold(10000));
    expect(out).toContain('잠시 관망할 구간이에요');
  });

  it('보유 + 추가매수 → 지지 문구', () => {
    const out = generateStockSummary(sd({ holding_opinion: '추가매수' }), true, hold(10000));
    expect(out).toContain('5일 평균선 근처에서 지지받고 있어요');
  });

  it('보유 + 보유 → 정배열 문구', () => {
    const out = generateStockSummary(sd({ holding_opinion: '보유' }), true, hold(10000));
    expect(out).toContain('정배열로 상승 흐름이 이어지고 있어요');
  });

  it('미보유 + 긍정적 + targetPrice 있음(upside>0) → 괴리율 포함', () => {
    const s = sd({ price: 10000, targetPrice: 12000, market_opinion: '긍정적' });
    const out = generateStockSummary(s, false);
    expect(out).toContain('약 20% 낮아요'); // round((12000-10000)/10000*100)=20
  });

  it('미보유 + 긍정적 + targetPrice 없음 → 일반 긍정 문구', () => {
    const out = generateStockSummary(sd({ market_opinion: '긍정적' }), false);
    expect(out).toContain('긍정적인 신호가 나타나고 있어요');
  });

  it('미보유 + 부정적 → 주의 문구', () => {
    const out = generateStockSummary(sd({ market_opinion: '부정적' }), false);
    expect(out).toContain('주의가 필요한 상태예요');
  });

  it('미보유 + 중립적 → 중립 문구', () => {
    const out = generateStockSummary(sd({ market_opinion: '중립적' }), false);
    expect(out).toContain('중립적인 상태예요');
  });

  it('isHolding이지만 holding_opinion 없으면 opinion 분기로 폴백', () => {
    // isHolding && ho 가드: ho가 undefined면 market_opinion 분기로 내려간다.
    const out = generateStockSummary(sd({ market_opinion: '부정적' }), true, hold(10000));
    expect(out).toContain('주의가 필요한 상태예요');
  });
});

describe('generateActionGuide', () => {
  const cases: Array<[string, StockDetail, boolean]> = [
    ['보유+매도', sd({ holding_opinion: '매도' }), true],
    ['보유+관망', sd({ holding_opinion: '관망' }), true],
    ['보유+추가매수', sd({ holding_opinion: '추가매수' }), true],
    ['보유+보유', sd({ holding_opinion: '보유' }), true],
    ['미보유+긍정적', sd({ market_opinion: '긍정적' }), false],
    ['미보유+부정적', sd({ market_opinion: '부정적' }), false],
    ['미보유+중립적', sd({ market_opinion: '중립적' }), false],
  ];

  it('모든 분기가 3단계 이하 배열 반환', () => {
    for (const [label, s, isHolding] of cases) {
      const guide = generateActionGuide(s, isHolding);
      expect(Array.isArray(guide), label).toBe(true);
      expect(guide.length, label).toBeGreaterThanOrEqual(1);
      expect(guide.length, label).toBeLessThanOrEqual(3);
    }
  });

  it('명령형 "사세요"/"파세요" 미포함 (관찰형 원칙)', () => {
    for (const [label, s, isHolding] of cases) {
      for (const step of generateActionGuide(s, isHolding)) {
        expect(step, label).not.toMatch(/사세요|파세요/);
      }
    }
  });

  // ⚠️ 알려진 이슈 고정: 긍정적 미보유 액션 가이드 3번째 스텝에 "매수하세요"(명령형 register)가 존재.
  // 3.9차 원본 문구로, 증권사 앱 실행을 조건부로 안내("투자하기로 했다면 ...")하는 맥락.
  // 관찰형 원칙과의 정합성은 별도 차수 검토 대상. 현재 동작을 고정해 향후 변경이 의도적이도록 함.
  it('[known] 긍정적 액션 가이드에 "매수하세요"가 현재 존재 (문구 정리 시 이 테스트 갱신)', () => {
    const guide = generateActionGuide(sd({ market_opinion: '긍정적' }), false);
    expect(guide.some(s => s.includes('매수하세요'))).toBe(true);
  });
});
