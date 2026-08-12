// D — 성과 귀인(종목별 기여 분해). 순수 모듈(API·DB 의존 0) → 단위 테스트 대상.
//
// 답하려는 질문: "내 계좌가 왜 -36%인가." 답은 판정이 아니라 **출처의 사실**이다.
// 사용자가 실제로 보고 있는 그 숫자를 종목별로 쪼개 어디서 왔는지만 말한다.
//
// 안전 원칙:
//  · 기여도는 **크기 사실**이지 잘잘못이 아니다. '효자'·'발목'·'주범' 같은 종목 가치 판정 금지.
//    (+ 기여 종목도 칭찬하지 않는다 — 대칭이어야 판정이 아니다.)
//  · 앵커링 강화 금지 — '회복'·'만회'·'본전'을 말하지 않는다(B positionAnchor와 정합).
//  · 매도·정리 지시 금지. 집중 임계는 provisional.
//
// ⚠️ SSOT: 대시보드 히어로의 손익률과 **같은 함수**로 계산한다(computePortfolioTotals).
//    따로 재계산하면 반올림·유효행 기준 차이로 "히어로 -36%인데 기여 합계는 -35%"가 된다 —
//    40행 history를 '52주'라 부르던 사고, positionAnchor 위치 재계산 문제와 같은 계열이다.

import type { Holding } from '@/types/stock';

export interface Contribution {
  code: string;
  name: string;
  contribPP: number;   // 전체 원금 대비 기여 (%p, 부호 있음). 반올림하지 않는다 — 표시할 때만 반올림.
  weightPct: number;   // 참고: 원금 비중(%)
}

export interface PortfolioTotals {
  totalAsset: number;
  totalCost: number;
  totalPnL: number;
  profitRatePct: number;
  validCount: number;    // 계산에 든 보유 행 수
  skippedCount: number;  // 값이 모자라 빠진 행 수(평단·수량·현재가 결측)
}

export interface AttributionResult {
  available: boolean;
  portfolioProfitRate: number;      // Σ contribPP 와 일치(히어로와 같은 값)
  contributions: Contribution[];    // |contribPP| 내림차순
  topContributor: Contribution | null;
  concentrated: boolean;            // 한 종목이 전체 손익 변동의 과반 (중립 사실, provisional)
  text: string;
}

// 한 종목이 전체 손익 변동에서 차지하는 비중이 이 값을 넘으면 '집중'으로 본다.
// **provisional** — 실증 검증 전 임시값(Phase 4 백테스팅 대상).
export const CONCENTRATION_SHARE = 0.5;

// 문장에 이름을 나열하는 최대 종목 수. 나머지는 '외 N종목'.
const NAMED_LIMIT = 3;

const finite = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v) ? v : null);

// 계산에 쓸 수 있는 행만 남긴다. 값이 모자란 행을 0으로 밀어 넣으면 분해가 조용히 틀어진다.
function validRows(holdings: Holding[] | null | undefined): Holding[] {
  return (holdings || []).filter(h => {
    if (!h || !h.code) return false;
    const avg = finite(h.avgPrice), qty = finite(h.quantity), cur = finite(h.currentPrice);
    return avg !== null && avg > 0 && qty !== null && qty > 0 && cur !== null;
  });
}

// 포트폴리오 합계 — 대시보드 히어로와 **공유**한다(양쪽이 각자 계산하면 반드시 갈린다).
export function computePortfolioTotals(holdings: Holding[] | null | undefined): PortfolioTotals {
  const rows = validRows(holdings);
  const totalAsset = rows.reduce((a, h) => a + h.currentPrice * h.quantity, 0);
  const totalCost = rows.reduce((a, h) => a + h.avgPrice * h.quantity, 0);
  const totalPnL = totalAsset - totalCost;
  return {
    totalAsset, totalCost, totalPnL,
    profitRatePct: totalCost > 0 ? (totalPnL / totalCost) * 100 : 0,
    validCount: rows.length,
    skippedCount: (holdings || []).length - rows.length,
  };
}

// 부호 붙인 %p 표기. 0은 '+0.0'이 아니라 '0.0'.
const pp = (v: number): string => {
  const s = v.toFixed(1);
  return Number(s) > 0 ? `+${s}%p` : `${s}%p`;
};
const pct = (v: number): string => {
  const s = v.toFixed(1);
  return Number(s) > 0 ? `+${s}%` : `${s}%`;
};

export function interpretAttribution(holdings: Holding[] | null | undefined): AttributionResult {
  const empty: AttributionResult = {
    available: false, portfolioProfitRate: 0, contributions: [], topContributor: null,
    concentrated: false, text: '',
  };

  const rows = validRows(holdings);
  if (rows.length === 0) return empty;

  const totals = computePortfolioTotals(rows);
  if (!(totals.totalCost > 0)) return empty;

  const contributions: Contribution[] = rows
    .map(h => ({
      code: h.code,
      name: h.name || h.code,
      contribPP: ((h.currentPrice - h.avgPrice) * h.quantity / totals.totalCost) * 100,
      weightPct: (h.avgPrice * h.quantity / totals.totalCost) * 100,
    }))
    // 크기 순 — 방향(부호)이 아니라 **얼마나 움직였나**로 정렬한다. 동률은 코드 오름차순으로 고정.
    .sort((a, b) => (Math.abs(b.contribPP) - Math.abs(a.contribPP)) || a.code.localeCompare(b.code));

  const rate = totals.profitRatePct;
  const top = contributions[0];

  // 보유 1종목 — 분해가 자명하다(전부 그 종목). 과잉 분해하지 않는다.
  if (contributions.length === 1) {
    return {
      available: true, portfolioProfitRate: rate, contributions, topContributor: top,
      concentrated: false,
      text: `보유가 1종목이라 평가손익 ${pct(rate)}가 전부 ${top.name}에서 나와요.`,
    };
  }

  // 집중도는 **총 변동량(Σ|기여|) 대비**로 본다.
  //
  // 지시문 초안은 |top| >= |전체 손익률| × 0.5 였는데, 이익과 손실이 상쇄돼 전체 손익률이
  // 0 근처면 분모가 0으로 수렴해 **항상 집중**으로 판정된다(예: +30%p와 -30%p 두 종목 →
  // 전체 0%, 분모 0 → concentrated). 그 상태에서 "한 종목이 좌우한다"는 사실이 아니다.
  // 총 변동량 기준이면 상쇄와 무관하게 "이 종목이 움직임의 절반 이상"이라는 문장 그대로가 참이다.
  const grossPP = contributions.reduce((a, c) => a + Math.abs(c.contribPP), 0);
  const concentrated = grossPP > 0 && Math.abs(top.contribPP) >= grossPP * CONCENTRATION_SHARE;

  const named = contributions.slice(0, NAMED_LIMIT);
  const rest = contributions.length - named.length;

  const parts: string[] = [`지금 평가손익은 ${pct(rate)}예요.`];
  // 가치 판정 없이 크기만 — '가장 크다'는 정도 표현이지 잘잘못이 아니다.
  //
  // 종목명 뒤에 '이에요/예요'를 붙이지 않는다: 받침 유무로 갈리는데 종목명은 영문·숫자로도
  // 끝나(LG, POSCO홀딩스, KODEX 200) 발음 기준이라 규칙으로 판정할 수 없다.
  // '~의 기여가 가장 커요'는 어떤 이름 뒤에서도 성립한다.
  parts.push(`${top.name}의 기여가 가장 커요(전체의 ${pp(top.contribPP)}).`);
  if (named.length > 1) {
    const others = named.slice(1).map(c => `${c.name} ${pp(c.contribPP)}`).join(', ');
    parts.push(rest > 0 ? `다음은 ${others} 순이고, 외 ${rest}종목이 있어요.` : `다음은 ${others} 순이에요.`);
  }
  if (concentrated) {
    parts.push('이 한 종목이 전체 손익 변동의 절반 이상을 차지해요.');
  }

  return {
    available: true,
    portfolioProfitRate: rate,
    contributions,
    topContributor: top,
    concentrated,
    text: parts.join(' '),
  };
}
