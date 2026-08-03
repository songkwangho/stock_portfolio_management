import { describe, it, expect } from 'vitest';
import {
  readDisposition, readOvertrading, readChasing, readAnchoring, readBiases, journalCoverageNotes,
  readOpenLossHeadline, readAvgDown, type JournalBias,
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
  it('coverage 고지(F2) — 미매칭 매도 있으면 문구, 없으면 빈 배열', () => {
    expect(journalCoverageNotes({ unmatchedSellCount: 3 })[0]).toContain('매도 3건');
    expect(journalCoverageNotes({ unmatchedSellCount: 0 })).toEqual([]);
    expect(journalCoverageNotes(undefined)).toEqual([]);
  });
  it('coverage 고지(C-1) — 유니버스 제외: 건수≠종목수 구분', () => {
    const notes = journalCoverageNotes({ total: 75, imported: 45, skipped: 30, skippedNames: ['A', 'B', 'C', 'D'] });
    expect(notes[0]).toContain('75건 중 45건');
    expect(notes[0]).toContain('제외 30건');   // 거래 건수
    expect(notes[0]).toContain('종목 4개');       // distinct 종목수(≠30)
    expect(notes[0]).toContain('A·B·C…');         // 상위 3개 + 말줄임
    expect(notes[0]).toContain('분석 범위 밖');
  });
  it('coverage 고지(C-1) — 종목명 없이 건수만', () => {
    const notes = journalCoverageNotes({ total: 10, imported: 8, skipped: 2, skippedNames: [] });
    expect(notes[0]).toContain('제외 2건');
    expect(notes[0]).not.toContain('종목');
  });
  it('coverage 고지 — 두 축(유니버스 + 미매칭 매도) 동시', () => {
    const notes = journalCoverageNotes({ total: 75, imported: 45, skipped: 30, skippedNames: ['A'], unmatchedSellCount: 3 });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('분석 범위 밖');
    expect(notes[1]).toContain('매도 3건');
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
  it('킬러 한 줄(C-2) — 실현 전부 이익 + 미실현 손실 N종목, asOfDate 포함·"지금" 미포함', () => {
    const r = readOpenLossHeadline({ roundtripCount: 4, realizedLossCount: 0, winCount: 4, openLossCount: 3, openLossAvgHoldDays: 27, asOfDate: '2025-08-27' });
    expect(r.available).toBe(true);
    expect(r.text).toContain('청산 4건은 전부 이익');
    expect(r.text).toContain('손실인 종목이 3개');
    expect(r.text).toContain('27일');
    expect(r.text).toContain('2025-08-27');      // asOfDate 명시
    expect(r.text).toContain('최근 종가');
    expect(r.text).not.toContain('지금');          // "지금" 금지
  });
  it('킬러 한 줄(C-2) — 실현에 손실 섞이면 "전부 이익" 제거', () => {
    const r = readOpenLossHeadline({ roundtripCount: 4, realizedLossCount: 1, winCount: 3, openLossCount: 2, openLossAvgHoldDays: 10, asOfDate: '2025-08-27' });
    expect(r.available).toBe(true);
    expect(r.text).not.toContain('전부 이익');
    expect(r.text).toContain('손실인 종목이 2개');
  });
  it('킬러 한 줄(C-2, 리뷰) — 본전(pnl=0) 섞이면 "전부 이익" 미표시(realizedLossCount=0이어도)', () => {
    // 3청산 = 2이익 + 1본전 → realizedLossCount 0이지만 winCount 2 < 3 → "전부 이익" 금지
    const r = readOpenLossHeadline({ roundtripCount: 3, realizedLossCount: 0, winCount: 2, openLossCount: 1, openLossAvgHoldDays: 5, asOfDate: '2025-08-27' });
    expect(r.text).not.toContain('전부 이익');
    expect(r.text).toContain('손실인 종목이 1개');
  });
  it('킬러 한 줄(C-2) — 미실현 손실 0 또는 asOfDate 없으면 available:false', () => {
    expect(readOpenLossHeadline({ openLossCount: 0, asOfDate: '2025-08-27' }).available).toBe(false);
    expect(readOpenLossHeadline({ openLossCount: 3, asOfDate: null }).available).toBe(false);
    expect(readOpenLossHeadline(undefined).available).toBe(false);
  });
  it('킬러 한 줄(C-2) — 평가 불가 종목 있으면 고지', () => {
    const r = readOpenLossHeadline({ roundtripCount: 2, realizedLossCount: 0, openLossCount: 1, openLossAvgHoldDays: 5, asOfDate: '2025-08-27', unvaluedCount: 2 });
    expect(r.text).toContain('시세 정보가 없는 2종목');
  });
  it('평단 하향 추가매수(C-3) — 건수 + 종목명 예시, "물타기/편향" 미사용', () => {
    const r = readAvgDown({ key: 'avgdown', available: true, count: 3, codes: ['DEEP'], names: ['딥노이드'], flag: true, thresholds: { perStockMin: 2 } });
    expect(r.text).toContain('평단을 낮춘 매수가 3건');
    expect(r.text).toContain('딥노이드');
    expect(r.text).not.toContain('물타기');
    expect(r.text).not.toContain('편향');
  });
  it('평단 하향 추가매수(C-3) — 0건이면 중립 서술', () => {
    const r = readAvgDown({ key: 'avgdown', available: true, count: 0 });
    expect(r.available).toBe(true);
    expect(r.text).toContain('눈에 띄지 않았어요');
  });
  it('평단 하향 추가매수(C-3) — 비교 불가면 available:false', () => {
    expect(readAvgDown({ key: 'avgdown', available: false }).available).toBe(false);
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
  // coverage 고지(F2 미매칭 매도 + C-1 유니버스 제외)
  for (const n of [0, 1, 3, 999]) texts.push(...journalCoverageNotes({ unmatchedSellCount: n }));
  const univ: Array<[number, number, number, string[]]> = [
    [75, 45, 30, ['딥노이드', '알루코', '유유제약', '기타']], [10, 8, 2, []], [0, 0, 0, []],
  ];
  for (const [t, im, sk, nm] of univ) {
    texts.push(...journalCoverageNotes({ total: t, imported: im, skipped: sk, skippedNames: nm }));
  }
  // 킬러 한 줄(C-2) — 실현 이익/손실 혼합 × 미실현 손실수 × unvalued (winCount로 allProfit 분기 커버)
  for (const rl of [0, 2]) for (const ol of [0, 1, 5]) for (const uv of [0, 3]) {
    texts.push(readOpenLossHeadline({ roundtripCount: 4, realizedLossCount: rl, winCount: 4 - rl, openLossCount: ol, openLossAvgHoldDays: 12, asOfDate: '2025-08-27', unvaluedCount: uv }).text);
  }
  // 평단 하향 추가매수(C-3) — available/flag/count 조합
  for (const avail of [true, false]) for (const flag of [true, false]) for (const cnt of [0, 1, 5]) {
    texts.push(readAvgDown({ key: 'avgdown', available: avail, count: cnt, codes: ['DEEP', 'ALU', 'YU', 'X'], names: ['딥노이드', '알루코', '유유제약', '기타'], flag, thresholds: { perStockMin: 2 } }).text);
  }
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
