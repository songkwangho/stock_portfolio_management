// 스크리너 프리셋(렌즈) — **SSOT**.
//
// /screener 와 "종목 탐색"(/recommendations)의 인라인 렌즈 버킷이 같은 정의를 본다.
// 각자 필터를 들고 있으면 한쪽만 고쳤을 때 "같은 렌즈인데 결과가 다른" 상태가 되고,
// 캐비엇이 갈리면 한쪽 화면에서만 중립 프레임이 빠지는 사고로 이어진다.
//
// 문구 원칙: 이름·설명은 **걸러내는 조건**을 그대로 부른다. 가치 판정어(우량/유망)·매수 신호·
// 목표가·'적정가 upside' 금지. 캐비엇은 통과가 곧 매수 근거가 아님을 짚는다.

import type { ScreenerResult } from '@/types/stock';

export interface Preset {
  name: string;
  description: string;
  summary: string;
  filters: Record<string, string | number>;
  caveat?: string;
  isNew?: boolean;
  // D3 — /screener?preset=<slug> 딥링크 키. "종목 탐색"의 렌즈 칩이 이 값으로 연결된다.
  // filters.preset(서버 키)과 별개다 — 정적 프리셋(서버 키 없음)도 링크할 수 있어야 하고,
  // 서버 키가 바뀌어도 외부 링크가 깨지지 않게 하려면 표면 식별자를 분리해야 한다.
  slug?: string;
}

export const PRESETS: Preset[] = [
  {
    // M3 — '우량주'는 가치 판정어. 프리셋 이름은 걸러낸 조건을 그대로 부른다.
    name: '저평가 고ROE주',
    description: 'PER↓ ROE↑ — 저평가 가능성',
    summary: 'PER < 15 + ROE > 10%',
    filters: { perMax: 15, roeMin: 10 },
    caveat: '금융·통신·자동차 업종이 많이 포함될 수 있어요. 이 업종은 원래 PER이 낮은 편이라 단순 저평가로 보기 어려워요.',
  },
  {
    name: '자산 저평가주',
    description: 'PBR↓ — 자산 대비 저평가',
    summary: 'PBR ≤ 1',
    filters: { pbrMax: 1 },
    caveat: '자산 대비 저평가지만 사업이 부진한 경우도 많아요. ROE를 함께 확인해보세요.',
  },
  {
    name: '고ROE 성장주',
    description: 'ROE↑ — 자기자본 대비 이익이 큰 편',
    summary: 'ROE ≥ 20%',
    filters: { roeMin: 20 },
    slug: 'high-roe',
    caveat: '일시적 호황으로 ROE가 높을 수 있어요. 최근 분기 실적도 함께 봐주세요.',
  },
  {
    name: '소액 투자 가능',
    description: '적은 금액으로 시작',
    summary: '주가 ≤ 10만원',
    filters: { priceMax: 100000 },
    caveat: '주가가 낮다고 좋은 종목은 아니에요. 시가총액과 사업 내용을 꼭 확인하세요.',
  },
  // 3.7차 — 히스토리/수급 기반 동적 프리셋
  {
    name: '52주 신고가 돌파',
    // 방향단정 제거 — 걸러내는 조건(고점 부근)을 그대로 부른다.
    description: '52주 고점 부근',
    summary: '최근 1년 고점 대비 +0~N%',
    filters: { preset: 'breakout_52w' },
    slug: 'breakout-52w',
    caveat: '고점 돌파 후 단기 조정이 올 수 있어요. 거래량과 함께 확인하세요.',
    isNew: true,
  },
  {
    name: '외국인 순매수',
    description: '해외 큰손 매수 중',
    summary: '최근 5거래일 외국인 순매수 상위',
    filters: { preset: 'foreign_buy' },
    slug: 'foreign-buy',
    caveat: '외국인 매수가 항상 좋은 신호는 아니에요. 단기 흐름만으로 판단하지 마세요.',
    isNew: true,
  },
  {
    name: '기관·연기금 순매수',
    description: '국내 기관 매수 중',
    summary: '최근 5거래일 기관 순매수 상위',
    filters: { preset: 'fund_buy' },
    caveat: '기관 매수도 단기 트레이딩일 수 있어요. 장기 관점에서 함께 판단하세요.',
    isNew: true,
  },
  {
    name: '소외된 종목',
    description: '역발상 — 관심 줄어든 종목',
    summary: '30일 평균 대비 거래량 < 30%',
    filters: { preset: 'neglected' },
    slug: 'neglected',
    caveat: '소외됐다고 무조건 좋은 종목이 아니에요. 하락 추세 중일 수도 있으니 지표를 함께 보세요.',
    isNew: true,
  },
  // 3.8차 — vibe-investing 접목
  {
    name: '그레이엄 저평가',
    description: '내재가치 — 기준가가 현재가보다 높은 종목',
    summary: 'Graham Number > 현재가',
    filters: { preset: 'graham' },
    slug: 'graham',
    caveat: '그레이엄 공식은 안정적인 이익을 내는 기업에 적합해요. 적자·바이오·성장주에는 맞지 않아요.',
    isNew: true,
  },
  {
    name: '3개월 상승폭 상위',
    description: '모멘텀 — 최근 3개월 상승률 상위',
    summary: '90일 전 대비 +N%',
    filters: { preset: 'momentum_3m' },
    caveat: '많이 오른 종목은 단기 조정이 올 수 있어요. 거래량과 이평선을 함께 확인하세요.',
    isNew: true,
  },
];

// C — "종목 탐색"의 인라인 렌즈 칩. slug는 아래 Preset.slug와 맞물린다
// (라벨만 더 풀어 쓴다 — 스크리너는 조건 이름, 탐색 페이지는 초보자용 설명).
// 여기 두는 이유: 칩과 프리셋이 다른 파일에 있으면 slug 오타가 죽은 칩으로 조용히 남는다.
export const LENSES = [
  { slug: 'graham', label: '밸류 렌즈 — 자산·이익 대비 낮은 가격' },
  { slug: 'high-roe', label: '수익성 렌즈 — 자기자본 대비 이익 큼' },
  { slug: 'foreign-buy', label: '수급 렌즈 — 외국인 순매수' },
  { slug: 'breakout-52w', label: '가격 위치 렌즈 — 52주 고점 근처' },
  { slug: 'neglected', label: '거래량 렌즈 — 평소보다 조용함' },
] as const;

// 활성 프리셋에 따라 종목별로 표시할 보조 지표 문구.
// 정적 프리셋(저평가/자산/성장/소액)은 서버 키가 없어 null → 호출부가 기본 표시를 유지한다.
export function presetMetric(presetKey: string | undefined, stock: ScreenerResult): string | null {
  if (!presetKey) return null;
  if (presetKey === 'breakout_52w') {
    if (stock.breakout_pct === null || stock.breakout_pct === undefined) return null;
    const pct = stock.breakout_pct;
    return pct >= 0 ? `52주 고점 돌파 +${pct}%` : `52주 고점 ${pct}% 근접`;
  }
  // 수급 두 프리셋은 **매그니튜드를 말하지 않는다**.
  //
  // 이전 코드는 `Math.round(sum / 1_0000_0000)`에 `// 원 → 억` 주석을 달고 "N억 순매수"라
  // 찍었는데, `investor_history.foreign_net`·`institution`은 네이버 외국인·기관 표에서 온
  // **순매매량(주)** 이지 거래대금(원)이 아니다 → 단위(주≠원)·스케일 이중 오류.
  // 순매매량이 1억 주 미만이면 0으로 반올림돼 조용히 fallback으로 빠졌을 뿐,
  // 1억 주를 넘는 순간 **틀린 "N억"** 이 뜬다(표시-계산 일치 위반).
  //
  // 금액(원) 환산은 하지 않는다 — `price × shares`는 측정하지 않은 "순매수 금액"을
  // 지어내는 것이라 R2 위반이다. 두 프리셋은 **정의상 순매수 상위**라 배지가 이미 사실을
  // 전달하고, 초보자에게 순매매량(주)은 와닿지도 않는다.
  if (presetKey === 'foreign_buy') return '외국인 순매수 중';
  if (presetKey === 'fund_buy') return '기관 순매수 중';
  if (presetKey === 'neglected') {
    if (stock.vol_ratio === null || stock.vol_ratio === undefined) return null;
    return `30일 평균의 ${stock.vol_ratio}% 거래량`;
  }
  if (presetKey === 'graham') {
    // Part 2 — "적정가 ₩X (+N%)" 상승여력 표기 제거. '적정가'는 그 값이 옳다는 뉘앙스를 주고
    // (+N%)는 upside = 매수 근거로 읽힌다(R2). 계산식 이름을 그대로 부르고 차이는 말하지 않는다.
    // 캐비엇은 각 preset.caveat이 이미 담당한다.
    const fair = stock.graham_number;
    if (!fair) return null;
    return `그레이엄 기준가 ₩${fair.toLocaleString()}`;
  }
  if (presetKey === 'momentum_3m') {
    if (stock.momentum_3m === null || stock.momentum_3m === undefined) return null;
    return `3개월 +${stock.momentum_3m}%`;
  }
  return null;
}
