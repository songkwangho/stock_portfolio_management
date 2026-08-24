// 지표 그림 에셋 — 칩·팝업 공유(SSOT) 고정 + 주석 금지어 전수 스윕.
//
// 그림은 글보다 단정적으로 읽힌다. 주석 한 줄이 "이 모양이면 오른다"로 새면 팝업 캐비엇이
// 무력화되므로, 문구를 상수로 올려 여기서 훑는다(컴포넌트 인라인이면 스윕 밖으로 샌다).
import { describe, it, expect } from 'vitest';
import {
  INDICATOR_ICON, INDICATOR_ILLUS, ILLUS_NOTES, ILLUS_ARIA,
  indicatorGraphicKey, type IndicatorGraphicKey,
} from '@/lib/stockDetail/indicatorGraphics';
import { CHIPS } from '@/lib/stockDetail/chartChips';
import { HELP_CONTENTS, type HelpTermKey } from '@/components/ui/HelpBottomSheet';
import { FORBIDDEN_CHART, FORBIDDEN_FLOW } from '../forbiddenWords';

const KEYS = Object.keys(ILLUS_NOTES) as IndicatorGraphicKey[];

describe('칩 ↔ 그림 매핑 (빈 아이콘 칸이 생기지 않게)', () => {
  it('칩 9종 전부 그림 키로 해석된다', () => {
    expect(CHIPS).toHaveLength(9);
    for (const c of CHIPS) {
      const g = indicatorGraphicKey(c.help);
      expect(g, `칩 '${c.label}'(help=${c.help})에 대응하는 그림이 없다`).not.toBeNull();
      expect(INDICATOR_ICON[g!]).toBeTruthy();
      expect(INDICATOR_ILLUS[g!]).toBeTruthy();
    }
  });

  it('칩의 help 키 집합과 그림 키 집합이 정확히 일치한다', () => {
    expect([...new Set(CHIPS.map(c => c.help))].sort()).toEqual([...KEYS].sort());
  });

  it('지표가 아닌 도움말 키는 삽화가 없다 — PER 팝업에 차트 그림이 붙으면 안 된다', () => {
    for (const k of ['per', 'pbr', 'roe', 'peg', 'supplyDemand'] as HelpTermKey[]) {
      expect(indicatorGraphicKey(k)).toBeNull();
    }
  });

  it('아이콘·삽화·aria가 같은 9키를 덮는다 (SSOT — 칩과 팝업이 같은 그림을 쓴다)', () => {
    expect(KEYS).toHaveLength(9);
    for (const k of KEYS) {
      expect(INDICATOR_ICON[k], `${k} 아이콘 없음`).toBeTruthy();
      expect(INDICATOR_ILLUS[k], `${k} 삽화 없음`).toBeTruthy();
      expect(ILLUS_ARIA[k], `${k} aria-label 없음`).toBeTruthy();
    }
  });

  it('그림 키는 전부 실제 팝업 내용을 갖는다 — [?]가 빈 팝업을 열면 안 된다', () => {
    for (const k of KEYS) expect(HELP_CONTENTS[k]).toBeTruthy();
  });
});

describe('삽화 주석 — 구조', () => {
  it('키마다 주석이 2개 이상이다 (그림만 두고 설명을 빼지 않는다)', () => {
    for (const k of KEYS) expect(ILLUS_NOTES[k].length, k).toBeGreaterThanOrEqual(2);
  });

  // 폭 한계는 앵커에 따라 다르다 — 가운데 정렬은 220 전폭을 쓰지만, 좌/우 정렬은 그림과
  // 같은 줄에 놓이는 경우가 있어 절반쯤만 쓸 수 있다.
  it('주석이 220 폭 안에 들어갈 길이다 (가운데 정렬은 전폭)', () => {
    for (const k of KEYS) {
      for (const n of ILLUS_NOTES[k]) {
        const max = n.anchor === 'middle' ? 26 : 20;
        expect(n.text.length, `${k}: "${n.text}"`).toBeGreaterThan(0);
        expect(n.text.length, `${k}: "${n.text}" (anchor=${n.anchor || 'start'})`).toBeLessThanOrEqual(max);
      }
    }
  });

  // 좌표가 viewBox를 벗어나면 주석이 조용히 잘린다 — 그림은 렌더되니 눈으로 놓치기 쉽다.
  it('주석·지시선 좌표가 viewBox(220×108) 안에 있다', () => {
    for (const k of KEYS) {
      for (const n of ILLUS_NOTES[k]) {
        expect(n.x, `${k} x`).toBeGreaterThanOrEqual(0);
        expect(n.x, `${k} x`).toBeLessThanOrEqual(220);
        expect(n.y, `${k} y`).toBeGreaterThanOrEqual(0);
        expect(n.y, `${k} y`).toBeLessThanOrEqual(108);
        // swatch는 텍스트 왼쪽 16px에 그려진다 → 그만큼 여백이 있어야 한다.
        if (n.swatch) expect(n.x, `${k} swatch 여백`).toBeGreaterThanOrEqual(16);
        for (const v of n.leader ? [n.leader.x1, n.leader.x2] : []) {
          expect(v, `${k} leader x`).toBeGreaterThanOrEqual(0);
          expect(v, `${k} leader x`).toBeLessThanOrEqual(220);
        }
        for (const v of n.leader ? [n.leader.y1, n.leader.y2] : []) {
          expect(v, `${k} leader y`).toBeGreaterThanOrEqual(0);
          expect(v, `${k} leader y`).toBeLessThanOrEqual(108);
        }
      }
    }
  });

  it('aria-label은 그림의 정체만 말한다 — 해석을 넣지 않는다', () => {
    for (const k of KEYS) expect(ILLUS_ARIA[k]).toMatch(/예시 그림$/);
  });
});

describe('금지어 전수 스윕 — 삽화 주석 + aria', () => {
  const surfaces: string[] = [
    ...KEYS.flatMap(k => ILLUS_NOTES[k].map(n => n.text)),
    ...Object.values(ILLUS_ARIA),
  ];

  it('스윕이 공회전하지 않는다 — 실제 주석이 모였다', () => {
    expect(surfaces.length).toBeGreaterThan(25);
    expect(surfaces.some(t => t.includes('저항'))).toBe(true);
    expect(surfaces.some(t => t.includes('20일 평균'))).toBe(true);
    expect(surfaces.some(t => t.includes('시가~종가'))).toBe(true);
  });

  // ⚠️ 삽화 주석은 캐비엇이 아니다 — 부정문 예외를 두지 않고 두 목록 모두 통과해야 한다.
  //    (팝업 `caveat`만 스윕에서 빠진다 — 그쪽은 의도적 부정문이라 부분문자열이 걸린다.)
  for (const word of [...new Set([...FORBIDDEN_CHART, ...FORBIDDEN_FLOW])]) {
    it(`'${word}' 미포함`, () => {
      const hit = surfaces.filter(t => t.includes(word));
      expect(hit, `금지어 '${word}' 발견: ${hit.join(' | ')}`).toEqual([]);
    });
  }

  // G1에서 라이브 helpTexts의 "상승 힘이 강하다는 신호"를 걷어냈다. 지시문 예시가 그 표현을
  // 그대로 쓰고 있었으므로(“막대 0 위 = 상승 힘”) 그림으로 되돌아오는 경로를 막는다.
  it('G1에서 제거한 표현이 그림으로 되돌아오지 않는다', () => {
    for (const w of ['상승 힘', '하락 힘', '너무 많이']) {
      expect(surfaces.filter(t => t.includes(w)), w).toEqual([]);
    }
  });
});
