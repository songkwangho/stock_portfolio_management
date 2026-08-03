# Frontend Documentation — Next.js App Router 기준

> UX 원칙·온보딩·면책·디자인시스템은 `docs/FRONTEND_UX.md` 참조
> Next.js 전환 상세 (Server/Client 경계, ISR 패턴)는 `docs/NEXTJS.md` 참조

---

## 개요

- **프레임워크**: Next.js 16 (App Router, Turbopack)
- **언어**: TypeScript
- **스타일**: Tailwind CSS v4 — **라이트 테마 (paper/surface/ink) + 한국 증시 색** (3.13차 리디자인). 상승/수익/긍정=rise(빨강), 하락/손실/부정=fall(파랑), 경고=caution(amber). 방향색은 가격·수익 방향에만, 게이지·바·범주는 무채색. 토큰 SSOT는 `docs/DESIGN.md`, 규칙은 `docs/FRONTEND_UX.md`
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
**데이터**: `usePortfolioStore`, `stockApi.getHoldingsHistory()`, `getFearGreed`/`getPortfolioSharpe`/`getBenchmark`, marketIndices 폴링 (300초)

**핵심 UI (3.13 히어로 재편)**:
- **히어로**: 80px 수익률 2열 (수익=text-rise / 손실=text-fall). 총자산·손익 요약
- **요약 라인** (`?` 토글 3종, 실패 시 항목만 미표시):
  - **시장온도** (3.8차 Fear & Greed) — 점수+라벨, ≤40 fall / ≥60 rise / 중립 무채색
  - **샤프** (3.8차) — 위험 대비 수익, >0 rise / ≤0 fall
  - **KOSPI 대비 N%p** (3.14차 벤치마크) — 초과수익 양수 rise / 음수 fall + 툴팁(포트 vs KOSPI 수익률 + 정보비율 설명). `benchmark.available=false`면 미표시
- **오늘 확인할 것** (3.9 UX-C + 3.11 SIG-6) — 매도[주의 필요]/관망 보유 종목 + **관찰 신호 주의 우세**(caution>0 && caution≥positive, 보유 5개 이하만 조회) + 미읽 알림 집계. 0건+보유있음 시 "모두 양호"
- `PortfolioChart` ('use client') — Area(평가금액 실선) + Line(투자원금 파선)
  - `formatKoreanWon()` Y축 (₩N만 / ₩N.N억), 두 라인 모두 들어가는 범위로 Y축 자동 계산
  - **손실=fall 파랑(#1B5FD0) / 수익=rise 빨강(#D91C1C)** (3.13 한국 증시 색)
  - 힌트: "평가금액(실선)이 투자원금(파선) 위면 수익 중, 아래면 손실 중"
- `AssetPieChart` ('use client') — holdings 1개이면 단일 카드 + amber 분산 권유
- 보유종목 리스트 (읽기전용, 평단→현재가 표시)
- 빈 포트폴리오: CTA 카드 (온보딩 무관 노출, 3.9 MOB-1로 4카드 — 테마 탐색 추가)

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
  - **분산 상태 점검 (3.14차 CORR-2)** — 비중 경고(weight>50)와 **별개**. 보유 2종목 이상·`getCorrelation().available`일 때만. 최고 상관 ≥0.7 caution / 0.4~0.7 정보성(무채색) / <0.4 "잘 분산돼 있어요". **상관계수는 방향 아닌 관계 강도 → rise/fall 금지, caution/muted만** (3.13 색 규칙)
  - 인라인 행동 가이드 스텝 (3.9 UX-B) — 매도/관망 종목에 노출, 첫 스텝은 종목 상세 진입
- 관심종목 탭: `WatchlistContent` 컴포넌트

**holding_opinion 표시 라벨**:
```
'매도'     → '[주의 필요]'
'추가매수' → '[추가 검토]'
'관망'     → '[관망]'
'보유'     → '[보유]'
```

### /recommendations (CSR — ISR은 Sprint 3 예정)

**렌더링**: `'use client'` (현재 전 페이지 CSR. 로드맵 M3에서 ISR 전환)

**핵심 UI**:
- 면책 고지 상단 + "이 종목들은 왜 추천됐나요?" 안내 배너 (3.9 UX-D2)
- **테마 탐색 진입 배너** (`md:hidden`) — 3.7β THEME-5 + 3.14차: 사이드바(md+)에 "테마 탐색"이 있어 데스크톱에선 중복이라 숨김, 모바일만 `/themes` 진입로로 유지
- 카테고리 탭 필터
- RecommendedStockCard 그리드
- 빈 상태: KST 시간 기반 3분기 메시지
  - 08시 이전: "약 N시간 후 결과"
  - 08~10시: "분석 중"
  - 이후: "오늘 매력 종목 없음"
- algorithm 추천: score=50 placeholder → score 뱃지 숨김
- manual 추천 평균 점수만 통계 표시

### /stock/[code] (CSR — 3.13차 3탭 구조)

전부 CSR(`'use client'`). `Suspense`(useSearchParams) + `use(params)` + `key={code}` 리마운트(탐색 시 stale 방지). ISR/lightweight-charts는 미적용(로드맵 상 후속).

**3탭** (`TabKey = 'summary' | 'chart' | 'company'`, 3.13차 VIS-6 — 사이드바 폐지). 데이터는 셸이 1회 fetch, 탭 전환 시 재요청 없음:

- **[요약]** — 결론 → 해석 → 점수/신호 2열 → (미보유) 적정가·추가폼
  - `ConclusionCard` (한 줄 결론 + 3단계 행동 가이드)
  - **`InterpretationPanel`** (4.5c차) — 결론↔점수 사이. "현재 이렇게 보고 있어요" 항목별 초보자 풀이 + 종합(상충/판단 유보) + 면책. **무채색**(tone 색 미사용)
  - 2열: `OpinionScorePanel`(종합 10점) / [`SignalPanel` + Signal Score(0~100 보조지표)]
  - (미보유) AI 추천 적정가 + `PortfolioAddForm`
- **[차트·지표]** — `ChartSection`(주가+SMA+크로스마커+거래량+흐름해석) → `IndicatorPanel`(RSI/MACD/볼린저+변동성) → `StatsGrid`(한눈에 9지표+52주 게이지) → `MetricsGrid`(PER/PBR/ROE/목표가/PEG+섹터게이지) → `InvestorChart`(투자자 매매동향) → `AnalysisDetail`
- **[기업]** — `DisclosureList`(DART 공시) → `DartFinancials`(DART 우선→네이버 폴백) + 재무 한 줄 해석 → `SectorCompare` + 업종위치 한 줄 해석 → `NewsList` → 토스증권 외부 링크(마지막)

**컴포넌트 (`components/stock/detail/` 17개)**: DetailHeader(탭 위, 카테고리/삭제/이름/테마태그/현재가·추세·수익률/보유수정폼), ConclusionCard, InterpretationPanel, OpinionScorePanel, SignalPanel, PortfolioAddForm, ChartSection, IndicatorPanel, StatsGrid, MetricsGrid, InvestorChart, AnalysisDetail, DisclosureList, DartFinancials, FinancialsTable(네이버 폴백), SectorCompare, NewsList
**lib**: `lib/stockDetail/{summary,format,helpTexts,interpret}.ts` (순수 함수 + 정적 맵. interpret은 4.5c차)

**주요 props**:
- `ConclusionCard`: stockDetail, isHolding, holdingMatch
- `InterpretationPanel`: interps(`Interpretation[]`) — available 항목만 렌더, 전부 없으면 null
- `SignalPanel`: signals(SignalResult|null) — stale면 amber, 신호 있으면 패널, 아니면 null
- `ChartSection`: code, stockDetail, signals(markers 렌더)
- `MetricsGrid`: stockDetail, category, sectorData, onHelp / `IndicatorPanel`: indicators, volatility, onHelp
- `DisclosureList`: data(DartDisclosuresResult|null) / `DartFinancials`: dart(DartFinancialsResult|null), naver(financials)
- `SectorCompare`: sectorData, currentCode / `NewsList`: news / `PortfolioAddForm`: code, name, defaultAvgPrice, holdingsEmpty, onAdd, onSuccess

**해석 계산 (셸)**: `interps` 배열은 기존 값 재사용으로 조립 — per/pbr/roe + `sectorData.medians` → `interpretValuation`, dartFin balance → `interpretFinancial`, price/sma → `interpretTechnical`, `investorData` net값 → `consecutiveStreak` → `interpretFlow`. 신규 계산·백엔드 변경 없음.

**설계 원칙**: helpTerm은 셸 소유 + `onHelp(t)` 콜백(Context 미도입). DART 재무/공시는 지연(Phase2) fetch, 실패 시 available:false로 조용히 폴백. refresh fetch는 셸 소유. 헤더 가격/추세·점수·StatsGrid는 일봉(stockDetail.history) 기준 계산(chartTimeframe 무관). 삭제는 보유 여부에 따라 `deleteHolding`/`deleteStock` store 액션. `id="portfolio-add-form"` DOM 계약(모바일 스크롤 버튼) 보존.

### /stocks (CSR — ISR은 Sprint 3 예정)

**렌더링**: `'use client'` (로드맵 M3에서 ISR 전환)

**핵심 UI**:
- 헤더 "N개 종목 · M개 섹터" 동적 표시 (3.7차 UI-COUNT — 하드코딩 제거)
- 학습 모드 배너 (`onboarding_mode === 'learn'`, 3.9 UX-G1) — 3단계 기초 가이드
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

### /journal (CSR, PC 전용 — 4.5b차 거래 진단)

**컴포넌트**: `app/journal/page.tsx`
**데이터**: `stockApi.uploadJournal/getJournalAnalysis/deleteJournal`, `lib/journal/interpret.ts`(순수)

**핵심 UI**:
- 증권사 선택(자동 감지/키움/토스/삼성) + CSV 업로드 — **File→ArrayBuffer→`TextDecoder('euc-kr')` 디코드**(BOM/대체문자 시 utf-8 폴백) → csvText만 POST. 백엔드 iconv/multer 불필요
- **킬러 한 줄(C-2)** — 결과 최상단 무채색 카드. `readOpenLossHeadline(summary)`: "실현 청산 N건 전부 이익, 최근 종가(asOfDate) 기준 미실현 손실 M종목(평균 K일)". **"지금" 금지·asOfDate 명시**, openLossCount 0/데이터 부족이면 미표시
- 결과: **매매 통계 표**(청산건수·이익실현비율·이익/손실 평균보유·손익비·누적손익·MDD "실현손익 기준") + **커버리지 캐비엇(C-1)** `journalCoverageNotes()`(유니버스 제외 건수≠종목수 + 미매칭 매도 2축, muted 각주) + **행동 관찰 카드**(처분효과/과매매/추격매수/앵커링/**평단 하향 추가매수 C-3**) + **"실증 검증 전" 뱃지**(caution) + 면책 각주
- **전 영역 무채색** (방향색 금지 — 판정 아닌 관찰. 손익 수치도 ink). 관찰 텍스트는 `lib/journal/interpret.ts` 순수 함수가 생성(관찰형·판단어·"물타기/편향" 금지, FORBIDDEN 스윕)
- 원본 CSV·PII 미저장 안내, "전체 삭제" 버튼. 재업로드는 **교체(replace, F1)**
- 빈 상태: "증권사 앱/HTS에서 거래내역 CSV 내려받아 업로드" 안내
- 진입: Sidebar '거래 진단'(PC). 모바일 탭바 미노출(파일 업로드는 데스크톱 지향 — screener/watchlist와 동일)

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
- timeout: **25초** (`AbortController`) — Render cold start(첫 요청 30~50초, 재시도 1회 포함) 대응
- 안내: 처음 접속 시 "30~50초 소요될 수 있어요" + "커피 한 모금 ☕" 문구
- `/api/health` 응답의 `lastSync` 검사 → null이거나 24h+ 경과 시 amber 서브 배너

### ScoringBreakdownPanel

10점 스코어 4영역 게이지 바.
상단 면책: "10점에 가까울수록 긍정적인 신호예요."
**amber 경고 배너 (Phase 4 전까지 고정)**: "⚠️ 이 점수 기준은 실증 검증 전이에요."

### StockSearchInput

디바운스 250ms. 드롭다운에 market_opinion 뱃지. resetKey로 초기화.

### RecommendedStockCard (3.9차 UX-D 결론형 재작성)

- **왜 지금?** (이유) + **가격 차이** 라벨드 섹션 — "적정가 대비 현재가 괴리 +N%" (상승여력 X)
- reason 80자 초과 시 "더 보기" 토글 (`reasonExpanded`)
- 버튼 2개: **상세 분석 보기** + **관심 ♡** — `useWatchlistStore.addToWatchlist` + 추가 토스트에 "알림 설정 →" 액션
- manual 추천만 score 뱃지 (`?` 툴팁) / source accordion (manual: 전문가 선정 / algorithm: 알고리즘)
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

9개 용어: PER / PBR / ROE / PEG / RSI / MACD / 볼린저밴드 / 수급 / SMA
- PER/PBR/ROE/PEG에는 `implication`("그래서 어떻게 보면 되나요?") 시사점 1줄 (3.9 UX-G2)
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
| getSignals(code) | GET /stock/{code}/signals (3.11차 관찰 신호 + 3.12차 markers[]/stale) |
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
| getThemes() | GET /themes (3.7차β) |
| getThemeStocks(themeId) | GET /themes/{id}/stocks (3.7차β) |
| getStockThemes(code) | GET /stock/{code}/themes (3.7차β) |
| getFearGreed() | GET /market/fear-greed (3.8차 시장 온도) |
| getPortfolioSharpe() | GET /holdings/sharpe (3.8차 위험대비수익) |
| getBenchmark() | GET /holdings/benchmark (3.14차 KOSPI 대비 초과수익·IR) |
| getCorrelation() | GET /holdings/correlation (3.14차 보유 상관관계) |
| getDartFinancials(code) | GET /stock/{code}/dart/financials (4.5a차 DART 재무제표, available:false 폴백) |
| getDartDisclosures(code) | GET /stock/{code}/dart/disclosures (4.5a차 DART 공시) |
| uploadJournal(csvText, broker?) | POST /journal/upload (4.5b차 거래내역 CSV 텍스트) |
| getJournalAnalysis() | GET /journal/analysis (4.5b차 통계+편향, available:false 폴백) |
| deleteJournal() | DELETE /journal (4.5b차 거래 전량 삭제) |
| getHealth() | GET /health |

> 보조 폴링 실패 토스트를 억제하는 **silent 목록**에 `/market/indices`·`/volatility`·`/news`·`/signals`·`/holdings/benchmark`·`/holdings/correlation`·`/dart/` 포함 (인터셉터에서 에러 토스트 스킵).

> **비중(weight) 처리 (3.12.1 해소)**: 비중은 **서버가 매수가·수량으로 자동 계산**한다 — `recalcWeights`([server/domains/portfolio/service.js](../server/domains/portfolio/service.js))가 `weight = round(cost / totalCost × 100)`을 add/update/delete마다 재계산. `POST /holdings`는 body의 weight를 읽지 않으므로 `addHolding`이 `weight:0`을 보내도 무해(즉시 덮어씀). `GET /holdings`의 `weight` → store `fetchHoldings`가 `Holding.value`로 매핑 → `portfolio/page.tsx` 집중도 경고(`value > 50`)가 자동 계산값으로 동작. 3.12.1에서 **매수/수정 폼의 수동 "총 자산의 몇 %" 입력 필드를 제거**(사용자 외부 자산까지 포함한 값이라 앱의 원가 기준 비중과 충돌하는 거짓 UI였음). 이제 폼은 매수가·수량만 받고 비중은 "자동 계산" 안내.

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
| StockSignal / SignalResult | 3.11차 관찰 신호 — signals[], consensus, asOf, stale?(3.12 P2), markers?(3.12 S5 크로스) |
| BenchmarkResult | 3.14차 — available, portfolioReturn, benchmarkReturn, excessReturn, informationRatio, trackingError |
| CorrelationResult | 3.14차 — available, reason?('empty'/'single'/'insufficient'/'error'), pairs[], maxCorrelation, avgCorrelation |
| DartFinancialsResult / DartStatementRow | 4.5a차 — available, fsDiv(CFS/OFS), periods[], statements{income,balance,cashflow}. 금액 원 단위 Number |
| DartDisclosuresResult / DartDisclosureItem | 4.5a차 — available, items[{rceptNo,reportNm,rceptDt,category,categoryLabel,rm,isRevised,isWithdrawn,url}]. category는 표시용(호재/악재 아님) |
| JournalUploadResult / JournalSummary / JournalBiasMetric / JournalAnalysis | 4.5b차 — 거래일지. summary(승률·손익비·평균보유·MDD) + biases[](key별 열린 형태, 서버는 수치·flag만). 관찰형 한국어는 `lib/journal/interpret.ts` |

> 4.5c차 해석 타입 `Interpretation`(`{key,label,text,tone,available}`)은 `types/stock.ts`가 아니라 순수 함수 모듈 `lib/stockDetail/interpret.ts`에 정의. tone은 상충 집계용 논리 구분일 뿐 UI는 무채색.

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

## 온보딩 localStorage 키 (5개)

| 키 | 역할 |
|----|------|
| `disclaimer_accepted` | 면책 모달 확인 (없으면 DisclaimerModal Step 0부터) |
| `onboarding_done` | 온보딩 스텝 완료 |
| `onboarding_first_stock_guided` | 첫 종목 가이드 카드 노출 완료 |
| `onboarding_alerts_explained` | 알림 패널 첫 진입 안내 완료 |
| `onboarding_mode` | 온보딩 3갈래 "주식 기초부터" 선택 시 `'learn'` → `/stocks` 학습 배너 노출 (3.9 UX-E2/G1) |
