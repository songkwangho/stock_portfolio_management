# Frontend Documentation — Next.js App Router 기준

> UX 원칙·온보딩·면책·디자인시스템은 `docs/FRONTEND_UX.md` 참조
> Next.js 전환 상세 (Server/Client 경계, ISR 패턴)는 `docs/NEXTJS.md` 참조

---

## 개요

- **프레임워크**: Next.js 15 (App Router)
- **언어**: TypeScript
- **스타일**: Tailwind CSS v4 (다크 테마, slate + blue)
- **차트**: Recharts v3 (`'use client'`) + lightweight-charts (캔들, `dynamic ssr:false`)
- **상태관리**: Zustand v5 (`'use client'` 내부에서만)
- **HTTP**: Axios (`NEXT_PUBLIC_API_BASE_URL`)

---

## 사용자 식별 (device_id)

로그인 없이 기기별 UUID로 개인 데이터를 서버에서 분리한다.

```typescript
// lib/deviceId.ts
interface DeviceIdStorage {
  get(): string | null;
  set(id: string): void;
}

class WebDeviceIdStorage implements DeviceIdStorage {
  get() { return localStorage.getItem('device_id'); }
  set(id: string) { localStorage.setItem('device_id', id); }
}

export function getDeviceId(storage = new WebDeviceIdStorage()): string {
  let id = storage.get();
  if (!id) { id = crypto.randomUUID(); storage.set(id); }
  return id;
}
```

```typescript
// lib/stockApi.ts — Axios 인터셉터
axios.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.headers['X-Device-Id'] = getDeviceId();
  }
  return config;
});
```

> Phase 5에서 JWT `Authorization: Bearer`로 교체 예정.

---

## 상태관리 (Zustand)

모두 `'use client'` 컴포넌트 내부에서만 import. Server Component에서 직접 사용 금지.

### usePortfolioStore

```typescript
interface PortfolioState { holdings: Holding[]; isLoading: boolean; error: string | null; }
interface PortfolioActions {
  fetchHoldings(): Promise<void>;
  addHolding(stock: AddHoldingPayload): Promise<void>;
  updateHolding(stock: UpdateHoldingPayload): Promise<void>;
  deleteHolding(code: string): Promise<void>;     // /holdings/:code (본인 보유 해제)
  deleteStock(code: string): Promise<void>;       // /stocks/:code (앱 전역에서 종목 제거, cascade). 3.7차 추가
}
```

> `deleteStock`는 `/stock/[code]` 삭제 버튼이 `stockApi.deleteStock` + `fetchHoldings`를 수동 엮지 않도록 일원화한 액션. 성공 시 내부적으로 `fetchHoldings`를 호출해 로컬 상태를 즉시 동기화.

### useAlertStore

```typescript
interface AlertState { alerts: Alert[]; unreadCount: number; }
interface AlertActions {
  fetchAlerts(): Promise<void>;
  fetchUnreadCount(): Promise<void>;
  markAllRead(): Promise<void>;
  deleteAlert(id: number): Promise<void>;
}
```

### useWatchlistStore

```typescript
interface WatchlistState { items: WatchlistItem[]; isLoading: boolean; lastFetched: number; }
interface WatchlistActions {
  fetchWatchlist(force?: boolean): Promise<void>; // TTL 30초 이내 재호출 스킵
  addToWatchlist(code: string): Promise<void>;
  removeFromWatchlist(code: string): Promise<void>; // optimistic + 실패 시 롤백 + 토스트
}
```

### useToastStore

```typescript
interface Toast { id: string; type: 'success' | 'error' | 'info'; text: string; action?: { label: string; onClick: () => void } }
interface ToastActions {
  addToast(text: string, type?: Toast['type'], action?: Toast['action']): void;
  removeToast(id: string): void;
}
```

---

## 페이지 구조

### /dashboard (CSR)

**컴포넌트**: `app/dashboard/page.tsx` → `DashboardClient` ('use client')
**데이터**: `usePortfolioStore`, `stockApi.getHoldingsHistory()`, marketIndices 폴링 (300초)

**핵심 UI**:
- 통계 카드 4개 (총자산, 손익, 종목수, 수익률 + KOSPI ℹ️ 툴팁)
- `PortfolioChart` ('use client') — ComposedChart (평가금액 실선 + 투자원금 파선)
  - `formatKoreanWon()` Y축 (₩N만 / ₩N.N억)
  - 손실 구간: 라인 빨간색 (#ef4444)
  - 힌트: "💡 평가금액(실선)이 투자원금(파선) 위에 있으면 수익 중"
- `AssetPieChart` ('use client') — holdings 1개이면 단일 카드 + amber 분산 권유
- 보유종목 리스트 (읽기전용, 평단→현재가 표시)
- 빈 포트폴리오: CTA 카드 (onboarding_done 이후만 표시)

**ErrorBanner**: `historyError` 발생 시 `autoRetryMs={3000}`

### /portfolio (CSR)

**컴포넌트**: `app/portfolio/page.tsx` → `PortfolioClient` ('use client')
**데이터**: `usePortfolioStore`, `useWatchlistStore`

**핵심 UI**:
- 상단 탭: 보유종목 / 관심종목 (E2E-H2, 2026-04-18: 우상단 종목 추가 버튼 제거)
- 보유종목 탭:
  - **종목 추가 폼 상시 노출** (StockSearchInput + 평단가 + 수량)
  - 종목 카드: holding_opinion 뱃지 + 이유 텍스트 (줄 분리)
  - sma_available=false → "분석 중" 뱃지 우선
  - 집중도 >50% → yellow 테두리 + 분산 권유
  - 수익률 6구간 메시지 — **`holding_opinion === '매도'`일 땐 숨김** (3.7차 UX-INIT 6-3: [주의 필요] 뱃지·설명과 중복 경고 방지)
  - 첫 종목 가이드 카드 (1회, onboarding_first_stock_guided, `holdings.length === 1` 조건)
- 관심종목 탭: `WatchlistContent` 컴포넌트

**holding_opinion 표시 라벨**:
```
'매도'     → '[주의 필요]'
'추가매수' → '[추가 검토]'
'관망'     → '[관망]'
'보유'     → '[보유]'
```

### /recommendations (ISR 24h + CSR fallback)

**렌더링**: Server Component (ISR) → 초기 데이터 props → `RecommendationsClient` ('use client')

**핵심 UI**:
- 면책 고지 상단
- 카테고리 탭 필터
- RecommendedStockCard 그리드
- 빈 상태: KST 시간 기반 3분기 메시지
  - 08시 이전: "약 N시간 후 결과"
  - 08~10시: "분석 중"
  - 이후: "오늘 매력 종목 없음"
- algorithm 추천: score=50 placeholder → score 뱃지 숨김
- manual 추천 평균 점수만 통계 표시

### /stock/[code] (ISR 24h + CSR 실시간)

**렌더링**:
```typescript
// 기본 정보: ISR
export const revalidate = 86400;
const stock = await fetchStock(code); // Server에서

// 실시간 체결가: Client에서 별도 fetch
// StockDetailClient 내부에서 stockApi.getCurrentPrice(code)
```

**핵심 UI**:
- 라인/캔들 차트 (일봉/주봉/월봉)
  - 라인: Recharts ComposedChart + SMA5(파란선) + SMA20(노란선)
  - 캔들: `CandleChart` (lightweight-charts, dynamic ssr:false)
- 거래량 BarChart
- PER/PBR/ROE/목표가 카드
  - PER: 섹터별 힌트 + **섹터 게이지 바** (3.7차) — `sectorData.medians.per` 대비 위치(에메랄드=저렴/앰버=높음)
- 기술지표 종합 (RSI/MACD/볼린저 + `*_available` 폴백) — **기본 펼침**
- 최신 뉴스 (Phase 2 지연 로딩) — **기본 펼침**
- ScoringBreakdownPanel (임계값 미검증 amber 배너 포함)
- **아코디언 (3.7차, 기본 접힘)** — 초보자 정보 과부하 완화:
  - 투자자별 매매동향 BarChart
  - 분기별 실적 (단위: 억 원, 1조 이상 "X조 Y억")
  - 같은 업종 비교 (백분위 + 테이블)
- 추가/수정 폼 (포트폴리오 등록)
- 삭제 버튼: 보유 여부에 따라 `deleteHolding` 또는 `deleteStock` (store 액션) 호출

### /stocks (ISR 24h)

**렌더링**: Server Component (ISR) → `StocksClient` ('use client')

**핵심 UI**:
- 8개 섹터별 종목 그리드
- 등락률 뱃지 (▲/▼, `['0','0.00','+0.00','-0.00']` placeholder 숨김)
- 기준 안내: "※ ▲/▼ 등락률은 전일 종가 대비"
- 종목 삭제 확인 모달 (cascade 위험 명시)

### /screener (CSR, PC 전용)

**핵심 UI**:
- 프리셋 4종 (각각 `caveat` 함정 안내 포함)
- 결과 상단 yellow 안내 + 활성 프리셋 caveat
- 반응형: 모바일 카드(`md:hidden`) / PC 테이블(`hidden md:block`)
- 모바일 카드 힌트: PER(낮을수록↓) / PBR(1이하↓) / ROE(높을수록↑)

### /watchlist (CSR, PC 전용)

`WatchlistContent` 컴포넌트 래퍼.

### /alerts (CSR)

**컴포넌트**: `app/alerts/page.tsx`
**데이터**: `useAlertStore`

**핵심 UI**:
- 알림 카드 — 타입별 아이콘·색상·label·description (sell_signal/sma5_break/sma5_touch/target_near/undervalued)
- source 뱃지: `'holding'` → [보유 중] / `'watchlist'` → [관심 종목]
- **타입별 1줄 가이드 (3.7차 UX-ALERT, 2026-04-19)** — `ALERT_GUIDES` 맵으로 message 하단에 "💡 이런 경우 확인해보세요" 문구
- 첫 진입 안내 카드 (`onboarding_alerts_explained` localStorage, 1회)
- 빈 상태: 알림 트리거 조건(5일 평균선 이탈·목표가 근접·저평가) + 갱신 시각(매일 08:00) 명시
- 알림 카드 "분석 보기" → `/stock/[code]?from=alerts`

### /settings (CSR)

- **종목 수동 추가** — 종목명 또는 6자리 코드 입력 form (`searchQuery` + `selectedHit` + `handleAddStock` submit → `POST /api/stocks`)
  - `StockSearchInput` 사용 안 함 (DB 기존 종목만 매칭하는 모순 해소, 2026-04-18)
  - **자동완성 드롭다운 (3.6차 DIR-4, 2026-04-19)**:
    - 2자 이상 입력 시 250ms 디바운스 → `stockApi.searchDirectory(q)` 호출
    - 6자리 숫자만 입력된 경우 디렉토리 검색 skip (폴백 입력으로 간주)
    - 드롭다운: name + code(mono) + market 뱃지 (KOSPI=blue, KOSDAQ=emerald, KONEX=slate)
    - 선택 시 확정 칩 "✓ name (code) · market [×]" 노출, [×]로 초기화
  - 제출 시 code 해석: `selectedHit.code || (searchQuery가 6자리 숫자면 그대로)`. 둘 다 아니면 에러 메시지 + 제출 버튼 비활성
  - 로딩 상태: input 내 스피너 + "네이버 API에서 종목 데이터를 가져오는 중..." 배너
  - 성공/실패 메시지 박스 + 🔵🟢🔴 콘솔 로그
- 서버 상태 확인 (health API)
- 닉네임 설정

---

## 컴포넌트

### HeaderBar

- 검색 입력 (디바운스 300ms → `stockApi.searchStocks`)
- 알림 아이콘 (`unreadCount` 뱃지, 60초 폴링)
- PC 전용 시장지수(KOSPI/KOSDAQ) — `useMarketStore`로 300초 폴링
- `usePathname` 구독 → 라우트 변경 시 검색 입력·드롭다운 초기화 (E2E-C2)
- **빈 검색 결과 안내 박스** — '전체 종목 보기 → / 종목코드로 추가 →' 버튼 + **대표 종목 3개(삼성전자/SK하이닉스/NAVER) 빠른 이동 버튼** (3.7차 UX-SEARCH)

### HealthGate

서버 연결 확인 후 children 렌더. 3상태: checking / ok / timeout.
- timeout: 15초 (`AbortController`)
- timeout 메시지: "서버가 깨어나는 중이에요. 약 30초 후 다시 시도해 주세요."
- `/api/health` 응답의 `lastSync` 검사 → null이거나 24h+ 경과 시 amber 서브 배너

### ScoringBreakdownPanel

10점 스코어 4영역 게이지 바.
상단 면책: "10점에 가까울수록 긍정적인 신호예요."
**amber 경고 배너 (Phase 4 전까지 고정)**: "⚠️ 이 점수 기준은 실증 검증 전이에요."

### StockSearchInput

디바운스 250ms. 드롭다운에 market_opinion 뱃지. resetKey로 초기화.

### RecommendedStockCard

- manual 추천만 score 뱃지 (`?` 툴팁 포함)
- "적정가 대비 현재가 괴리 +N%" 표현 (상승여력 X)
- source accordion (manual: 전문가 선정 / algorithm: 알고리즘)
- 하단 면책 문구

### WatchlistContent

PortfolioPage 관심종목 탭 + WatchlistPage 공유. TTL 30초 캐시.
삭제 실패 시 rollback + toast.

### ErrorBanner

```typescript
interface ErrorBannerProps {
  error: string | null;
  kind?: 'network' | 'server' | 'unknown';
  onRetry?: () => void;
  autoRetryMs?: number; // N ms 후 1회 자동 재시도 (무한 루프 방지)
}
```

### HelpBottomSheet

8개 용어: PER / PBR / ROE / RSI / MACD / 볼린저밴드 / 수급 / SMA
모바일: 하단. PC: 중앙. 외부 클릭으로 닫기.

### StatCard

```typescript
interface StatCardProps {
  title: string; value: string; change?: string; positive?: boolean;
  icon: ReactNode; subtitle?: string;
  tooltip?: { label: string; text: string }; // KOSPI ℹ️ 툴팁
}
```

---

## API 클라이언트 (lib/stockApi.ts)

환경변수: `NEXT_PUBLIC_API_BASE_URL`

| 함수 | 경로 |
|------|------|
| getCurrentPrice(code) | GET /stock/{code} |
| getAllStocks() | GET /stocks |
| addStock(code) | POST /stocks |
| deleteStock(code) | DELETE /stocks/{code} |
| searchStocks(q) | GET /search?q= |
| searchDirectory(q) | GET /stocks/directory/search?q= (3.6차: 전 상장 종목 매핑, `{code,name,market}[]` 반환) |
| getHoldings() | GET /holdings |
| addHolding(stock) | POST /holdings |
| updateHolding(stock) | PUT /holdings/{code} |
| deleteHolding(code) | DELETE /holdings/{code} |
| getHoldingsHistory() | GET /holdings/history |
| getRecommendations() | GET /recommendations |
| getVolatility(code) | GET /stock/{code}/volatility |
| getIndicators(code) | GET /stock/{code}/indicators |
| getChartData(code, tf) | GET /stock/{code}/chart/{tf} |
| getFinancials(code) | GET /stock/{code}/financials |
| getNews(code) | GET /stock/{code}/news |
| getSectorComparison(cat) | GET /sector/{cat}/compare |
| screener(filters) | GET /screener |
| refreshStock(code) | POST /stock/{code}/refresh |
| getAlerts() | GET /alerts |
| getUnreadAlertCount() | GET /alerts/unread-count |
| markAlertsRead() | POST /alerts/read |
| deleteAlert(id) | DELETE /alerts/{id} |
| getMarketIndices() | GET /market/indices |
| getWatchlist() | GET /watchlist |
| addToWatchlist(code) | POST /watchlist |
| removeFromWatchlist(code) | DELETE /watchlist/{code} |
| getHealth() | GET /health |

---

## 타입 정의 (types/stock.ts)

```typescript
type MarketOpinion  = '긍정적' | '중립적' | '부정적';
type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';
```

| 인터페이스 | 주요 필드 |
|-----------|---------|
| Stock | code, name, category, price, change, change_rate, per, pbr, roe, target_price, market_opinion |
| Holding | code, name, value(비중), avgPrice, currentPrice, quantity, holding_opinion, market_opinion, sma_available, last_updated? |
| UpdateHoldingPayload | code, avgPrice, quantity? |
| AddHoldingPayload | code, avgPrice, quantity |
| Recommendation | code, name, reason, score, fairPrice, currentPrice, market_opinion, source |
| ScoringBreakdown | valuation, technical, supplyDemand, trend, total, per_negative?, low_confidence?, detail |
| StockDetail | Stock + history[], investorData[], analysis, advice, market_opinion, tossUrl, scoringBreakdown? |
| TechnicalIndicators | rsi, macd, bollinger, summary, rsi_available?, macd_available?, bollinger_available?, history_days? |
| Alert | id, code, name, type, source? ('holding'/'watchlist'), message, read, created_at |
| WatchlistItem | code, name, category, price, market_opinion, added_at |

---

## 유틸 (lib/dataFreshness.ts)

```typescript
// 입력: PostgreSQL TIMESTAMPTZ ISO 8601 ("2024-01-15T08:00:00.000Z")
// 구버전 SQLite 형식도 처리 ("YYYY-MM-DD HH:MM:SS", UTC 명시 변환)
function parseServerDate(lastUpdated: string): Date

function getDataFreshnessLabel(lastUpdated: string): string
// 예: "3분 전 (08:00, 장중 데이터)"

function getDataFreshnessShort(lastUpdated: string): string
// 예: "3분 전"
```

---

## 업종 카테고리 (8개)

기술/IT, 바이오/헬스케어, 자동차/모빌리티, 에너지/소재, 금융/지주, 소비재/서비스, 엔터테인먼트/미디어, 조선/기계/방산

---

## 온보딩 localStorage 키 (4개)

| 키 | 역할 |
|----|------|
| `disclaimer_accepted` | 면책 모달 확인 |
| `onboarding_done` | 온보딩 스텝 완료 |
| `onboarding_first_stock_guided` | 첫 종목 가이드 카드 노출 완료 |
| `onboarding_alerts_explained` | 알림 패널 첫 진입 안내 완료 |
