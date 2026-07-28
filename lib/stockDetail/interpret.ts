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
  key: 'valuation' | 'financial' | 'technical' | 'flow';
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

// ── 종합 — 상충을 짚고 결론 유보 ──
export function synthesize(interps: Interpretation[]): string {
  const avail = interps.filter(x => x.available);
  if (avail.length === 0) return '아직 풀이할 정보가 부족해요.';
  const pos = avail.filter(x => x.tone === 'positive').map(x => x.label);
  const cau = avail.filter(x => x.tone === 'caution').map(x => x.label);
  if (pos.length > 0 && cau.length > 0) {
    return `${pos.join('·')} 쪽은 긍정적이지만 ${cau.join('·')} 쪽은 주의가 필요해요. 서로 엇갈려 판단이 애매한 구간이에요.`;
  }
  if (pos.length > 0) {
    return `${pos.join('·')} 쪽이 대체로 긍정적인 편이에요. 다만 지표만으로 단정하긴 이르고, 아직 백테스팅으로 검증된 기준은 아니에요.`;
  }
  if (cau.length > 0) {
    return `${cau.join('·')} 쪽은 주의가 필요한 편이에요. 다만 지표만으로 단정하긴 이르고, 아직 백테스팅으로 검증된 기준은 아니에요.`;
  }
  return '지표들이 뚜렷한 방향을 보이지 않아요. 판단이 애매한 구간이에요.';
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
