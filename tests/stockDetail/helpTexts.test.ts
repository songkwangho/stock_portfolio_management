// 인라인 도움말 + 투자자 섹션 카피 — 관찰형 고정 + 금지어 스윕.
//
// 이 표면들이 스윕 밖에 있었던 게 실제 문제였다: 팝업(HELP_CONTENTS)은 Phase 2에서
// 방향 프레이밍을 걷어냈는데, IndicatorPanel이 쓰는 `helpTexts`와 InvestorChart의
// 인라인 문구는 그대로 남아 "하락 힘이 강하다는 신호"·"긍정적 신호"를 계속 노출했다.
import { describe, it, expect } from 'vitest';
import { helpTexts, INVESTOR_SECTION_COPY } from '@/lib/stockDetail/helpTexts';
import { FORBIDDEN_CHART, FORBIDDEN_FLOW } from '../forbiddenWords';

describe('helpTexts — IndicatorPanel 인라인 도움말', () => {
  it('IndicatorPanel이 읽는 3키가 존재한다', () => {
    for (const k of ['rsi', 'macd', 'bollinger']) {
      expect(helpTexts[k], k).toBeTruthy();
    }
  });

  it('스윕이 공회전하지 않는다 — 실제 문구가 모였다', () => {
    expect(Object.values(helpTexts).join('').length).toBeGreaterThan(200);
    expect(helpTexts.macd).toContain('이동평균');
  });

  for (const word of FORBIDDEN_CHART) {
    it(`helpTexts에 '${word}' 미포함`, () => {
      const hit = Object.entries(helpTexts).filter(([, v]) => v.includes(word));
      expect(hit, `금지어 '${word}': ${hit.map(([k]) => k).join(', ')}`).toEqual([]);
    });
  }
});

describe('INVESTOR_SECTION_COPY — 수급 섹션 (Phase 4 역방향 실증)', () => {
  const surfaces = Object.values(INVESTOR_SECTION_COPY);

  it('스윕이 공회전하지 않는다', () => {
    expect(surfaces).toHaveLength(2);
    expect(surfaces.join('')).toContain('외국인·기관');
  });

  it('무엇을 보여주는지는 사실로 말한다', () => {
    expect(INVESTOR_SECTION_COPY.what).toContain('사고판 양');
  });

  it('비예측 캐비엇이 반드시 있다 — 이 표면은 역방향이 실증된 축이다', () => {
    expect(INVESTOR_SECTION_COPY.caveat).toContain('방향은 아무도 못 맞혀요');
  });

  for (const word of FORBIDDEN_FLOW) {
    it(`'${word}' 미포함`, () => {
      const hit = surfaces.filter(t => t.includes(word));
      expect(hit, `금지어 '${word}' 발견: ${hit.join(' | ')}`).toEqual([]);
    });
  }
});
