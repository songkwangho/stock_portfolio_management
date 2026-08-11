import { describe, it, expect } from 'vitest';
import { initialRecommendations } from '@/server/domains/stock/data';
import { FORBIDDEN_CURATION } from './forbiddenWords';

// "종목 탐색"(구 추천) 카드의 reason은 **에디터가 쓴 문구가 그대로 화면에 나가는** 유일한 표면이다.
// 목록에 담긴 것 자체가 선별이라, 여기에 최상급·시장지위 단정·픽 표현이 붙으면 매수 신호가 된다.
// reason은 registerInitialData가 서버 재시작마다 DB에 덮어쓰므로 이 배열이 SSOT다 → 여기서 막는다.

describe('큐레이션 reason 시드 — 금지 표현 전수 스윕', () => {
  it('시드가 비어 있지 않다 (스윕이 공회전하지 않도록)', () => {
    expect(initialRecommendations.length).toBeGreaterThan(0);
  });

  it('전 종목 reason에 판단어·최상급·픽 표현이 없다', () => {
    for (const rec of initialRecommendations) {
      for (const w of FORBIDDEN_CURATION) {
        expect(
          rec.reason.includes(w),
          `${rec.code} reason에 금지 표현 "${w}" 포함: "${rec.reason}"`,
        ).toBe(false);
      }
    }
  });

  it('reason은 관찰 가능한 사실 서술이다 (빈 문자열·명령형 없음)', () => {
    for (const rec of initialRecommendations) {
      expect(rec.reason.trim().length, rec.code).toBeGreaterThan(0);
      // '~하세요'류 명령형은 큐레이션 설명에 들어갈 이유가 없다(3.12.1 FIX-1과 같은 규칙).
      expect(rec.reason.includes('하세요'), `${rec.code}: ${rec.reason}`).toBe(false);
      expect(rec.reason.includes('보세요'), `${rec.code}: ${rec.reason}`).toBe(false);
    }
  });

  it('code는 6자리 종목코드 형식', () => {
    for (const rec of initialRecommendations) {
      expect(rec.code, rec.code).toMatch(/^[0-9A-Z]{6}$/);
    }
  });
});
