// 4.5c차 — 데이터·지표를 초보자 언어로 풀이하는 순수 함수 모음.
//
// 안전 원칙(절대 준수):
// 1. 사실 + 초보자 풀이까지만. 정도 표현(높은/낮은/많은/적은/싼/비싼 편)은 허용.
//    판단 단어(좋다/나쁘다/위험/사라/팔라)는 금지 — interpret.test.ts가 전 출력 순회 검사.
// 2. 종합(synthesize)은 상충을 짚되 결론 유보. "사라/팔라" 절대 금지.
// 3. 데이터 없으면 available:false — 억지로 해석하지 않는다.
// 4. 관찰형 서술(3.11). 미검증 신호를 "예측"으로 표현하지 않는다.
//
// tone은 색이 아니라 synthesize의 상충 집계용 논리 구분(UI는 무채색 렌더 권장).

export interface Interpretation {
  key: 'valuation' | 'financial' | 'technical' | 'flow' | 'growth' | 'cashflow' | 'priceContext';
  label: string;
  text: string;
  tone: 'positive' | 'caution' | 'neutral';
  available: boolean;
}

const NA = (key: Interpretation['key'], label: string): Interpretation =>
  ({ key, label, text: '', tone: 'neutral', available: false });

// value가 기준(ref)보다 낮으면/높으면/비슷하면 — band(기본 ±10%) 안이면 '비슷'.
function relation(value: number, ref: number, band = 0.1): 'low' | 'high' | 'similar' {
  if (ref <= 0) return 'similar';
  const diff = (value - ref) / ref;
  if (Math.abs(diff) <= band) return 'similar';
  return diff < 0 ? 'low' : 'high';
}

// ── 밸류에이션 — PER/PBR + 업종 중앙값 ──
export function interpretValuation(
  per: number | null | undefined,
  pbr: number | null | undefined,
  roe: number | null | undefined,
  sectorMedianPer: number | null | undefined,
  sectorMedianPbr: number | null | undefined,
): Interpretation {
  if (per === null || per === undefined) return NA('valuation', '밸류');
  if (per <= 0) {
    return { key: 'valuation', label: '밸류', tone: 'neutral', available: true,
      text: '이익이 마이너스라(적자) PER로 주가 수준을 평가하기 어려워요.' };
  }
  if (sectorMedianPer && sectorMedianPer > 0) {
    const rel = relation(per, sectorMedianPer);
    const word = rel === 'low' ? '낮아요' : rel === 'high' ? '높아요' : '비슷해요';
    const gloss = rel === 'low' ? '이익 대비 주가가 싼 편이에요.'
      : rel === 'high' ? '이익 대비 주가가 비싼 편이에요.'
      : '이익 대비 주가가 업종과 비슷한 수준이에요.';
    const tone = rel === 'low' ? 'positive' : rel === 'high' ? 'caution' : 'neutral';
    return { key: 'valuation', label: '밸류', tone, available: true,
      text: `PER ${per}배로 업종 중앙값(${sectorMedianPer}배)보다 ${word} ${gloss}` };
  }
  // 업종 중앙값 없으면 절대 수준으로 풀이
  const tone = per < 10 ? 'positive' : per < 20 ? 'neutral' : 'caution';
  const gloss = per < 10 ? '이익 대비 주가가 낮은 편이에요.'
    : per < 20 ? '이익 대비 주가가 보통 수준이에요.'
    : '이익 대비 주가가 높은 편이에요.';
  return { key: 'valuation', label: '밸류', tone, available: true, text: `PER ${per}배예요. ${gloss}` };
}

// ── 재무 건전성 — DART 재무상태표(자산/부채/자본) ──
export function interpretFinancial(
  assets: number | null | undefined,
  liabilities: number | null | undefined,
  equity: number | null | undefined,
): Interpretation {
  if (liabilities === null || liabilities === undefined || equity === null || equity === undefined) {
    return NA('financial', '재무');
  }
  if (equity <= 0) {
    return { key: 'financial', label: '재무', tone: 'caution', available: true,
      text: '자본이 마이너스예요(자본잠식). 재무 상태를 특히 주의 깊게 살펴봐야 해요.' };
  }
  const debtRatio = Math.round((liabilities / equity) * 100);
  if (debtRatio < 100) {
    // 정도표현만 — '탄탄/건전/안전' 같은 품질 판정은 금지(사실+정도까지만).
    return { key: 'financial', label: '재무', tone: 'positive', available: true,
      text: `부채가 자본의 ${debtRatio}%예요. 빚보다 자기 돈(자본)이 많은 편이에요.` };
  }
  if (debtRatio <= 200) {
    return { key: 'financial', label: '재무', tone: 'caution', available: true,
      text: `부채가 자본의 ${debtRatio}%예요. 빚이 자기 돈보다 많은 편이라 이자 부담을 살펴봐야 해요.` };
  }
  return { key: 'financial', label: '재무', tone: 'caution', available: true,
    text: `부채가 자본의 ${debtRatio}%예요. 빚 비중이 상당히 높은 편이에요.` };
}

// ── 기술 흐름 — SMA 위치 (관찰형) ──
export function interpretTechnical(
  price: number | null | undefined,
  sma5: number | null | undefined,
  sma20: number | null | undefined,
): Interpretation {
  if (price === null || price === undefined || sma5 === null || sma5 === undefined) {
    return NA('technical', '흐름');
  }
  const aboveSma5 = price > sma5;
  const aligned = sma20 !== null && sma20 !== undefined && sma5 > sma20;
  const belowBoth = price < sma5 && (sma20 === null || sma20 === undefined || price < sma20);
  if (belowBoth) {
    return { key: 'technical', label: '흐름', tone: 'caution', available: true,
      text: '주가가 5일·20일 평균선 아래에 있어요. 최근 흐름은 약한 편이에요.' };
  }
  if (aboveSma5 && aligned) {
    return { key: 'technical', label: '흐름', tone: 'positive', available: true,
      text: '5일선이 20일선 위에 있고 주가가 그 위예요. 단기 흐름은 상승 쪽이에요.' };
  }
  return { key: 'technical', label: '흐름', tone: 'neutral', available: true,
    text: '주가가 단기 평균선 근처에서 오르내려요. 방향이 뚜렷하지 않아요.' };
}

// ── 수급 — 외국인/기관 연속 순매수(+)/순매도(-) 스트릭 (관찰형) ──
// foreignStreak/institutionStreak: 양수=연속 순매수 일수, 음수=연속 순매도 일수, 0=뚜렷한 흐름 없음.
export function interpretFlow(foreignStreak: number, institutionStreak: number): Interpretation {
  const f = foreignStreak || 0;
  const i = institutionStreak || 0;
  if (f === 0 && i === 0) return NA('flow', '수급');
  const parts: string[] = [];
  if (f > 0) parts.push(`외국인이 ${f}일 연속 사고 있어요`);
  else if (f < 0) parts.push(`외국인이 ${-f}일 연속 팔고 있어요`);
  if (i > 0) parts.push(`기관이 ${i}일 연속 사고 있어요`);
  else if (i < 0) parts.push(`기관이 ${-i}일 연속 팔고 있어요`);
  // tone: 둘 다 매수 → positive, 둘 다 매도 → caution, 엇갈리거나 한쪽만 → 방향 따라
  const buys = (f > 0 ? 1 : 0) + (i > 0 ? 1 : 0);
  const sells = (f < 0 ? 1 : 0) + (i < 0 ? 1 : 0);
  const tone = buys > 0 && sells === 0 ? 'positive' : sells > 0 && buys === 0 ? 'caution' : 'neutral';
  return { key: 'flow', label: '수급', tone, available: true, text: `${parts.join('. ')}.` };
}

// ─────────────────────────────────────────────────────────────
// Phase A — 관점 3종. 서버 원시 사실(숫자) → 관찰 문구.
// 계산-문구 일치가 최우선: 서버가 못 준 값은 서술하지 않는다(억지 해석 금지).
// ─────────────────────────────────────────────────────────────

export interface GrowthMetricFacts {
  current: number;
  previous: number;
  changePct: number | null;                                  // 전년 동기 대비 %. 분모 ≤ 0이면 null
  turnaround: 'to_profit' | 'to_loss' | 'stay_loss' | null;  // %를 쓸 수 없을 때의 사실 분류
  label?: string;
}
export interface GrowthFacts {
  available: boolean;
  revenue?: GrowthMetricFacts | null;
  profit?: GrowthMetricFacts | null;
}
export interface CashflowFacts {
  available: boolean;
  operating?: number;
  netIncome?: number | null;
  ratio?: number | null;   // 영업현금 ÷ 순이익. 순이익 ≤ 0이면 null(부호 뒤집힘 방지)
}
export interface PriceContextFacts {
  volatility: { dailyPct: number; days: number } | null;
  range: { high: number; low: number; days: number; positionPct: number | null } | null;
}

// 증감 방향을 말로. 0은 '거의 같아요'(반올림 후 0.0%인 경우 포함).
const deltaWord = (pct: number): string => (pct > 0 ? '늘었' : pct < 0 ? '줄었' : '거의 같');

// ── A1. 실적 성장 추세 — 매출·이익 전년 동기(YoY) ──
// DART 손익은 연초부터 누적(YTD)이라 **같은 분기끼리만** 비교한다(서버 derive.js에서 보장).
export function interpretGrowth(
  g: GrowthFacts | null | undefined,
  period?: string | null,
  prevPeriod?: string | null,
): Interpretation {
  if (!g || !g.available) return NA('growth', '성장');
  const rev = g.revenue || null;
  const prof = g.profit || null;
  if (!rev && !prof) return NA('growth', '성장');

  const parts: string[] = [];
  let up = 0, down = 0;

  if (rev) {
    if (rev.changePct !== null) {
      parts.push(`매출이 작년 같은 기간보다 ${Math.abs(rev.changePct)}% ${deltaWord(rev.changePct)}어요`);
      if (rev.changePct > 0) up++; else if (rev.changePct < 0) down++;
    } else {
      // 분모가 0 이하 — 퍼센트를 만들지 않고 사실만.
      parts.push('작년 같은 기간 매출과 바로 비교하기 어려워요');
    }
  }
  if (prof) {
    const name = prof.label || '이익';
    if (prof.changePct !== null) {
      parts.push(`${name}은 ${Math.abs(prof.changePct)}% ${deltaWord(prof.changePct)}어요`);
      if (prof.changePct > 0) up++; else if (prof.changePct < 0) down++;
    } else if (prof.turnaround === 'to_profit') {
      parts.push(`${name}은 작년 같은 기간 적자에서 흑자로 바뀌었어요`);
      up++;
    } else if (prof.turnaround === 'to_loss') {
      parts.push(`${name}은 작년 같은 기간 흑자에서 적자로 바뀌었어요`);
      down++;
    } else if (prof.turnaround === 'stay_loss') {
      parts.push(`${name}은 작년 같은 기간에 이어 적자예요`);
      down++;
    }
  }
  if (parts.length === 0) return NA('growth', '성장');

  const tone: Interpretation['tone'] = up > 0 && down === 0 ? 'positive' : down > 0 && up === 0 ? 'caution' : 'neutral';
  const gloss = tone === 'positive' ? ' 사업 규모가 커지는 편이에요.'
    : tone === 'caution' ? ' 사업 규모가 작아지는 편이에요.'
    : '';
  // 누적 기준 캐비엇 — 어떤 기간끼리 비교했는지 명시(계산-문구 일치).
  const basis = period && prevPeriod ? ` ${period} 누적치를 ${prevPeriod} 누적치와 비교했어요.` : '';
  return { key: 'growth', label: '성장', tone, available: true, text: `${parts.join(', ')}.${gloss}${basis}` };
}

// ── A2. 현금흐름 질 — 영업활동현금흐름 vs 당기순이익 ──
export function interpretCashflowQuality(
  c: CashflowFacts | null | undefined,
  period?: string | null,
): Interpretation {
  if (!c || !c.available || c.operating === null || c.operating === undefined) return NA('cashflow', '현금');
  const basis = period ? ` ${period} 누적 기준이에요.` : '';
  const cfo = c.operating;

  if (cfo < 0) {
    return { key: 'cashflow', label: '현금', tone: 'caution', available: true,
      text: `영업활동에서 현금이 들어온 것보다 나간 게 많았어요(순유출).${basis}` };
  }
  if (c.ratio !== null && c.ratio !== undefined) {
    if (c.ratio >= 1) {
      return { key: 'cashflow', label: '현금', tone: 'positive', available: true,
        text: `장부상 이익보다 실제 들어온 영업현금이 더 많아요(순이익의 ${c.ratio}배). 이익이 현금으로 잘 들어오는 편이에요.${basis}` };
    }
    return { key: 'cashflow', label: '현금', tone: 'caution', available: true,
      text: `영업활동 현금이 순이익의 ${c.ratio}배로 적은 편이에요. 이익이 아직 현금으로 다 들어오진 않았어요.${basis}` };
  }
  // 순이익이 0 이하거나 없어서 배수를 낼 수 없는 경우 — 부호 사실만.
  const lossNote = c.netIncome !== null && c.netIncome !== undefined && c.netIncome <= 0
    ? '장부상으로는 이익이 나지 않았지만, ' : '';
  return { key: 'cashflow', label: '현금', tone: 'neutral', available: true,
    text: `${lossNote}영업활동에서는 현금이 들어왔어요.${basis}` };
}

// ── A3. 가격 변동·위치 — 리스크/맥락 (방향 판단 아님 → tone은 항상 neutral) ──
// 임계값(3%/1.5%, 70%/30%)은 provisional. 표본 수(days)를 문구에 반영해 거짓 라벨을 막는다.
const VOL_HIGH_PCT = 3;
const VOL_LOW_PCT = 1.5;
const RANGE_YEAR_MIN_DAYS = 200;

export function interpretPriceContext(p: PriceContextFacts | null | undefined): Interpretation {
  if (!p || (!p.volatility && !p.range)) return NA('priceContext', '변동');
  const parts: string[] = [];

  if (p.volatility) {
    const { dailyPct, days } = p.volatility;
    const band = dailyPct >= VOL_HIGH_PCT ? '크게 오르내리는 편이에요'
      : dailyPct <= VOL_LOW_PCT ? '잔잔하게 움직이는 편이에요'
      : '보통 수준으로 움직이는 편이에요';
    parts.push(`최근 ${days}거래일 동안 하루 등락폭이 평균적으로 ±${dailyPct}% 수준이었어요. 가격이 ${band}.`);
  }
  if (p.range && p.range.positionPct !== null) {
    const { high, low, days, positionPct } = p.range;
    // 표본이 1년에 못 미치면 '1년'이라 부르지 않는다(기존 40행 → "52주" 오라벨 재발 방지).
    const spanLabel = days >= RANGE_YEAR_MIN_DAYS ? '최근 1년' : `최근 ${days}거래일`;
    const where = positionPct >= 70 ? '위쪽' : positionPct <= 30 ? '아래쪽' : '가운데';
    parts.push(`${spanLabel} 가격 범위(${low.toLocaleString()}~${high.toLocaleString()}원)에서 지금은 ${where}에 있어요(범위의 ${positionPct}% 지점).`);
  }
  if (parts.length === 0) return NA('priceContext', '변동');

  // 변동성·위치는 좋고 나쁨이 아니라 맥락 → tone neutral (균형 요약의 우호/비우호에 넣지 않는다).
  return { key: 'priceContext', label: '변동', tone: 'neutral', available: true, text: parts.join(' ') };
}

// ── 업종 내 위치 — PER/ROE 백분위를 말로 ([기업] 탭 업종비교용) ──
export function interpretSectorPosition(
  per: number | null | undefined,
  roe: number | null | undefined,
  medianPer: number | null | undefined,
  medianRoe: number | null | undefined,
): { text: string; available: boolean } {
  const parts: string[] = [];
  if (per !== null && per !== undefined && per > 0 && medianPer && medianPer > 0) {
    const rel = relation(per, medianPer);
    parts.push(`PER은 ${rel === 'low' ? '싼' : rel === 'high' ? '비싼' : '업종과 비슷한'} 편`);
  }
  if (roe !== null && roe !== undefined && medianRoe !== null && medianRoe !== undefined) {
    const rel = relation(roe, medianRoe);
    // ROE는 높을수록 자본 효율이 높다는 뜻이라 low/high 의미가 밸류와 반대
    parts.push(`ROE는 ${rel === 'high' ? '높은' : rel === 'low' ? '낮은' : '업종과 비슷한'} 편`);
  }
  if (parts.length === 0) return { text: '', available: false };
  return { text: `업종 내에서 ${parts.join(', ')}이에요.`, available: true };
}

// ── 균형 요약 (B2) — 판정이 아니라 **재료 분포** ──
//
// 단일 점수/등급으로 결론을 통보하지 않는다. 관찰한 관점이 어느 쪽으로 몇 개인지 세어주고,
// 어느 쪽이 더 중요한지는 사용자가 저울질하게 남긴다. "우호 우세 → 매수" 같은 결론 문장 금지.
// tone은 색이 아니라 이 집계를 위한 논리 구분이다(UI는 무채색).
export interface BalanceSummary {
  available: boolean;
  favorable: string[];    // 우호 쪽 관점 라벨
  unfavorable: string[];  // 비우호 쪽 관점 라벨
  neutral: string[];      // 어느 쪽도 아닌 맥락 관점(변동성·위치 등)
  total: number;
  text: string;
}

export function summarizeBalance(interps: Interpretation[]): BalanceSummary {
  const avail = (interps || []).filter(x => x && x.available);
  const favorable = avail.filter(x => x.tone === 'positive').map(x => x.label);
  const unfavorable = avail.filter(x => x.tone === 'caution').map(x => x.label);
  const neutral = avail.filter(x => x.tone === 'neutral').map(x => x.label);
  const base: Omit<BalanceSummary, 'text'> = { available: avail.length > 0, favorable, unfavorable, neutral, total: avail.length };

  if (avail.length === 0) return { ...base, text: '아직 풀이할 정보가 부족해요.' };

  // 1) 분포를 사실로 제시
  const counts: string[] = [];
  if (favorable.length) counts.push(`우호 ${favorable.length}개(${favorable.join('·')})`);
  if (unfavorable.length) counts.push(`비우호 ${unfavorable.length}개(${unfavorable.join('·')})`);
  if (neutral.length) counts.push(`중립 ${neutral.length}개(${neutral.join('·')})`);
  let text = `관찰한 ${avail.length}개 관점 중 ${counts.join(' · ')}예요.`;

  // 2) 상충이면 그 사실을 짚되 결론은 내지 않는다
  if (favorable.length > 0 && unfavorable.length > 0) {
    text += ' 관점끼리 서로 엇갈려요.';
  }

  // 3) 저울질은 사용자 몫 + 미검증 캐비엇
  text += ' 어느 쪽이 더 중요한지는 직접 저울질해 주세요. 개수가 많은 쪽이 정답은 아니고, 아직 백테스팅으로 검증된 기준도 아니에요.';
  return { ...base, text };
}

// 하위 호환 — 기존 호출부(텍스트만 필요한 곳)용 얇은 래퍼.
export function synthesize(interps: Interpretation[]): string {
  return summarizeBalance(interps).text;
}

// ── 연속 순매수(+)/순매도(-) 스트릭 계산 (오래된→최신 순 배열, 마지막이 최신) ──
export function consecutiveStreak(netsChrono: (number | null | undefined)[]): number {
  if (!netsChrono || netsChrono.length === 0) return 0;
  const last = netsChrono[netsChrono.length - 1];
  if (last === null || last === undefined || last === 0) return 0;
  const sign = last > 0 ? 1 : -1;
  let count = 0;
  for (let idx = netsChrono.length - 1; idx >= 0; idx--) {
    const v = netsChrono[idx];
    if (v === null || v === undefined) break;
    if ((sign > 0 && v > 0) || (sign < 0 && v < 0)) count++;
    else break;
  }
  return sign * count;
}
