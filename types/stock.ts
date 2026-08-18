// 비보유 기준 10점 스코어링 결과 (공용, DB 저장)
export type MarketOpinion = '긍정적' | '중립적' | '부정적';

// 평단가 기반 5단계 판단 (개인화, 런타임 계산)
export type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';

export interface Stock {
  code: string;
  name: string;
  category: string;
  price: number;
  change?: string;
  change_rate?: string;
  per?: number;
  pbr?: number;
  roe?: number;
  target_price?: number;
  market_opinion?: MarketOpinion;
  last_updated?: string;
}

export interface Holding {
  code: string;
  name: string;
  value: number;
  avgPrice: number;
  currentPrice: number;
  quantity: number;
  holding_opinion?: HoldingOpinion;
  market_opinion?: MarketOpinion;
  sma_available?: boolean;
  last_updated?: string;
}

export interface AddHoldingPayload {
  code: string;
  name: string;
  value: number;
  avgPrice: number;
  quantity?: number;
}

export type UpdateHoldingPayload = AddHoldingPayload;

// D1 — "종목 탐색"(구 추천) 응답. 매수 소재를 타입에서부터 없앴다:
//   fairPrice / targetPrice / probability(적정가 파생 점수) / market_opinion / analysis / advice.
//   필드가 남아 있으면 언젠가 다시 렌더된다 — 타입이 방어선이다.
// score는 큐레이션 정렬용으로만 남긴다(서버가 이미 정렬해 보내므로 화면은 쓰지 않는다).
export interface Recommendation {
  code: string;
  name: string;
  category: string;
  reason: string;
  score: number;
  currentPrice: number;
  per?: number;
  pbr?: number;
  roe?: number;
  source?: 'manual' | 'algorithm';
  tossUrl?: string;
}

export interface ScoringBreakdown {
  valuation: number;
  technical: number;
  supplyDemand: number;
  trend: number;
  total: number;
  per_negative?: boolean;
  low_confidence?: boolean;
  detail?: {
    valuation: { perScore: number; pbrScore: number; pegScore: number };
    technical: { rsiScore: number; macdScore: number; bollingerScore: number; volumeScore: number };
    supplyDemand: { foreignConsecutive: number; instConsecutive: number; foreignScore: number; instScore: number };
    trend: { reason: string };
  };
}

export interface StockDetail {
  code: string;
  name: string;
  price: number;
  category?: string;
  per?: number;
  pbr?: number;
  roe?: number;
  targetPrice?: number;
  eps_current?: number | null;   // 서버 service.js가 snake_case로 반환
  eps_previous?: number | null;
  history: HistoryEntry[];
  investorData?: InvestorEntry[];
  analysis?: string;
  advice?: string;
  market_opinion?: MarketOpinion;
  holding_opinion?: HoldingOpinion;
  last_updated?: string;
  tossUrl?: string;
  scoringBreakdown?: ScoringBreakdown;
}

export interface HistoryEntry {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface InvestorEntry {
  date: string;
  institution: number;
  foreign: number;
  // 항상 null — 네이버 외국인·기관 표에 개인 순매매 컬럼이 없다. 응답 형태 호환을 위해
  // 필드는 남기되 타입으로 "값이 없다"를 못박는다(누가 다시 숫자로 채우려 하면 tsc가 막는다).
  individual: null;
}

export interface ChartDataPoint {
  name: string;
  rawDate?: string;   // 원본 'YYYYMMDD' — 신호 마커(ReferenceDot) 매칭용
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  sma5: number | null;
  sma20: number | null;
}

// 3.11차 — 관찰형 매수/매도 신호. 백엔드 signals.js와 형태 일치.
export interface StockSignal {
  id: string;
  type: 'positive' | 'caution' | 'neutral';
  label: string;
  description: string;
  date?: string;   // 'YYYYMMDD' — 차트 마커용 (크로스·거래량 급증 등 발생일 있는 신호만)
}

export interface SignalResult {
  signals: StockSignal[];
  consensus: { positive: number; caution: number; total: number; summary: string };
  asOf: string;
  stale?: boolean;   // 3.12차 P2 — 최신 데이터 10일 초과 시 true (거래중단/상장폐지 정황)
  markers?: { date: string; type: 'golden' | 'dead' }[];   // 3.12차 S5 — 차트 크로스 마커(최근 20일)
}

export interface StockSummary {
  code: string;
  name: string;
  category: string;
  reason?: string;
  score?: number;
  fairPrice?: number;
  avgPrice?: number;
  value?: number;
  currentPrice?: number;
  quantity?: number;
  market_opinion?: MarketOpinion;
  price?: number;
}

export interface Alert {
  id: number;
  code: string;
  name: string;
  type: string;
  source?: 'holding' | 'watchlist';
  message: string;
  read: number;
  created_at: string;
}

export interface MarketIndex {
  symbol: string;
  value: number | null;
  change: string;
  changeRate: string;
  positive: boolean;
}

export interface WatchlistItem {
  code: string;
  name: string;
  category: string;
  price: number;
  market_opinion?: MarketOpinion;
  added_at: string;
}

export interface IndicatorDetail {
  indicator: string;
  signal: string;
  description: string;
  color: string;
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd: { macdLine: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number; percentB: number } | null;
  // M5 — 뭉친 판정 필드 `signal`(긍정적/주의/중립) 제거. 프론트가 배지·방향색으로 쓰던
  // 필드라 남기면 색으로 판정이 되살아난다. 대신 개수 균형(counts)만 넘긴다.
  summary: {
    counts: { up: number; down: number; flat: number };
    description: string;
    details: IndicatorDetail[];
  } | null;
  rsi_available?: boolean;
  macd_available?: boolean;
  bollinger_available?: boolean;
  history_days?: number;
}

export interface NewsItem {
  title: string;
  url: string;
  date: string;
  source: string;
}

export interface FinancialData {
  periods: string[];
  financials: { label: string; values: (number | null)[] }[];
}

export interface Theme {
  theme_id: string;
  theme_name: string;
  stock_count: number;
}

export interface ThemeStock {
  code: string;
  name: string;
  category: string;
  price: number | null;
  change?: string;
  change_rate?: string;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  market_opinion?: MarketOpinion;
}

export interface StockThemeTag {
  theme_id: string;
  theme_name: string;
}

// 스크리너 프리셋 결과 — 기존 Stock 필드 + 프리셋별 추가 메트릭 (선택적).
export interface ScreenerResult extends Stock {
  breakout_pct?: number | null;
  high_52w?: number | null;
  foreign_sum?: number;
  fund_sum?: number;
  avg_vol_30d?: number;
  recent_vol?: number;
  vol_ratio?: number | null;
  graham_number?: number | null;
  graham_upside?: number | null;
  price_3m?: number | null;
  momentum_3m?: number | null;
}

export interface SectorComparison {
  category: string;
  averages: { per: number; pbr: number; roe: number };
  medians: { per: number; pbr: number; roe: number };
  stocks: (Stock & {
    perVsAvg: number | null;
    pbrVsAvg: number | null;
    roeVsAvg: number | null;
  })[];
}

// 3.14차 — KOSPI 대비 초과수익 + 정보비율. 데이터 부족(스크립트 미실행 등) 시 available:false.
export interface BenchmarkResult {
  available: boolean;
  period?: string;          // 예: '20d'
  portfolioReturn?: number; // 기간 포트폴리오 수익률 %
  benchmarkReturn?: number; // 같은 기간 KOSPI 수익률 %
  excessReturn?: number;    // 초과수익 (포트 - 벤치마크) %p
  informationRatio?: number;
  trackingError?: number;   // 초과수익 표준편차(연환산)
}

// 3.14차 — 보유 종목 간 상관관계(60거래일). 상관계수는 방향 아닌 관계 강도.
export interface CorrelationPair {
  codeA: string;
  nameA: string;
  codeB: string;
  nameB: string;
  correlation: number;
}
export interface CorrelationResult {
  available: boolean;
  reason?: 'empty' | 'single' | 'insufficient' | 'error';
  pairs?: CorrelationPair[];
  maxCorrelation?: number;
  avgCorrelation?: number;
}

// 4.5a차 — DART 재무제표(손익/재무상태/현금흐름). 금액은 원 단위 Number. 데이터 없으면 available:false.
export interface DartStatementRow {
  label: string;
  values: (number | null)[];   // periods 순서(최신 → 과거)와 정렬
}
export interface DartFinancialsResult {
  available: boolean;
  fsDiv?: 'CFS' | 'OFS';
  periods?: string[];          // 예: ['2025 3Q', '2025 2Q', ...]
  statements?: {
    income: DartStatementRow[];
    balance: DartStatementRow[];
    cashflow: DartStatementRow[];
  };
  derived?: DartDerived;       // Phase A — 성장·현금흐름 질 원시 사실
}

// Phase A — DART 손익·현금흐름에서 뽑은 관점 입력(숫자 사실만, 서술은 lib/stockDetail/interpret.ts).
// 손익·현금흐름은 연초부터 누적(YTD)이라 비교는 항상 같은 분기 전년 동기(YoY).
export interface DartGrowthMetric {
  current: number;
  previous: number;
  changePct: number | null;                                  // 분모(전년) ≤ 0이면 null — 거짓 % 방지
  turnaround: 'to_profit' | 'to_loss' | 'stay_loss' | null;
  account?: string;
  label?: string;
}
export interface DartDerived {
  available: boolean;
  fsDiv?: 'CFS' | 'OFS';
  period?: string;             // 예: '2025 3Q'
  prevPeriod?: string;         // 예: '2024 3Q'
  growth?: { available: boolean; revenue?: DartGrowthMetric | null; profit?: DartGrowthMetric | null };
  cashflow?: { available: boolean; operating?: number; netIncome?: number | null; ratio?: number | null };
}

// Phase A(A3) — 가격 변동·위치. days(표본 수)를 함께 받아 '1년'이라 부를지 프론트가 판단한다.
export interface PriceContext {
  volatility: { dailyPct: number; days: number } | null;
  range: { high: number; low: number; days: number; positionPct: number | null } | null;
}
export interface VolatilityResult {
  volatility: number | null;   // 기존 5일 표본 값(호환 유지)
  priceContext?: PriceContext | null;
}
// 보유 전 종목의 range를 한 번에 (GET /api/holdings/volatility).
// 위치를 못 구하는 표본(1행·무변동)은 ranges에서 아예 빠진다 — 없는 값을 만들지 않는다.
export interface HoldingsVolatilityResult {
  available: boolean;
  reason?: 'empty' | 'error';
  ranges?: Record<string, NonNullable<PriceContext['range']>>;
}

// 4.5a차 — DART 공시. category는 표시용(호재/악재 아님). rm '정'=정정, '철'=철회.
export interface DartDisclosureItem {
  rceptNo: string;
  reportNm: string;
  rceptDt: string;             // YYYYMMDD
  category: string;
  categoryLabel: string;
  rm: string | null;
  isRevised?: boolean;
  isWithdrawn?: boolean;
  url: string;
}
export interface DartDisclosuresResult {
  available: boolean;
  items?: DartDisclosureItem[];
}

// 4.5b차 — 거래일지(행동편향 진단). 서버는 수치·flag만, 한국어 풀이는 lib/journal/interpret.ts.
export interface JournalUploadResult {
  broker: string | null;
  imported: number;
  skipped: number;
  dateRange: { from: string; to: string } | null;
  coverage: { matched: number; unmatched: number };
}
export interface JournalSummary {
  roundtripCount: number;
  realizedLossCount?: number;   // C-2
  winCount?: number;            // C-2(리뷰): "전부 이익" 게이트
  winRate: number | null;
  avgHoldWin: number | null;
  avgHoldLoss: number | null;
  profitFactor: number | null;
  maxDrawdown: number;   // 원, 실현손익 기준
  totalPnl: number;
  // C-2: 미청산 보유분(openLots) 최근 종가 평가
  openPositionCount?: number;
  openLossCount?: number;
  openLossAvgHoldDays?: number | null;
  asOfDate?: string | null;   // '최근 종가' 날짜 (YYYY-MM-DD)
  unvaluedCount?: number;
}
// 편향은 키별 필드가 달라 열린 형태 — interpret이 key로 분기. flag는 UI 색 아님(관찰 집계용).
export interface JournalBiasMetric {
  key: string;
  available: boolean;
  flag?: boolean;
  [k: string]: unknown;
}
export interface JournalAnalysis {
  available: boolean;
  summary?: JournalSummary;
  biases?: JournalBiasMetric[];
  // C-1: 적재 메타(total/imported/skipped/skippedNames)로 지속 커버리지 캐비엇. F2: unmatchedSellCount.
  coverage?: {
    trades: number; roundtrips: number; unmatchedSellCount?: number;
    total?: number; imported?: number; skipped?: number; skippedNames?: string[];
  };
}

// A차(주목 레이어) — 보유+관심 종목을 현저성으로 정렬한 트리아지.
// 서버는 **원시 사실(숫자)**만 준다. 판단·신호·목표가 없음(R1/R2) — 배지 문구는 lib/attention/interpret.ts.
// 퍼센트 필드는 전부 퍼센트 수치(3.2 = 3.2%).
export interface AttentionItem {
  code: string;
  name: string;
  source: 'holding' | 'watchlist';
  held: boolean;
  weightPct: number | null;        // 보유만. 자동 계산된 정수 비중
  unrealizedPct: number | null;    // 보유만. 최근 종가 기준
  ret5d: number | null;            // 5거래일 수익률(%)
  volSurge: number | null;         // 최신 거래량 ÷ 직전 20거래일 평균 (배수)
  priced: boolean;                 // 현재가 확보 여부(승격 전 종목은 false)
  discCount: number;
  discLatestDaysAgo: number | null;
  discCategories: string[];        // 중립 표시 라벨(호재/악재 아님)
  discEvents?: { category: string; daysAgo: number }[];  // 건별 원시 사실(카테고리 가중 입력)
  score: number;                   // 현저성. 정렬용이며 화면에 노출하지 않는다
  components?: { disc: number; move: number; unrl: number; stake: number };
}
export interface AttentionResult {
  available: boolean;
  reason?: 'empty' | 'error';
  items?: AttentionItem[];
  asOfDate?: string | null;        // 최근 종가 날짜 (YYYY-MM-DD)
  constants?: { windowTradingDays: number; discLookbackDays: number };
}
