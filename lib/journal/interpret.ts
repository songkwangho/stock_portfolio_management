// 4.5b차 — 거래일지 서버 metrics를 초보자 관찰형 한국어로 풀이하는 순수 함수 (4.5c interpret.ts와 동일 구조).
//
// 안전 원칙(절대 준수 — 이 기능은 태생이 판단적이라 원칙 위반 위험이 가장 큼):
// 1. 사용자 본인 숫자를 사실로 제시한다.
// 2. 편향은 중립 교육 정의 + 관찰형("~하는 흐름/경향이 보여요")까지만.
// 3. 금지: 잘못/실수/손해/후회 등 질책·판정어, 좋다/나쁘다/위험, 명령형(~세요/사라/팔라).
//    tests/journal/interpret.test.ts가 전 출력을 전수 검사(FORBIDDEN_JOURNAL).
// 4. 미검증 임계값 기반이므로 "예측"이 아니라 "관찰". "실증 검증 전" 뱃지는 UI가 붙인다.

export interface JournalBias {
  key: string;
  available: boolean;
  flag?: boolean;
  [k: string]: unknown;
}
export interface JournalReading {
  key: string;
  label: string;
  text: string;
  available: boolean;
}

const LABELS: Record<string, string> = {
  disposition: '이익·손실 보유기간',
  overtrading: '매매 빈도',
  chasing: '매수 시점',
  anchoring: '청산 시점',
  avgdown: '추가 매수 패턴',
};

const NOT_ENOUGH = '아직 이 항목을 볼 만큼 청산된 거래가 모이지 않았어요.';

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

// ── 처분효과 — 이익/손실 평균 보유일 두 숫자는 항상 사실로, 편향명은 서버 flag일 때만 ──
// F3(리뷰): 예전엔 l>w이기만 하면(0.1일 차·n=1도) "처분효과" 명명 → 과다 명명·소표본 노이즈.
// 이제 문턱(격차·표본)을 통과한 서버 b.flag가 true일 때만 명명한다. l>w 재계산 금지(서버 flag 사용).
export function readDisposition(b: JournalBias): JournalReading {
  const label = LABELS.disposition;
  if (!b || !b.available) return { key: 'disposition', label, text: NOT_ENOUGH, available: false };
  const w = num(b.winnerAvgHold);
  const l = num(b.loserAvgHold);
  let text = `이익이 난 종목은 평균 ${w}일, 손실이 난 종목은 평균 ${l}일 들고 계셨어요.`;
  if (b.flag === true) {
    text += ' 손실 종목을 더 오래 들고 가는 흐름이 보여요. 이익은 짧게, 손실은 길게 가져가는 경향을 처분효과라고 불러요.';
  } else {
    // 문턱 미달/역방향 — 편향명 없이 중립 서술만.
    const gap = num(b.gap);   // loserAvgHold - winnerAvgHold
    const th = (b.thresholds as { minGapDays?: number }) || {};
    const minGap = th.minGapDays ?? 3;
    if (Math.abs(gap) < minGap) text += ' 이익·손실 보유기간이 비슷한 편이에요.';
    else if (gap > 0) text += ' 손실 종목을 조금 더 오래 들고 가는 흐름이에요.';
    else text += ' 이익 종목을 조금 더 오래 들고 가는 흐름이에요.';
  }
  return { key: 'disposition', label, text, available: true };
}

// ── 과매매 — 월평균 매매횟수·평균 보유일 ──
export function readOvertrading(b: JournalBias): JournalReading {
  const label = LABELS.overtrading;
  if (!b || !b.available) return { key: 'overtrading', label, text: NOT_ENOUGH, available: false };
  const months = num(b.months);
  const perMonth = num(b.tradesPerMonth);
  const hold = b.avgHoldingDays == null ? null : num(b.avgHoldingDays);
  let text = `최근 약 ${months}개월 동안 월평균 ${perMonth}회 거래하셨어요`;
  text += hold == null ? '.' : `, 청산까지 평균 보유기간은 ${hold}일이에요.`;
  if (b.flag) text += ' 매매가 잦은 편인지 한 번 돌아볼 수 있는 구간이에요.';
  return { key: 'overtrading', label, text, available: true };
}

// ── 평단 하향 추가매수 — 하락 뒤 재매수로 평단 낮춘 매수 (C-3, 중립·관찰형) ──
// "물타기"·"편향"·판단어 미사용. 인과("이익만 실현이라 리스크")는 서술하지 않고 사실만.
export function readAvgDown(b: JournalBias): JournalReading {
  const label = LABELS.avgdown;
  if (!b || !b.available) {
    return { key: 'avgdown', label, text: '같은 종목을 두 번 이상 사신 기록이 아직 부족해요.', available: false };
  }
  const count = num(b.count);
  if (count === 0) {
    return { key: 'avgdown', label, text: '하락한 뒤 다시 사서 평단을 낮춘 매수는 눈에 띄지 않았어요.', available: true };
  }
  const names = Array.isArray((b as { names?: string[] }).names) ? (b as { names?: string[] }).names! : [];
  const codes = Array.isArray(b.codes) ? (b.codes as string[]) : [];
  const list = names.length ? names : codes;
  const shown = list.slice(0, 3).join('·');
  let text = `하락한 뒤 다시 사서 평단을 낮춘 매수가 ${count}건 있었어요`;
  if (shown) text += `(예: ${shown}${list.length > 3 ? '…' : ''})`;
  text += '.';
  if (b.flag) text += ' 같은 종목을 여러 번 낮춰 사신 경우도 있어요.';
  return { key: 'avgdown', label, text, available: true };
}

// ── 추격매수 — 급등 직후 매수 비율 + coverage ──
// C-3 재프레이밍: 평단 하향(하락 중 매수) 프로필에선 직전 N일 수익률이 음수라 추격 0%가 정합
// ('예상된 null'). 0/N은 버그가 아니라 하락 매수 성향의 자연스러운 결과일 수 있음.
export function readChasing(b: JournalBias): JournalReading {
  const label = LABELS.chasing;
  if (!b || !b.available) return { key: 'chasing', label, text: NOT_ENOUGH, available: false };
  const ratio = num(b.chasingRatio);
  const chased = num(b.chasedCount);
  const evaluated = num(b.evaluatedCount);
  const th = (b.thresholds as { lookbackDays?: number; surgePct?: number }) || {};
  const look = th.lookbackDays ?? 20;
  const surge = th.surgePct ?? 15;
  let text = `가격 기록이 있는 매수 ${evaluated}건 중 ${chased}건(${ratio}%)이 직전 ${look}일 동안 ${surge}% 이상 오른 뒤에 이뤄졌어요.`;
  const skipped = num((b.coverage as { skipped?: number })?.skipped);
  if (skipped > 0) text += ` (가격 기록이 부족한 ${skipped}건은 제외했어요.)`;
  if (b.flag) text += ' 오른 직후 따라 사는 흐름이 보이는지 참고해 볼 수 있어요.';
  return { key: 'chasing', label, text, available: true };
}

// ── 앵커링 — 본전 근처 청산 비율 ──
export function readAnchoring(b: JournalBias): JournalReading {
  const label = LABELS.anchoring;
  if (!b || !b.available) return { key: 'anchoring', label, text: NOT_ENOUGH, available: false };
  const ratio = num(b.anchoringRatio);
  const th = (b.thresholds as { nearBreakevenPct?: number }) || {};
  const pct = th.nearBreakevenPct ?? 3;
  let text = `청산한 거래의 ${ratio}%가 손익 ±${pct}% 근처(본전 부근)에서 이뤄졌어요.`;
  if (b.flag) text += ' 본전 근처에서 사고파는 흐름이 보여요.';
  return { key: 'anchoring', label, text, available: true };
}

const READERS: Record<string, (b: JournalBias) => JournalReading> = {
  disposition: readDisposition,
  overtrading: readOvertrading,
  chasing: readChasing,
  anchoring: readAnchoring,
  avgdown: readAvgDown,
};

// biases[] → JournalReading[] (서버 순서 유지, 미지원 키는 스킵)
export function readBiases(biases: JournalBias[]): JournalReading[] {
  return (biases || []).filter(b => READERS[b.key]).map(b => READERS[b.key](b));
}

export interface JournalCoverage {
  unmatchedSellCount?: number;
  total?: number;
  imported?: number;
  skipped?: number;
  skippedNames?: string[];
}

// C-1 + F2 — 커버리지 고지(지속형, 여러 축). 판단어 없음. 해당 없으면 빈 배열.
//   1) 유니버스 제외(적재 메타): 분석 대상 total 중 imported 분석, 제외 skipped건(종목 K개)은 범위 밖.
//   2) 미매칭 매도(F2): 업로드 구간 이전 보유분 매도는 승률·손익에서 빠짐.
export function journalCoverageNotes(coverage: JournalCoverage | null | undefined): string[] {
  const c = coverage || {};
  const notes: string[] = [];
  const skipped = num(c.skipped);
  if (skipped > 0) {
    const names = Array.isArray(c.skippedNames) ? c.skippedNames : [];
    const k = names.length;
    let note = `분석 대상 ${num(c.total)}건 중 ${num(c.imported)}건을 분석했어요. 제외 ${skipped}건`;
    if (k > 0) note += `(종목 ${k}개: ${names.slice(0, 3).join('·')}${k > 3 ? '…' : ''})`;
    note += `은 아직 분석 범위 밖이에요.`;
    notes.push(note);
  }
  const unmatched = num(c.unmatchedSellCount);
  if (unmatched > 0) {
    notes.push(`업로드 구간 이전에 사둔 물량의 매도 ${unmatched}건은 승률·손익 계산에서 빠졌어요.`);
  }
  return notes;
}

export interface OpenLossSummary {
  roundtripCount?: number;
  realizedLossCount?: number;
  openLossCount?: number;
  openLossAvgHoldDays?: number | null;
  asOfDate?: string | null;
  unvaluedCount?: number;
}

// C-2 — 미실현 손실 보유 킬러 한 줄. 실현이 전부 이익이면 그 사실을 나란히(인과 서술 금지 — 두 사실만).
// 스코프 캐비엇 2축을 문구에 내장: 가격="최근 종가(asOfDate) 기준", 수량="업로드하신 내역에서".
// ⚠️ "지금" 금지(asOfDate 명시). openLossCount==0 또는 asOfDate 없으면 available:false. 판단어 0.
export function readOpenLossHeadline(s: OpenLossSummary | null | undefined): { available: boolean; text: string } {
  const openLoss = num(s?.openLossCount);
  const asOf = s?.asOfDate;
  if (!s || openLoss <= 0 || !asOf) return { available: false, text: '' };
  const m = s.openLossAvgHoldDays == null ? null : num(s.openLossAvgHoldDays);
  const hold = m == null ? '' : `(평균 ${m}일 보유 중)`;
  const realizedCount = num(s.roundtripCount);
  const allProfit = num(s.realizedLossCount) === 0 && realizedCount > 0;
  const tail = `최근 종가(${asOf}) 기준 업로드하신 내역에서 아직 안 파신 보유분 중 손실인 종목이 ${openLoss}개예요${hold}.`;
  let text = allProfit ? `실현한 청산 ${realizedCount}건은 전부 이익이었는데, ${tail}` : tail;
  const unvalued = num(s.unvaluedCount);
  if (unvalued > 0) text += ` 시세 정보가 없는 ${unvalued}종목은 평가에서 빠졌어요.`;
  return { available: true, text };
}

export const JOURNAL_DISCLAIMER =
  '※ 본인 거래 데이터를 관찰용으로 풀어드린 거예요. 판정이 아니라 참고이고, 투자 판단과 거래는 직접·증권사 앱에서 진행하시면 돼요.';
