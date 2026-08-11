import { describe, it, expect } from 'vitest';
import {
  interpretValuation, interpretFinancial, interpretTechnical, interpretFlow,
  interpretSectorPosition, synthesize, summarizeBalance, consecutiveStreak, type Interpretation,
} from '@/lib/stockDetail/interpret';
import { FORBIDDEN_BASE } from '../forbiddenWords';

describe('interpretValuation', () => {
  it('PER < 업종중앙값 → 싼 편, positive', () => {
    const r = interpretValuation(8.7, 1.0, 10, 14, 1.2);
    expect(r.available).toBe(true);
    expect(r.tone).toBe('positive');
    expect(r.text).toContain('8.7배');
    expect(r.text).toContain('14배');
    expect(r.text).toContain('싼 편');
  });
  it('PER > 업종중앙값 → 비싼 편, caution', () => {
    const r = interpretValuation(30, 3, 10, 14, 1.2);
    expect(r.tone).toBe('caution');
    expect(r.text).toContain('비싼 편');
  });
  it('PER ≈ 업종중앙값(경계, ±10% 이내) → 비슷, neutral', () => {
    const r = interpretValuation(14, 1, 10, 14, 1.2); // 정확히 중앙값
    expect(r.tone).toBe('neutral');
    expect(r.text).toContain('비슷');
  });
  it('업종 중앙값 없음 → 절대 수준 폴백', () => {
    const r = interpretValuation(8, 1, 10, null, null);
    expect(r.available).toBe(true);
    expect(r.text).toContain('PER 8배');
  });
  it('PER <= 0 (적자) → available:true, 적자 안내', () => {
    const r = interpretValuation(-5, 1, null, 14, 1.2);
    expect(r.available).toBe(true);
    expect(r.text).toContain('적자');
  });
  it('PER null → available:false', () => {
    expect(interpretValuation(null, 1, 10, 14, 1.2).available).toBe(false);
  });
});

describe('interpretFinancial', () => {
  it('부채비율 < 100% → 자기 돈이 많은 편, positive (품질 판정어 없음)', () => {
    const r = interpretFinancial(1000, 400, 600); // 400/600 = 67%
    expect(r.tone).toBe('positive');
    expect(r.text).toContain('67%');
    expect(r.text).toContain('빚보다 자기 돈');
  });
  it('부채비율 = 100% 경계 → caution(중간 구간)', () => {
    const r = interpretFinancial(1000, 500, 500); // 100%
    expect(r.text).toContain('100%');
    expect(r.tone).toBe('caution');
    expect(r.text).toContain('이자 부담');
  });
  it('부채비율 = 200% 경계 → caution(중간 구간, 상당히 높음 아님)', () => {
    const r = interpretFinancial(1500, 1000, 500); // 200%
    expect(r.text).toContain('200%');
    expect(r.text).toContain('이자 부담');
  });
  it('부채비율 > 200% → 상당히 높은 편, caution', () => {
    const r = interpretFinancial(2000, 1500, 500); // 300%
    expect(r.tone).toBe('caution');
    expect(r.text).toContain('상당히 높은 편');
  });
  it('자본 <= 0 (자본잠식) → caution', () => {
    const r = interpretFinancial(1000, 1200, -200);
    expect(r.available).toBe(true);
    expect(r.text).toContain('자본잠식');
  });
  it('데이터 null → available:false', () => {
    expect(interpretFinancial(null, null, null).available).toBe(false);
    expect(interpretFinancial(1000, 500, null).available).toBe(false);
  });
});

describe('interpretTechnical', () => {
  it('두 평균선 아래 → 약한 흐름, caution', () => {
    const r = interpretTechnical(9000, 9500, 9800);
    expect(r.tone).toBe('caution');
    expect(r.text).toContain('약한 편');
  });
  it('정배열 + 주가 위 → 상승 쪽, positive', () => {
    const r = interpretTechnical(11000, 10500, 10000);
    expect(r.tone).toBe('positive');
    expect(r.text).toContain('상승 쪽');
  });
  it('혼조 → 방향 뚜렷하지 않음, neutral', () => {
    const r = interpretTechnical(10200, 10000, 10500); // sma5 위지만 정배열 아님
    expect(r.tone).toBe('neutral');
  });
  it('price/sma5 null → available:false', () => {
    expect(interpretTechnical(null, 100, 100).available).toBe(false);
    expect(interpretTechnical(100, null, 100).available).toBe(false);
  });
});

describe('interpretFlow', () => {
  it('외국인 매도 스트릭 → 팔고 있어요, caution', () => {
    const r = interpretFlow(-3, 0);
    expect(r.available).toBe(true);
    expect(r.text).toContain('외국인이 3일 연속 팔고 있어요');
    expect(r.tone).toBe('caution');
  });
  it('기관 매수 스트릭 → 사고 있어요, positive', () => {
    const r = interpretFlow(0, 5);
    expect(r.text).toContain('기관이 5일 연속 사고 있어요');
    expect(r.tone).toBe('positive');
  });
  it('외국인 매도 + 기관 매수 → 엇갈림, neutral', () => {
    const r = interpretFlow(-2, 3);
    expect(r.tone).toBe('neutral');
  });
  it('둘 다 0 → available:false', () => {
    expect(interpretFlow(0, 0).available).toBe(false);
  });
});

describe('interpretSectorPosition', () => {
  it('PER 싼 편 + ROE 낮은 편', () => {
    const r = interpretSectorPosition(8, 5, 14, 10);
    expect(r.available).toBe(true);
    expect(r.text).toContain('PER은 싼 편');
    expect(r.text).toContain('ROE는 낮은 편');
  });
  it('데이터 없으면 available:false', () => {
    expect(interpretSectorPosition(null, null, null, null).available).toBe(false);
  });
});

describe('consecutiveStreak', () => {
  it('최신이 매수, 연속 순매수 → 양수', () => {
    // 오래된→최신: 마지막 3개가 양수
    expect(consecutiveStreak([-10, 5, 20, 30])).toBe(3);
  });
  it('최신이 매도, 연속 순매도 → 음수', () => {
    expect(consecutiveStreak([10, -5, -20])).toBe(-2);
  });
  it('최신 0 → 0', () => {
    expect(consecutiveStreak([10, 20, 0])).toBe(0);
  });
  it('빈 배열/누락 → 0', () => {
    expect(consecutiveStreak([])).toBe(0);
    expect(consecutiveStreak([null, undefined])).toBe(0);
  });
});

// B2 — 균형 요약: 판정이 아니라 재료 분포. 단일 점수/등급으로 결론을 통보하지 않는다.
describe('summarizeBalance', () => {
  const mk = (tone: Interpretation['tone'], label: string, available = true): Interpretation =>
    ({ key: 'valuation', label, text: 'x', tone, available });

  it('우호/비우호/중립 개수와 라벨을 사실로 센다', () => {
    const b = summarizeBalance([mk('positive', '밸류'), mk('positive', '성장'), mk('caution', '재무'), mk('neutral', '변동')]);
    expect(b.total).toBe(4);
    expect(b.favorable).toEqual(['밸류', '성장']);
    expect(b.unfavorable).toEqual(['재무']);
    expect(b.neutral).toEqual(['변동']);
    expect(b.text).toContain('관찰한 4개 관점');
    expect(b.text).toContain('우호 2개(밸류·성장)');
    expect(b.text).toContain('비우호 1개(재무)');
    expect(b.text).toContain('중립 1개(변동)');
  });

  it('상충이면 엇갈린다는 사실만 짚고 결론은 내지 않는다', () => {
    const out = summarizeBalance([mk('positive', '밸류'), mk('caution', '재무')]).text;
    expect(out).toContain('엇갈려요');
    expect(out).toContain('직접 저울질');
    // 결론 통보 금지 — 우세/유망/매수 같은 단정 없음
    expect(out).not.toContain('우세');
  });

  it('한쪽으로 쏠려도 "그래서 사라"로 넘어가지 않는다', () => {
    const out = summarizeBalance([mk('positive', '밸류'), mk('positive', '흐름')]).text;
    expect(out).toContain('우호 2개');
    expect(out).toContain('개수가 많은 쪽이 정답은 아니');
    expect(out).toContain('백테스팅');
  });

  it('available:false는 세지 않는다', () => {
    const b = summarizeBalance([mk('positive', '밸류', false), mk('caution', '재무')]);
    expect(b.total).toBe(1);
    expect(b.favorable).toEqual([]);
  });

  it('전부 데이터 없음 → available:false + 정보 부족', () => {
    const b = summarizeBalance([mk('positive', '밸류', false)]);
    expect(b.available).toBe(false);
    expect(b.text).toContain('부족');
  });

  it('synthesize는 균형 요약 텍스트를 그대로 돌려주는 래퍼', () => {
    const interps = [mk('positive', '밸류'), mk('caution', '재무')];
    expect(synthesize(interps)).toBe(summarizeBalance(interps).text);
  });
});

// ── 금지 단어 전수 검사: 모든 함수의 광범위 입력 출력에 판단/명령 단어 미포함 ──
describe('금지 단어 미포함 (사라/팔라/좋다/나쁘다/위험 등)', () => {
  // 명령/판단어 + 품질 판정어 — 공용 사전(tests/forbiddenWords.ts) 재사용.
  const FORBIDDEN = FORBIDDEN_BASE;
  const texts: string[] = [];
  // 밸류: 다양한 PER × 중앙값
  for (const per of [null, -5, 0, 5, 8.7, 14, 20, 40]) {
    for (const med of [null, 10, 14]) texts.push(interpretValuation(per, 1, 10, med, 1.2).text);
  }
  // 재무: 다양한 부채비율
  for (const [a, l, e] of [[1000, 400, 600], [1000, 500, 500], [1500, 1000, 500], [2000, 1600, 400], [1000, 1200, -200], [null, null, null]] as const) {
    texts.push(interpretFinancial(a as number, l as number, e as number).text);
  }
  // 기술
  for (const [p, s5, s20] of [[9000, 9500, 9800], [11000, 10500, 10000], [10200, 10000, 10500], [null, 1, 1]] as const) {
    texts.push(interpretTechnical(p as number, s5 as number, s20 as number).text);
  }
  // 수급
  for (const f of [-3, -1, 0, 2, 5]) for (const i of [-2, 0, 3]) texts.push(interpretFlow(f, i).text);
  // 업종
  texts.push(interpretSectorPosition(8, 5, 14, 10).text, interpretSectorPosition(20, 15, 14, 10).text);
  // 종합
  const mk = (tone: Interpretation['tone']): Interpretation => ({ key: 'valuation', label: '밸류', text: 'x', tone, available: true });
  texts.push(
    synthesize([mk('positive'), mk('caution')]),
    synthesize([mk('positive')]),
    synthesize([mk('caution')]),
    synthesize([mk('neutral')]),
    synthesize([]),
  );

  it('모든 출력에 금지 단어 없음', () => {
    for (const t of texts) {
      for (const w of FORBIDDEN) {
        expect(t.includes(w), `"${t}" 에 금지어 "${w}" 포함`).toBe(false);
      }
    }
  });
  it('관찰형 표현(팔고/사고 있어요)은 허용 — 명령형만 차단', () => {
    // 매도 스트릭 문구는 "팔고 있어요"라 '팔라'에 걸리지 않아야 함
    expect(interpretFlow(-3, 0).text).toContain('팔고 있어요');
  });
});
