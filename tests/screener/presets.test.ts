import { describe, it, expect } from 'vitest';
import { PRESETS, LENSES, presetMetric } from '@/lib/screener/presets';
import type { ScreenerResult } from '@/types/stock';

// 스크리너 프리셋 SSOT.
//
// /screener 와 "종목 탐색"의 인라인 렌즈 버킷이 이 모듈 하나를 본다. 두 화면이 각자 필터를
// 들고 있으면 "같은 렌즈인데 결과가 다른" 상태가 되고, 캐비엇이 갈리면 **한쪽 화면에서만
// 중립 프레임이 빠진다**. 아래 테스트가 그 두 가지를 막는다.

const stock = (over: Partial<ScreenerResult> = {}): ScreenerResult =>
  ({ code: '005930', name: '삼성전자', price: 70000, ...over } as ScreenerResult);

describe('렌즈 칩 ↔ 프리셋 연결', () => {
  it('모든 렌즈 slug가 실재하는 프리셋으로 풀린다 (죽은 칩 금지)', () => {
    // slug 오타는 조용히 "눌러도 아무 일 없는 칩"이 된다 — 화면에선 안 보이는 고장이다.
    for (const lens of LENSES) {
      const preset = PRESETS.find(p => p.slug === lens.slug);
      expect(preset, `렌즈 '${lens.slug}'에 대응하는 프리셋 없음`).toBeTruthy();
      expect(Object.keys(preset!.filters).length).toBeGreaterThan(0);
    }
  });

  it('slug는 프리셋 안에서 유일하다', () => {
    const slugs = PRESETS.map(p => p.slug).filter(Boolean);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('모든 프리셋에 캐비엇이 있다 — 통과가 곧 매수 근거가 아님을 짚는 자리', () => {
    for (const p of PRESETS) {
      expect(p.caveat, `'${p.name}'에 캐비엇 없음`).toBeTruthy();
    }
  });
});

describe('presetMetric — 보조 지표 문구', () => {
  it('서버 키가 없으면 null (정적 프리셋은 기본 표시 유지)', () => {
    expect(presetMetric(undefined, stock())).toBeNull();
    expect(presetMetric('made_up_preset', stock())).toBeNull();
  });

  it('필요한 필드가 없으면 값을 지어내지 않는다', () => {
    expect(presetMetric('breakout_52w', stock())).toBeNull();
    expect(presetMetric('neglected', stock())).toBeNull();
    expect(presetMetric('graham', stock())).toBeNull();
    expect(presetMetric('momentum_3m', stock())).toBeNull();
  });

  it('각 키가 재는 값을 그대로 말한다', () => {
    expect(presetMetric('breakout_52w', stock({ breakout_pct: 2.5 }))).toBe('52주 고점 돌파 +2.5%');
    expect(presetMetric('breakout_52w', stock({ breakout_pct: -3 }))).toBe('52주 고점 -3% 근접');
    expect(presetMetric('neglected', stock({ vol_ratio: 22 }))).toBe('30일 평균의 22% 거래량');
    expect(presetMetric('momentum_3m', stock({ momentum_3m: 18 }))).toBe('3개월 +18%');
    expect(presetMetric('foreign_buy', stock({ foreign_sum: 3_500_000_000 }))).toContain('억 순매수');
  });

  it('그레이엄은 기준가만 — 상승여력(upside)을 되살리지 않는다', () => {
    // graham_upside는 응답에 여전히 실려 오고 서버 정렬에도 쓰인다. 화면에 되돌아오면
    // "적정가 대비 +N%"가 매수 근거로 읽힌다(R2에서 걷어낸 축).
    const t = presetMetric('graham', stock({ graham_number: 88000, graham_upside: 25.7 }))!;
    expect(t).toBe('그레이엄 기준가 ₩88,000');
    expect(t).not.toContain('25.7');
    expect(t).not.toContain('%');
    expect(t).not.toContain('적정가');
  });
});

describe('렌즈 표면 금지어 스윕', () => {
  // 대상: 사용자가 **렌즈의 정체성**으로 읽는 문구(이름·설명·요약·칩 라벨) + 보조 지표 출력.
  //
  // ⚠️ caveat은 제외한다 — 캐비엇은 의도적으로 부정문이라("소외됐다고 무조건 좋은 종목이
  //    아니에요") 판단어를 부분문자열로 훑으면 **경고문을 금지어로 잡는다**. 캐비엇의 안전성은
  //    위 '모든 프리셋에 캐비엇이 있다'와 사람 리뷰가 담당한다.
  const FORBIDDEN_LENS = [
    '적정가', '목표가', '상승 여력', 'upside',
    '유망', '추천', '매수 신호', '매도 신호',
    '우량', '수혜주', '급등',
  ];

  const surfaces: string[] = [
    ...PRESETS.flatMap(p => [p.name, p.description, p.summary]),
    ...LENSES.map(l => l.label),
  ];

  const metrics: string[] = [];
  for (const key of ['breakout_52w', 'foreign_buy', 'fund_buy', 'neglected', 'graham', 'momentum_3m']) {
    for (const over of [
      { breakout_pct: 5 }, { breakout_pct: -5 }, { vol_ratio: 12 },
      { foreign_sum: 9_900_000_000 }, { foreign_sum: 0 }, { fund_sum: 1_200_000_000 }, { fund_sum: 0 },
      { graham_number: 88000, graham_upside: 40 }, { momentum_3m: 33 },
    ]) {
      const t = presetMetric(key, stock(over as Partial<ScreenerResult>));
      if (t) metrics.push(t);
    }
  }

  it('스윕이 공회전하지 않는다', () => {
    expect(surfaces.length).toBeGreaterThan(15);
    expect(metrics.length).toBeGreaterThan(5);
  });

  it('렌즈 이름·설명·칩 라벨·보조 지표에 금지 표현 없음', () => {
    for (const t of [...surfaces, ...metrics]) {
      for (const w of FORBIDDEN_LENS) {
        expect(t.includes(w), `"${t}" 에 금지 표현 "${w}" 포함`).toBe(false);
      }
    }
  });
});
