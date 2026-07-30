import { describe, it, expect } from 'vitest';
import {
  readDisposition, readOvertrading, readChasing, readAnchoring, readBiases,
  type JournalBias,
} from '@/lib/journal/interpret';
import { FORBIDDEN_JOURNAL } from '../forbiddenWords';

describe('journal interpret — 사실 + 관찰형', () => {
  it('처분효과 — 두 숫자 사실 + 처분효과 정의(손실 더 오래)', () => {
    const r = readDisposition({ key: 'disposition', available: true, winnerAvgHold: 8, loserAvgHold: 45, flag: true });
    expect(r.available).toBe(true);
    expect(r.text).toContain('8일');
    expect(r.text).toContain('45일');
    expect(r.text).toContain('처분효과');
    expect(r.text).toContain('흐름이 보여요');
  });
  it('과매매 — 월평균·보유일', () => {
    const r = readOvertrading({ key: 'overtrading', available: true, months: 6, tradesPerMonth: 30, avgHoldingDays: 3, flag: true });
    expect(r.text).toContain('30회');
    expect(r.text).toContain('3일');
  });
  it('추격매수 — 급등 직후 비율 + coverage', () => {
    const r = readChasing({
      key: 'chasing', available: true, chasedCount: 4, evaluatedCount: 10, chasingRatio: 40,
      coverage: { evaluated: 10, skipped: 2 }, thresholds: { lookbackDays: 20, surgePct: 15 }, flag: true,
    });
    expect(r.text).toContain('40%');
    expect(r.text).toContain('제외했어요');
  });
  it('앵커링 — 본전 근처 비율', () => {
    const r = readAnchoring({ key: 'anchoring', available: true, anchoringRatio: 55, thresholds: { nearBreakevenPct: 3 }, flag: true });
    expect(r.text).toContain('55%');
    expect(r.text).toContain('본전');
  });
  it('available:false → 안내 문구', () => {
    expect(readDisposition({ key: 'disposition', available: false }).available).toBe(false);
    expect(readChasing({ key: 'chasing', available: false }).text).toContain('모이지 않았어요');
  });
  it('readBiases — 서버 순서 유지, 미지원 키 스킵', () => {
    const out = readBiases([
      { key: 'disposition', available: false },
      { key: 'unknown_future', available: true },
      { key: 'anchoring', available: true, anchoringRatio: 10, thresholds: { nearBreakevenPct: 3 } },
    ] as JournalBias[]);
    expect(out.map(r => r.key)).toEqual(['disposition', 'anchoring']);
  });
});

// ── 금지어 전수 검사: 모든 reader의 광범위 입력 출력에 판단/명령/질책어 미포함 ──
describe('금지 단어 미포함 (질책·판정·명령형 포함)', () => {
  const texts: string[] = [];
  for (const avail of [true, false]) {
    for (const flag of [true, false]) {
      for (const [w, l] of [[8, 45], [45, 8], [10, 10], [0, 0]]) {
        texts.push(readDisposition({ key: 'disposition', available: avail, winnerAvgHold: w, loserAvgHold: l, flag }).text);
      }
      for (const [m, pm, h] of [[6, 30, 3], [12, 2, 60], [1, 0, null]] as const) {
        texts.push(readOvertrading({ key: 'overtrading', available: avail, months: m, tradesPerMonth: pm, avgHoldingDays: h, flag }).text);
      }
      for (const [c, e, sk] of [[4, 10, 2], [0, 5, 0], [8, 8, 0]]) {
        texts.push(readChasing({ key: 'chasing', available: avail, chasedCount: c, evaluatedCount: e, chasingRatio: e ? Math.round(c / e * 100) : 0, coverage: { evaluated: e, skipped: sk }, thresholds: { lookbackDays: 20, surgePct: 15 }, flag }).text);
      }
      for (const ratio of [0, 40, 55, 100]) {
        texts.push(readAnchoring({ key: 'anchoring', available: avail, anchoringRatio: ratio, thresholds: { nearBreakevenPct: 3 }, flag }).text);
      }
    }
  }

  it('모든 출력에 금지 단어 없음', () => {
    for (const t of texts) {
      for (const w of FORBIDDEN_JOURNAL) {
        expect(t.includes(w), `"${t}" 에 금지어 "${w}" 포함`).toBe(false);
      }
    }
  });
});
