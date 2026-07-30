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

// ── 추격매수 — 급등 직후 매수 비율 + coverage ──
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
};

// biases[] → JournalReading[] (서버 순서 유지, 미지원 키는 스킵)
export function readBiases(biases: JournalBias[]): JournalReading[] {
  return (biases || []).filter(b => READERS[b.key]).map(b => READERS[b.key](b));
}

// F2(리뷰) — 매수기록 없는 매도(업로드 구간 이전 보유분)가 지표에서 빠졌음을 관찰형으로 고지.
// coverage.unmatchedSellCount>0 이면 각주 문자열, 아니면 null. 판단어 없음.
export function journalCoverageNote(coverage: { unmatchedSellCount?: number } | null | undefined): string | null {
  const n = num(coverage?.unmatchedSellCount);
  if (n <= 0) return null;
  return `업로드 구간 이전에 사둔 물량의 매도 ${n}건은 승률·손익 계산에서 빠졌어요.`;
}

export const JOURNAL_DISCLAIMER =
  '※ 본인 거래 데이터를 관찰용으로 풀어드린 거예요. 판정이 아니라 참고이고, 투자 판단과 거래는 직접·증권사 앱에서 진행하시면 돼요.';
