// 지표 읽는 법 팝업 — 관찰형·비예측 고정 + 금지어 전수 스윕.
//
// 이 팝업이 사용자에게는 "이 지표를 어떻게 읽나"의 **정본**이다. 여기서 예측 프레이밍이
// 새면 차트 전체가 예측 도구로 읽힌다 — Phase 4가 그 예측력 없음을 실증한 바로 그 지표들이다.
import { describe, it, expect } from 'vitest';
import { HELP_CONTENTS } from '@/components/ui/HelpBottomSheet';
import { FORBIDDEN_CHART } from '../forbiddenWords';

// 차트 칩이 여는 키 = Phase 2에서 신설·정합한 표면.
const CHART_KEYS = ['candle', 'sma', 'bollinger', 'supportResistance', 'lrc', 'rsi', 'macd', 'stochastic', 'volume'] as const;

describe('차트 지표 팝업 구조', () => {
  for (const k of CHART_KEYS) {
    it(`${k} — 제목·요약·본문·캐비엇을 모두 갖는다`, () => {
      const c = HELP_CONTENTS[k];
      expect(c, `${k} 콘텐츠 없음`).toBeTruthy();
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.short.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
      // ⚠️ 캐비엇이 **필수**다 — 없으면 "지표 → 방향"으로 읽힌다.
      expect(c.caveat, `${k}에 caveat 없음`).toBeTruthy();
    });
  }

  it('방향 지표의 캐비엇은 예측을 부정한다 — 문구가 실제로 그 일을 하는지', () => {
    // 'candle'은 제외한다 — 방향 지표가 아니라 **표기 규약**이라(빨강=오른 날) 그 캐비엇은
    // "미국 차트와 색이 반대"라는 혼동 경고다. 여기에 예측 부정을 강요하면 문구가 어색해진다.
    const negations = ['아니', '못', '보장', '없'];
    for (const k of CHART_KEYS.filter(x => x !== 'candle')) {
      const cav = HELP_CONTENTS[k].caveat!;
      expect(negations.some(n => cav.includes(n)), `${k} 캐비엇이 부정문이 아님: ${cav}`).toBe(true);
    }
  });
});

describe('금지어 전수 스윕 — 팝업 본문(캐비엇 제외)', () => {
  // ⚠️ caveat은 제외한다. 캐비엇은 의도적으로 부정문이라("70을 넘었다고 곧 내려온다는 뜻은
  //    아니에요") 판단어를 부분문자열로 훑으면 **경고문 자체를 금지어로 잡는다**.
  //    스크리너 렌즈 캐비엇에서 이미 같은 판단을 했다.
  const surfaces: string[] = [];
  for (const k of CHART_KEYS) {
    const c = HELP_CONTENTS[k];
    surfaces.push(c.title, c.short, ...c.body, c.inApp);
    if (c.example) surfaces.push(c.example);
  }

  it('스윕이 공회전하지 않는다', () => {
    expect(surfaces.length).toBeGreaterThan(40);
    expect(surfaces.some(t => t.includes('캔들'))).toBe(true);
    expect(surfaces.some(t => t.includes('볼린저'))).toBe(true);
  });

  for (const word of FORBIDDEN_CHART) {
    it(`'${word}' 미포함`, () => {
      const hit = surfaces.filter(t => t.includes(word));
      expect(hit, `금지어 '${word}' 발견: ${hit.join(' | ')}`).toEqual([]);
    });
  }
});

describe('구 예측 프레이밍이 되살아나지 않는다', () => {
  it('MACD — "추세 전환 신호"·"상승 우위" 제거 확인', () => {
    const all = [HELP_CONTENTS.macd.short, ...HELP_CONTENTS.macd.body, HELP_CONTENTS.macd.inApp, HELP_CONTENTS.macd.example ?? ''].join(' ');
    expect(all).not.toContain('추세 전환');
    expect(all).not.toContain('상승 우위');
    expect(all).not.toContain('상승 흐름');
    expect(all).not.toContain('하락 흐름');
  });

  it('수급 — "미래 가치를 긍정적으로 본다" 제거 확인(타인 의도 추정)', () => {
    const all = HELP_CONTENTS.supplyDemand.body.join(' ');
    expect(all).not.toContain('긍정적으로');
    expect(all).not.toContain('신호');
  });

  it('캔들 — 색이 뒤집혀 있지 않다(한국 증시: 빨강=오른 날)', () => {
    const all = HELP_CONTENTS.candle.body.join(' ');
    expect(all).toContain('빨간 봉은 오른 날');
    expect(all).not.toContain('초록');
  });
});
