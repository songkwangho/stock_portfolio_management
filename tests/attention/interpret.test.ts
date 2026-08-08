import { describe, it, expect } from 'vitest';
import {
  attentionBadges, attentionSourceLabel, attentionAsOfNote,
  ATTENTION_TITLE, ATTENTION_EMPTY, ATTENTION_PROVISIONAL, ATTENTION_DISCLAIMER, ATTENTION_VOL_SURGE,
  type AttentionFacts,
} from '@/lib/attention/interpret';
import { FORBIDDEN_ATTENTION } from '../forbiddenWords';

const facts = (over: Partial<AttentionFacts>): AttentionFacts => ({
  held: false, priced: true, ret5d: null, volSurge: null, unrealizedPct: null,
  discCount: 0, discLatestDaysAgo: null, discCategories: [], ...over,
});
const textOf = (f: AttentionFacts, key: string) => attentionBadges(f).find(b => b.key === key)?.text;

describe('attention interpret — 사실 배지(R2: 이벤트 O, 해석 X)', () => {
  it('공시 — 건수 + 최신성만. 오늘은 "오늘"으로', () => {
    expect(textOf(facts({ discCount: 2, discLatestDaysAgo: 0 }), 'disclosure')).toBe('공시 2건 · 오늘');
    expect(textOf(facts({ discCount: 1, discLatestDaysAgo: 3 }), 'disclosure')).toBe('공시 1건 · 3일 전');
    expect(textOf(facts({ discCount: 1, discLatestDaysAgo: null }), 'disclosure')).toBe('공시 1건');
    expect(textOf(facts({ discCount: 0, discLatestDaysAgo: 0 }), 'disclosure')).toBeUndefined();
  });

  it('공시 분류 — 중립 라벨 나열만(호재/악재 라벨 없음)', () => {
    expect(textOf(facts({ discCount: 3, discLatestDaysAgo: 1, discCategories: ['실적', '배당'] }), 'category')).toBe('실적 · 배당');
    // 공시 0건이면 분류 배지도 없다.
    expect(textOf(facts({ discCount: 0, discCategories: ['실적'] }), 'category')).toBeUndefined();
  });

  it('가격 — 텍스트는 크기·부호 사실, 방향은 dir(색)으로만', () => {
    const up = attentionBadges(facts({ ret5d: 3.24 })).find(b => b.key === 'move')!;
    expect(up.text).toBe('5일 +3.2%');
    expect(up.dir).toBe('up');
    const down = attentionBadges(facts({ ret5d: -7.5 })).find(b => b.key === 'move')!;
    expect(down.text).toBe('5일 -7.5%');
    expect(down.dir).toBe('down');
    expect(attentionBadges(facts({ ret5d: 0 })).find(b => b.key === 'move')!.dir).toBe('none');
    expect(textOf(facts({ ret5d: null }), 'move')).toBeUndefined();
  });

  it('거래량 — 문턱 이상만, 무채색(방향 아님)', () => {
    const b = attentionBadges(facts({ volSurge: 2.42 })).find(x => x.key === 'volume')!;
    expect(b.text).toBe('거래량 평소의 2.4배');
    expect(b.dir).toBe('none');
    expect(textOf(facts({ volSurge: ATTENTION_VOL_SURGE - 0.01 }), 'volume')).toBeUndefined();
    expect(textOf(facts({ volSurge: null }), 'volume')).toBeUndefined();
  });

  it('미실현 — 보유만 표시(관심은 포지션이 없어 미표시)', () => {
    const b = attentionBadges(facts({ held: true, unrealizedPct: -12.34 })).find(x => x.key === 'unrealized')!;
    expect(b.text).toBe('미실현 -12.3%');
    expect(b.dir).toBe('down');
    expect(textOf(facts({ held: false, unrealizedPct: -12.3 }), 'unrealized')).toBeUndefined();
  });

  it('시세 없는 종목 — 중립 표기만, 가격 계열 배지 생성 안 함', () => {
    const badges = attentionBadges(facts({ held: true, priced: false, discCount: 1, discLatestDaysAgo: 2, ret5d: 5, volSurge: 9, unrealizedPct: 10 }));
    expect(badges.map(b => b.key)).toEqual(['disclosure', 'unpriced']);
    expect(badges[1].text).toBe('시세 정보 없음');
  });

  it('배지 순서 고정 — 공시 → 분류 → 가격 → 거래량 → 미실현', () => {
    const badges = attentionBadges(facts({
      held: true, discCount: 2, discLatestDaysAgo: 0, discCategories: ['실적'],
      ret5d: 6, volSurge: 3, unrealizedPct: 4,
    }));
    expect(badges.map(b => b.key)).toEqual(['disclosure', 'category', 'move', 'volume', 'unrealized']);
  });

  it('출처 라벨·최근 종가 고지 — "지금" 금지, 날짜 없으면 빈 문자열', () => {
    expect(attentionSourceLabel({ held: true })).toBe('보유');
    expect(attentionSourceLabel({ held: false })).toBe('관심');
    expect(attentionAsOfNote('2026-08-06')).toContain('2026-08-06 종가 기준');
    expect(attentionAsOfNote('2026-08-06')).not.toContain('지금');
    expect(attentionAsOfNote(null)).toBe('');
    expect(attentionAsOfNote(undefined)).toBe('');
  });
});

describe('attention interpret — 금지어 전수 스윕', () => {
  it('전 브랜치 출력에 판단어·이벤트 해석어가 없다', () => {
    const categories = ['증자', '감자', '배당', '자사주', '실적', '구조변경', '해명', '주요사항', '기타'];
    const outputs: string[] = [
      ATTENTION_TITLE, ATTENTION_EMPTY, ATTENTION_PROVISIONAL, ATTENTION_DISCLAIMER,
      attentionAsOfNote('2026-08-06'), attentionSourceLabel({ held: true }), attentionSourceLabel({ held: false }),
    ];

    for (const held of [true, false]) {
      for (const priced of [true, false]) {
        for (const ret5d of [null, 0, 12.5, -18.2, 0.4]) {
          for (const volSurge of [null, 1.1, 4.7]) {
            for (const unrealizedPct of [null, 33.3, -41.9]) {
              for (const discCount of [0, 1, 4]) {
                for (const discLatestDaysAgo of [null, 0, 1, 13]) {
                  const badges = attentionBadges(facts({
                    held, priced, ret5d, volSurge, unrealizedPct,
                    discCount, discLatestDaysAgo, discCategories: categories.slice(0, 3),
                  }));
                  outputs.push(...badges.map(b => b.text));
                }
              }
            }
          }
        }
      }
    }
    // 분류 라벨 자체도 검사 대상 — 서버가 붙여 보내는 값이 그대로 화면에 나간다.
    outputs.push(...categories);

    for (const t of new Set(outputs)) {
      for (const w of FORBIDDEN_ATTENTION) {
        expect(t.includes(w), `"${t}" 에 금지어 "${w}" 포함`).toBe(false);
      }
    }
  });
});
