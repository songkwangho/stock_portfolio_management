import { describe, it, expect } from 'vitest';
import { computeTechnicalFromHistory, calculateTechnicalScore } from '@/server/domains/analysis/scoring';

// §2-1 동치 테스트 — 백테스트가 **프로덕션과 같은 계산**을 쓰는지 고정한다.
//
// 이게 깨지면 하네스가 재는 값이 프로덕션 점수가 아니게 되고, 그 위에서 나온 IC·컷 권고는
// 전부 무의미해진다. 그래서 리팩터링 안전망이 아니라 **하네스의 전제 조건**으로 둔다.
//
// 스텁 pool은 pg의 실제 동작을 흉내 낸다: NUMERIC/BIGINT를 **문자열**로 돌려준다.
// 순수 함수 쪽은 Number가 들어가므로, 두 경로가 같으면 캐스팅까지 동일하다는 뜻이다.

type Bar = { date: string; price: number; open: number; high: number; low: number; volume: number };

// 결정적 합성 시계열 — 시드 기반 LCG(테스트마다 같은 값). 추세·변동·거래량 패턴을 바꿔가며 만든다.
function makeHistory(n: number, seed: number, drift: number, amp: number): Bar[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: Bar[] = [];
  let price = 10000;
  for (let i = 0; i < n; i++) {
    price = Math.max(100, Math.round(price * (1 + drift + (rnd() - 0.5) * amp)));
    const d = new Date(Date.UTC(2023, 0, 1 + i));
    out.push({
      date: d.toISOString().slice(0, 10).replace(/-/g, ''),
      price,
      open: Math.round(price * 0.99),
      high: Math.round(price * 1.02),
      low: Math.round(price * 0.98),
      volume: Math.round(100000 + rnd() * 900000),
    });
  }
  return out;
}

// pg 스텁 — 숫자 컬럼을 문자열로 돌려준다(실제 드라이버 동작).
const stubPool = (history: Bar[]) => ({
  query: async () => ({
    rows: history.map(h => ({
      date: h.date,
      price: String(h.price),
      open: String(h.open),
      high: String(h.high),
      low: String(h.low),
      volume: String(h.volume),
    })),
  }),
});

describe('computeTechnicalFromHistory == calculateTechnicalScore (프로덕션 경로)', () => {
  const cases: Array<[string, Bar[]]> = [
    ['상승 드리프트 400봉', makeHistory(400, 1, 0.0015, 0.02)],
    ['하락 드리프트 400봉', makeHistory(400, 2, -0.0015, 0.02)],
    ['무드리프트 고변동 300봉', makeHistory(300, 3, 0, 0.06)],
    ['저변동 250봉', makeHistory(250, 4, 0.0002, 0.004)],
    ['경계 — 26봉(MACD 최소)', makeHistory(26, 5, 0.001, 0.03)],
    ['경계 — 20봉(볼린저 최소)', makeHistory(20, 6, 0.001, 0.03)],
    ['경계 — 15봉(RSI 최소)', makeHistory(15, 7, 0.001, 0.03)],
  ];

  it.each(cases)('%s — 두 경로의 반환값이 완전히 동일', async (_label, history) => {
    const viaDb = await calculateTechnicalScore(stubPool(history), '000000');
    const pure = computeTechnicalFromHistory(history);
    expect(pure).toEqual(viaDb);
    expect(Number.isFinite(pure.total)).toBe(true);
  });

  it('데이터 부족(15봉 미만)은 양쪽 모두 { total: 1.5, detail: {} }', async () => {
    const short = makeHistory(14, 8, 0.001, 0.02);
    expect(computeTechnicalFromHistory(short)).toEqual({ total: 1.5, detail: {} });
    expect(await calculateTechnicalScore(stubPool(short), '000000')).toEqual({ total: 1.5, detail: {} });
  });

  it('빈 입력·null도 터지지 않는다 (하네스가 짧은 접두를 넘길 수 있다)', () => {
    expect(computeTechnicalFromHistory([])).toEqual({ total: 1.5, detail: {} });
    expect(computeTechnicalFromHistory(null)).toEqual({ total: 1.5, detail: {} });
  });

  it('점수는 0~3 범위 안에 있고 detail 4항목을 모두 낸다', () => {
    for (const [, h] of cases) {
      const r = computeTechnicalFromHistory(h);
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThanOrEqual(3);
      if (h.length >= 15) {
        for (const k of ['rsiScore', 'macdScore', 'bollingerScore', 'volumeScore']) {
          expect(Number.isFinite(r.detail[k]), k).toBe(true);
        }
      }
    }
  });

  // ⚠️ 배열 길이 의존 — 하네스가 접두를 **통째로** 넘겨야 하는 이유.
  //
  // MACD만 배열 전체에 의존한다: 루프 시작이 `max(26, prices.length - 20)`이고 EMA 시드가
  // `data.slice(0, period)`라 시계열의 **시작점**이 값을 바꾼다. RSI(14)·볼린저(20)·거래량(20)은
  // 뒤쪽 고정 개수만 보므로 잘라도 같다. 그래서 "총점이 항상 달라진다"가 아니라
  // "MACD를 통해 달라질 수 있다"가 정확한 성질이다(실측: 60개 합성 시계열 중 4개에서 총점 상이).
  describe('길이 의존성', () => {
    const seeds = Array.from({ length: 60 }, (_, k) => k + 1);
    const pairs = seeds.map(seed => {
      const full = makeHistory(300, seed, 0.001, 0.03);
      return { seed, full: computeTechnicalFromHistory(full), tail: computeTechnicalFromHistory(full.slice(-46)) };
    });

    it('MACD 외 성분(RSI·볼린저·거래량)은 잘라도 동일 — 뒤쪽 고정 개수만 본다', () => {
      for (const p of pairs) {
        for (const k of ['rsiScore', 'bollingerScore', 'volumeScore']) {
          expect(p.full.detail[k], `seed ${p.seed} ${k}`).toBe(p.tail.detail[k]);
        }
      }
    });

    it('MACD는 시작점에 따라 달라진다 — 뒤에서 자르면 프로덕션 값이 아니다', () => {
      const differing = pairs.filter(p => p.full.detail.macdScore !== p.tail.detail.macdScore);
      expect(differing.length).toBeGreaterThan(0);
      // 반올림 잡음이 아니라 실제로 큰 차이가 난다(예: 0.81 vs 0.36).
      expect(differing.some(p => Math.abs(p.full.total - p.tail.total) > 0.2)).toBe(true);
    });
  });
});
