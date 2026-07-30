import { describe, it, expect } from 'vitest';
import {
  readDisposition, readOvertrading, readChasing, readAnchoring, readBiases, journalCoverageNote,
  type JournalBias,
} from '@/lib/journal/interpret';
import { FORBIDDEN_JOURNAL } from '../forbiddenWords';

describe('journal interpret — 사실 + 관찰형', () => {
  it('처분효과(F3) — flag=true일 때만 편향명 부착 + 두 숫자 사실', () => {
    const r = readDisposition({ key: 'disposition', available: true, winnerAvgHold: 8, loserAvgHold: 45, gap: 37, flag: true, thresholds: { minGapDays: 3 } });
    expect(r.text).toContain('8일');
    expect(r.text).toContain('45일');
    expect(r.text).toContain('처분효과');
  });
  it('처분효과(F3) — flag=false면 편향명 미부착(두 숫자는 유지)', () => {
    // 격차는 크지만 소표본 등으로 서버 flag=false → "처분효과" 언급 금지
    const r = readDisposition({ key: 'disposition', available: true, winnerAvgHold: 8, loserAvgHold: 45, gap: 37, flag: false, thresholds: { minGapDays: 3 } });
    expect(r.text).toContain('8일');
    expect(r.text).toContain('45일');
    expect(r.text).not.toContain('처분효과');
  });
  it('처분효과(F3) — 격차 작으면 "비슷한 편"', () => {
    const r = readDisposition({ key: 'disposition', available: true, winnerAvgHold: 10, loserAvgHold: 11, gap: 1, flag: false, thresholds: { minGapDays: 3 } });
    expect(r.text).toContain('비슷한 편');
    expect(r.text).not.toContain('처분효과');
  });
  it('coverage 고지(F2) — 미매칭 매도 있으면 문구, 없으면 null', () => {
    expect(journalCoverageNote({ unmatchedSellCount: 3 })).toContain('매도 3건');
    expect(journalCoverageNote({ unmatchedSellCount: 0 })).toBe(null);
    expect(journalCoverageNote(undefined)).toBe(null);
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
  // coverage 고지(F2)
  for (const n of [0, 1, 3, 999]) { const s = journalCoverageNote({ unmatchedSellCount: n }); if (s) texts.push(s); }
  for (const avail of [true, false]) {
    for (const flag of [true, false]) {
      // gap 부호/크기별로 F3 flag=false 분기(비슷/조금 더 오래) 전부 커버
      for (const [w, l] of [[8, 45], [45, 8], [10, 10], [0, 0], [5, 20], [20, 5]]) {
        texts.push(readDisposition({ key: 'disposition', available: avail, winnerAvgHold: w, loserAvgHold: l, gap: l - w, flag, thresholds: { minGapDays: 3 } }).text);
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
