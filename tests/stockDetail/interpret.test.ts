import { describe, it, expect } from 'vitest';
import {
  interpretValuation, interpretFinancial, interpretTechnical, interpretFlow,
  interpretSectorPosition, synthesize, summarizeBalance, consecutiveStreak, type Interpretation,
  interpretPositionAnchor, describePositionAnchorShort, rangePositionWord, describeRangePosition,
} from '@/lib/stockDetail/interpret';
import { FORBIDDEN_BASE, FORBIDDEN_POSITION } from '../forbiddenWords';

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

// ─────────────────────────────────────────────────────────────
// B — 포지션 앵커 해석 (탈앵커 시장 맥락)
//
// 이 표면의 위험은 두 가지다:
//  1) 평단을 **복귀 목표**로 제시하는 앵커링 강화("본전까지 N%") — 앱이 journal에서 편향이라
//     부르는 걸 종목상세가 강화하는 자기모순.
//  2) 범위 위치를 **가치 판단**으로 바꾸기("아래쪽이라 싸다").
// 아래 스윕이 둘 다 잡는다.
// ─────────────────────────────────────────────────────────────
describe('interpretPositionAnchor — 가드', () => {
  const range = { high: 12000, low: 8000, days: 250, positionPct: 50 };

  it('보유가 아니면 available:false (관심·비보유엔 평단이 없다)', () => {
    expect(interpretPositionAnchor(range, 10000, 10000, false).available).toBe(false);
  });

  it('평단이 없거나 0 이하면 available:false', () => {
    expect(interpretPositionAnchor(range, null, 10000, true).available).toBe(false);
    expect(interpretPositionAnchor(range, undefined, 10000, true).available).toBe(false);
    expect(interpretPositionAnchor(range, 0, 10000, true).available).toBe(false);
    expect(interpretPositionAnchor(range, -100, 10000, true).available).toBe(false);
  });

  it('범위 표본이 없거나 위치를 못 구하면 available:false (억지 해석 금지)', () => {
    expect(interpretPositionAnchor(null, 10000, 10000, true).available).toBe(false);
    expect(interpretPositionAnchor({ ...range, positionPct: null }, 10000, 10000, true).available).toBe(false);
    // 고가=저가(무변동)면 위치 자체가 정의되지 않는다.
    expect(interpretPositionAnchor({ high: 9000, low: 9000, days: 250, positionPct: 50 }, 9000, 9000, true).available).toBe(false);
  });
});

describe('interpretPositionAnchor — 두 위치를 시장 범위 안에 함께 놓는다', () => {
  const range = { high: 12000, low: 8000, days: 250, positionPct: 75 };

  it('현재가·평단 위치가 둘 다 등장하고, 평단은 복귀 목표로 제시되지 않는다', () => {
    const r = interpretPositionAnchor(range, 9000, 11000, true);
    expect(r.available).toBe(true);
    expect(r.tone).toBe('neutral');            // 손익 부호로 색을 칠하지 않는다
    expect(r.text).toContain('75% 지점');       // 현재가 위치(서버 값 그대로)
    expect(r.text).toContain('25% 지점');       // 평단 위치 (9000-8000)/4000 = 25%
    expect(r.text).toContain('8,000~12,000원');
    expect(r.text).toContain('매수가는 그때 산 가격일 뿐');   // 탈앵커 페이로드
    for (const w of ['본전', '회복', '만회', '되돌리']) expect(r.text.includes(w)).toBe(false);
  });

  it('표본이 1년에 못 미치면 52주·1년이라 부르지 않는다', () => {
    const short = interpretPositionAnchor({ high: 12000, low: 8000, days: 120, positionPct: 50 }, 10000, 10000, true);
    expect(short.text).toContain('120거래일');
    expect(short.text).not.toContain('1년');
    const long = interpretPositionAnchor({ high: 12000, low: 8000, days: 250, positionPct: 50 }, 10000, 10000, true);
    expect(long.text).toContain('최근 1년');
  });

  it('경계 — 평단이 범위 저점/고점과 정확히 같을 때 0%/100%', () => {
    expect(interpretPositionAnchor(range, 8000, 10000, true).text).toContain('0% 지점');
    expect(interpretPositionAnchor(range, 12000, 10000, true).text).toContain('100% 지점');
  });

  it('평단이 범위 밖이면 % 지점 대신 벗어난 사실을 말한다 (클램프 값을 진짜 위치처럼 쓰지 않음)', () => {
    const above = interpretPositionAnchor(range, 20000, 10000, true);
    expect(above.text).toContain('이 범위 위로 벗어나 있어요');
    expect(above.text).not.toContain('100% 지점');
    const below = interpretPositionAnchor(range, 3000, 10000, true);
    expect(below.text).toContain('이 범위 아래로 벗어나 있어요');
    // 범위 밖이어도 가치 판단으로 넘어가지 않는다.
    for (const w of ['싸', '비싸', '이득', '손실']) expect(below.text.includes(w)).toBe(false);
  });

  it('현재가와 평단이 같아도 문장이 성립한다', () => {
    const r = interpretPositionAnchor({ high: 12000, low: 8000, days: 250, positionPct: 50 }, 10000, 10000, true);
    expect(r.available).toBe(true);
    expect(r.text.match(/50% 지점/g) || []).toHaveLength(2);   // 두 위치가 모두 50%
  });
});

describe('interpretPositionAnchor — SSOT: 현재가 위치어가 다른 표면과 일치', () => {
  it('rangePositionWord·describeRangePosition(StatsGrid 게이지)와 같은 임계를 쓴다', () => {
    for (const pct of [0, 15, 30, 31, 50, 69, 70, 85, 100]) {
      const range = { high: 12000, low: 8000, days: 250, positionPct: pct };
      const anchor = interpretPositionAnchor(range, 10000, 10000, true);
      const word = rangePositionWord(pct);
      // 게이지 캡션이 쓰는 단어가 앵커 문장에도 그대로 등장해야 한다.
      expect(describeRangePosition(250, pct)).toContain(word);
      expect(anchor.text).toContain(`지금은 ${word}에 있고`);
    }
  });

  it('현재가 위치는 서버 값(range.positionPct)을 재계산하지 않고 그대로 쓴다', () => {
    // 현재가로 다시 계산하면 게이지와 어긋난다(반올림·기준 차이). 값 자체를 신뢰해야 한다.
    const range = { high: 12000, low: 8000, days: 250, positionPct: 62 };
    const r = interpretPositionAnchor(range, 9000, 99999, true);   // currentPrice가 범위 밖이어도
    expect(r.text).toContain('62% 지점');
  });
});

describe('describePositionAnchorShort — 포트폴리오 카드 축약', () => {
  const range = { high: 12000, low: 8000, days: 250, positionPct: 80 };

  it('현재가·평단 위치어만 담고 탈앵커 문장은 생략', () => {
    const s = describePositionAnchorShort(range, 9000, true)!;
    expect(s).toContain('52주 범위');
    expect(s).toContain('지금은 위쪽');
    expect(s).toContain('매수가는 아래쪽');
    expect(s).not.toContain('그때 산 가격');
  });

  it('가드 — 비보유·평단없음·범위없음은 null (카드에 아무것도 안 그린다)', () => {
    expect(describePositionAnchorShort(range, 9000, false)).toBeNull();
    expect(describePositionAnchorShort(range, null, true)).toBeNull();
    expect(describePositionAnchorShort(null, 9000, true)).toBeNull();
    expect(describePositionAnchorShort({ ...range, positionPct: null }, 9000, true)).toBeNull();
  });

  it('표본 부족이면 52주라 부르지 않는다', () => {
    expect(describePositionAnchorShort({ ...range, days: 120 }, 9000, true)).toContain('120거래일');
  });
});

describe('positionAnchor는 관점 균형 집계에서 빠진다', () => {
  it('종목이 아니라 내 진입점에 대한 사실이라 관점 수에 포함하지 않는다', () => {
    const mk = (key: Interpretation['key'], tone: Interpretation['tone']): Interpretation =>
      ({ key, label: key, text: 'x', tone, available: true });
    const withAnchor = summarizeBalance([mk('valuation', 'positive'), mk('positionAnchor', 'neutral')]);
    const without = summarizeBalance([mk('valuation', 'positive')]);
    expect(withAnchor.total).toBe(1);
    expect(withAnchor.neutral).toEqual([]);
    expect(withAnchor.text).toBe(without.text);
  });
});

describe('B — FORBIDDEN_POSITION 전수 스윕', () => {
  // 광범위 입력: 평단이 범위 밖/경계/현재가와 동일, 손실·이익 양쪽, 표본 장단.
  const texts: string[] = [];
  for (const days of [60, 199, 200, 250]) {
    for (const pos of [0, 20, 30, 50, 70, 90, 100]) {
      const range = { high: 12000, low: 8000, days, positionPct: pos };
      for (const avg of [3000, 8000, 8001, 9500, 10000, 11999, 12000, 20000]) {
        for (const cur of [8000, 10000, 12000]) {
          const r = interpretPositionAnchor(range, avg, cur, true);
          if (r.available) texts.push(r.text);
          const short = describePositionAnchorShort(range, avg, true);
          if (short) texts.push(short);
        }
      }
    }
  }

  it('스윕이 공회전하지 않는다', () => {
    expect(texts.length).toBeGreaterThan(100);
  });

  it('전 출력에 금지 표현 없음 (특히 본전·회복·싸/비싸)', () => {
    for (const t of new Set(texts)) {
      for (const w of FORBIDDEN_POSITION) {
        expect(t.includes(w), `"${t}" 에 금지 표현 "${w}" 포함`).toBe(false);
      }
    }
  });

  it("'매수가'는 허용된다 — 차단 대상은 '매도'뿐", () => {
    expect(texts.some(t => t.includes('매수가'))).toBe(true);
    expect(FORBIDDEN_POSITION.includes('매수')).toBe(false);
    expect(FORBIDDEN_POSITION.includes('매도')).toBe(true);
  });
});
