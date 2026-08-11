import { describe, it, expect } from 'vitest';
import { generateStockSummary, generateActionGuide, describeHoldingState } from '@/lib/stockDetail/summary';
import { FORBIDDEN_DIRECTIVE } from '../forbiddenWords';
import type { StockDetail, Holding } from '@/types/stock';

// N1~N4 — holding_opinion 판정 라벨 중립화 후의 동작을 고정한다.
// 원칙: 판정 라벨(주의 필요/추가 검토) 금지 · 개인화 매수/매도 지시 금지 · 관찰 + 분석 안내까지만.

// 필요한 필드만 채운 최소 StockDetail (history는 요약 로직에서 안 읽지만 타입상 필수).
function sd(partial: Partial<StockDetail>): StockDetail {
  return { code: '000000', name: '테스트', price: 10000, history: [], ...partial } as StockDetail;
}
function hold(avgPrice: number, smaAvailable?: boolean): Holding {
  return { code: '000000', name: '테스트', value: 0, avgPrice, currentPrice: 0, quantity: 1, sma_available: smaAvailable };
}

describe('describeHoldingState — 서버 규칙 → 평균 가격 위치 사실', () => {
  it('매도(이중 이탈) → 5·20일 평균 아래 + 약한 편 + 분석 안내', () => {
    const out = describeHoldingState('매도', -3)!;
    expect(out).toContain('5일·20일 평균 가격 아래');
    expect(out).toContain('약한 편');
    expect(out).toContain('재무·수급 분석');
  });

  it('매도(손절 -7% 경로) → null — 이평선 위치를 단정할 수 없다', () => {
    // 서버 규칙 1은 이평선과 무관하게 먼저 발동한다. 손익 서술은 호출부(수익률 줄/요약문)가 담당.
    expect(describeHoldingState('매도', -7)).toBeNull();
    expect(describeHoldingState('매도', -12.5)).toBeNull();
  });

  it('관망 → 5일 아래·20일 위 (단기 약, 중기 유지)', () => {
    const out = describeHoldingState('관망', -1)!;
    expect(out).toContain('5일 평균 가격 아래지만 20일 평균 가격 위');
    expect(out).toContain('중기 흐름은 유지');
  });

  it('추가매수 → 5일 평균 "바로 위(1% 이내)" — 둘 다 위가 아니다', () => {
    const out = describeHoldingState('추가매수', 2)!;
    expect(out).toContain('1% 이내');
    expect(out).not.toContain('20일');   // 서버 규칙 4는 20일선을 보지 않는다
    expect(out).not.toContain('강한 편');
  });

  it('보유 → 5일 평균 +1% 초과 (규칙 2·3·4에서 걸러진 잔여)', () => {
    const out = describeHoldingState('보유', 5)!;
    expect(out).toContain('1% 이상 위');
    expect(out).toContain('강한 편');
  });

  it('holding_opinion 없음 / SMA 미확보 → null', () => {
    expect(describeHoldingState(undefined, 0)).toBeNull();
    expect(describeHoldingState('보유', 5, { smaAvailable: false })).toBeNull();
    expect(describeHoldingState('보유', 5, { smaAvailable: true })).not.toBeNull();
  });

  it('주어는 조사 이형태를 피해 "주가"로 고정 — subject 유무만 다르다', () => {
    expect(describeHoldingState('보유', 5)!.startsWith('주가가 ')).toBe(true);
    // 종목명 끝 자음에 관계없이 '주가는'이 조사를 받는다(삼성전자은/삼성물산는 같은 오류 방지).
    expect(describeHoldingState('보유', 5, { subject: '삼성전자' })!.startsWith('삼성전자 주가는 ')).toBe(true);
    expect(describeHoldingState('보유', 5, { subject: '삼성물산' })!.startsWith('삼성물산 주가는 ')).toBe(true);
  });
});

describe('generateStockSummary', () => {
  it('보유 + 매도 + 손실 -7% 이하 → 손익 사실 + 분석 안내 (추세 단정 없음)', () => {
    const s = sd({ price: 9000, holding_opinion: '매도' });
    const out = generateStockSummary(s, true, hold(10000)); // (9000-10000)/10000 = -10.0%
    expect(out).toContain('내 매수가보다 10.0% 낮아요');
    expect(out).toContain('재무·수급 분석');
    expect(out).not.toContain('하락 추세');   // 손절 경로에서는 이평선/추세를 알 수 없다
  });

  it('보유 + 매도 + 손실 -7% 미만(경미) → 평균 가격 위치 관찰', () => {
    const s = sd({ price: 9700, holding_opinion: '매도' });
    const out = generateStockSummary(s, true, hold(10000)); // -3.0%
    expect(out).toContain('테스트 주가는');
    expect(out).toContain('5일·20일 평균 가격 아래');
  });

  it('보유 + 관망 / 추가매수 / 보유 → 각 위치 관찰', () => {
    expect(generateStockSummary(sd({ holding_opinion: '관망' }), true, hold(10000)))
      .toContain('20일 평균 가격 위');
    expect(generateStockSummary(sd({ holding_opinion: '추가매수' }), true, hold(10000)))
      .toContain('1% 이내');
    expect(generateStockSummary(sd({ holding_opinion: '보유' }), true, hold(10000)))
      .toContain('1% 이상 위');
  });

  it('보유 + SMA 미확보 → 위치를 말하지 않고 데이터 상태만', () => {
    const out = generateStockSummary(sd({ holding_opinion: '보유' }), true, hold(10000, false));
    expect(out).toContain('이동평균 데이터를 모으는 중');
    expect(out).not.toContain('평균 가격보다');
  });

  // B1 — 목표가 괴리를 매수 신호처럼 제시하던 문장 제거. 어느 분기도 목표가를 언급하지 않는다.
  it('미보유 + 긍정적 — targetPrice가 있어도 괴리율을 말하지 않는다', () => {
    const s = sd({ price: 10000, targetPrice: 12000, market_opinion: '긍정적' });
    const out = generateStockSummary(s, false);
    expect(out).toContain('우호적인 신호가 더 많은 편');
    expect(out).not.toContain('목표가');
    expect(out).not.toContain('20%');
  });
  it('미보유 + 부정적 → 비우호 우세 사실 + 관점별 풀이 안내', () => {
    const out = generateStockSummary(sd({ market_opinion: '부정적' }), false);
    expect(out).toContain('비우호적인 신호가 더 많은 편');
    expect(out).toContain('관점별 풀이');
  });
  it('미보유 + 중립적 → 쏠림 없음 (지켜보세요 제거)', () => {
    const out = generateStockSummary(sd({ market_opinion: '중립적' }), false);
    expect(out).toContain('한쪽으로 쏠리지 않은 상태');
    expect(out).not.toContain('지켜보세요');
  });

  it('종목명 뒤 조사는 이형태를 피해 "의 지표는"으로 고정', () => {
    expect(generateStockSummary(sd({ name: '삼성전자', market_opinion: '부정적' }), false)).toContain('삼성전자의 지표는');
    expect(generateStockSummary(sd({ name: '삼성물산', market_opinion: '부정적' }), false)).toContain('삼성물산의 지표는');
  });

  it('isHolding이지만 holding_opinion 없으면 opinion 분기로 폴백', () => {
    expect(generateStockSummary(sd({ market_opinion: '부정적' }), true, hold(10000)))
      .toContain('비우호적인 신호가 더 많은 편');
  });
});

describe('generateActionGuide — 분석 안내만', () => {
  const cases: Array<[string, StockDetail, boolean]> = [
    ['보유+매도', sd({ holding_opinion: '매도' }), true],
    ['보유+관망', sd({ holding_opinion: '관망' }), true],
    ['보유+추가매수', sd({ holding_opinion: '추가매수' }), true],
    ['보유+보유', sd({ holding_opinion: '보유' }), true],
    ['미보유+긍정적', sd({ market_opinion: '긍정적' }), false],
    ['미보유+부정적', sd({ market_opinion: '부정적' }), false],
    ['미보유+중립적', sd({ market_opinion: '중립적' }), false],
  ];

  it('모든 분기가 1~3단계 배열 반환', () => {
    for (const [label, s, isHolding] of cases) {
      const guide = generateActionGuide(s, isHolding);
      expect(Array.isArray(guide), label).toBe(true);
      expect(guide.length, label).toBeGreaterThanOrEqual(1);
      expect(guide.length, label).toBeLessThanOrEqual(3);
    }
  });

  it('상태별로 먼저 볼 곳이 다르다(설명 풍부화)', () => {
    expect(generateActionGuide(sd({ holding_opinion: '매도' }), true)[0]).toContain('[기업]');
    expect(generateActionGuide(sd({ holding_opinion: '관망' }), true)[0]).toContain('20일 평균 가격');
    expect(generateActionGuide(sd({ holding_opinion: '보유' }), true)[0]).toContain('5일·20일 평균 가격');
  });

  it('탭 안내는 실제 3탭 구조([차트·지표]/[기업])만 참조 — "아래 차트" 잔재 없음', () => {
    for (const [label, s, isHolding] of cases) {
      for (const step of generateActionGuide(s, isHolding)) {
        expect(step, `${label}: ${step}`).not.toContain('아래 차트');
      }
    }
  });
});

describe('방향 지시·판정 라벨 전수 스윕', () => {
  // 보유 상태 표면(describeHoldingState + 보유 분기 요약문 + 전 분기 행동 가이드)에
  // 판정 라벨·매도 전제 표현이 재유입되지 않는지 검사한다.
  // (market_opinion 분기 요약문은 별 축이라 이번 스윕 대상 아님 — N3.)
  it('보유 관찰·행동 가이드에 금지 표현이 없다', () => {
    const outputs: string[] = [];
    for (const ho of ['매도', '관망', '추가매수', '보유'] as const) {
      for (const loss of [-20, -7, -3, 0, 5]) {
        const s = describeHoldingState(ho, loss);
        if (s) outputs.push(s);
        const withSubject = describeHoldingState(ho, loss, { subject: '삼성전자' });
        if (withSubject) outputs.push(withSubject);
      }
      for (const price of [9000, 9700, 10500]) {
        outputs.push(generateStockSummary(sd({ price, holding_opinion: ho }), true, hold(10000)));
        outputs.push(...generateActionGuide(sd({ holding_opinion: ho }), true));
      }
    }
    outputs.push(...generateActionGuide(sd({ market_opinion: '긍정적' }), false));
    outputs.push(generateStockSummary(sd({ holding_opinion: '보유' }), true, hold(10000, false)));

    for (const t of new Set(outputs)) {
      for (const w of FORBIDDEN_DIRECTIVE) {
        expect(t.includes(w), `"${t}" 에 금지 표현 "${w}" 포함`).toBe(false);
      }
    }
  });
});
