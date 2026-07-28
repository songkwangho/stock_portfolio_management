# Stock Analyzer — Claude Code 개발 가이드 (Next.js 재개발판)

## 프로젝트 개요

한국 주식 분석 및 포트폴리오 관리 웹앱. 웹앱 전용(Capacitor 없음).
공식 데이터 API + 보조 스크래핑 기반으로 기술적 분석, 종목 추천, 포트폴리오 수익률 추적을 제공한다.
초기에는 기기별 익명 식별자(device_id)로 개인 데이터를 분리하고, Phase 5에서 소셜 로그인으로 전환한다.

**대상**: 한국 주식 투자 초보자 — 전문 용어에 익숙하지 않은 일반 사용자.

---

## 기술 스택

### 프론트엔드
- **프레임워크**: Next.js 16 (App Router)
- **언어**: TypeScript
- **스타일**: Tailwind CSS v4
- **차트**: Recharts v3 (`'use client'` 격리) + lightweight-charts (캔들차트, `dynamic ssr:false`)
- **상태관리**: Zustand v5 (도메인별, `'use client'` 내부에서만)
- **HTTP**: Axios (`NEXT_PUBLIC_API_BASE_URL`)

### 백엔드
- **서버**: Node.js + Express (단일 레포 `server/` 디렉터리, Render 배포)
- **DB**: PostgreSQL (Neon), `pg` Pool
- **데이터**: 네이버 증권 스크래핑 → 장기: KRX/KIS API 전환

### 배포
- **프론트**: Vercel (Next.js)
- **API**: Render Web Service Starter ($7/월) — 레포 루트 `server/server.js` 진입
- **DB**: Neon PostgreSQL (무료)

---

## 프로젝트 구조

```
stock-app/                        # 단일 레포 (프론트 + 백엔드 통합, 2026-04-15 이식 완료)
├── app/                          # Next.js App Router (전부 'use client' CSR)
│   ├── layout.tsx
│   ├── page.tsx                  # / → /dashboard redirect
│   ├── dashboard/page.tsx
│   ├── portfolio/page.tsx        # ?focus=add-holding|first-stock-guide (Suspense)
│   ├── recommendations/page.tsx
│   ├── watchlist/page.tsx        # PC 전용
│   ├── screener/page.tsx         # PC 전용
│   ├── stocks/page.tsx
│   ├── stock/[code]/
│   │   ├── page.tsx              # CSR, Suspense(useSearchParams), use(params)
│   │   └── loading.tsx           # use(params) 깜빡임 완화
│   ├── alerts/page.tsx           # PC/모바일 통일, 첫 진입 안내 카드
│   └── settings/page.tsx
│
├── components/
│   ├── layout/                   # 전부 'use client'
│   │   ├── AppShell.tsx          # 컴포지션 컨테이너
│   │   ├── Sidebar.tsx           # PC 사이드바
│   │   ├── MobileTabBar.tsx      # 모바일 하단 탭바
│   │   ├── HealthGate.tsx        # 서버 연결 스플래시
│   │   ├── HeaderBar.tsx         # 검색·알림(/alerts 라우팅)·시장지수(PC 한정, 300s 폴링)
│   │   ├── DisclaimerModal.tsx   # 면책 1단계 + 온보딩 3갈래 2단계
│   │   └── ToastHost.tsx         # useToastStore 렌더러
│   ├── stock/
│   │   ├── ScoringBreakdownPanel.tsx
│   │   ├── StockSearchInput.tsx
│   │   └── RecommendedStockCard.tsx
│   ├── portfolio/
│   │   └── WatchlistContent.tsx
│   └── ui/
│       ├── ErrorBanner.tsx
│       ├── HelpBottomSheet.tsx
│       ├── StatCard.tsx
│       └── NavButton.tsx
│   # components/charts/ 는 Sprint 3 [M1]에서 신설 예정 — 현재 차트는 전부 페이지 인라인
│
├── stores/                       # Zustand ('use client' 내부에서만 import)
│   ├── usePortfolioStore.ts
│   ├── useAlertStore.ts
│   ├── useWatchlistStore.ts
│   └── useToastStore.ts
│
├── lib/
│   ├── stockApi.ts
│   ├── deviceId.ts               # SSR-safe
│   └── dataFreshness.ts
│
├── types/
│   └── stock.ts
│
├── server/                       # Express 백엔드 (원본에서 이식, node_modules 제외)
│   ├── server.js                 # Render 진입점
│   ├── index.js
│   ├── db/                       # 스키마·마이그레이션 (stocks_directory, ai_report 포함)
│   ├── helpers/                  # deviceId(requireDeviceIdMiddleware), cache, sma
│   ├── scrapers/                 # 네이버 증권
│   ├── domains/
│   │   └── stock/
│   │       ├── service.js        # getStockData + syncAllStocks
│   │       ├── data.js           # registerInitialData (97 + 20)
│   │       ├── directory.js      # 3.6차 — KRX stocks_directory 동기화
│   │       └── router.js
│   ├── scheduler.js              # setupScheduler + syncDirectoryIfEmpty 10s 지연
│   └── package.json              # 별도 의존성 — `cd server && npm install` 필요
│   # 운영은 전부 PostgreSQL (`pg` Pool, Neon). SQLite 레거시는 2026-04-15 정리 완료.
│
└── scripts/
    ├── backfill-history.js       # 97종목 × 3년 히스토리 적재 (배치 3개, ~6시간)
    ├── sync-directory.js         # 3.6차 — KRX 상장법인목록 수동 동기화
    └── expand-stocks.js          # 3.7차 감마 — 종목 96→~180 확대 (배치 3 × 3초)
```

---

## 핵심 아키텍처 원칙

### Server Component vs Client Component 경계

```
Server Component (기본):
  - app/stock/[code]/page.tsx      → ISR로 종목 기본 정보 fetch (Sprint 3 적용 예정)
  - app/stocks/page.tsx            → ISR로 97종목 목록 fetch (Sprint 3 적용 예정)
  - app/recommendations/page.tsx   → ISR로 추천 목록 fetch (Sprint 3 적용 예정)
  - app/layout.tsx                 → 공통 레이아웃 (정적)

'use client' 필수:
  - 모든 차트 컴포넌트 (Recharts window 참조)
  - Zustand 스토어를 사용하는 모든 컴포넌트
  - device_id에 의존하는 포트폴리오/알림/관심종목
  - AppShell, HealthGate, Sidebar, MobileTabBar, HeaderBar (상태 있음)
```

### 라우팅 구조

```
/                    → redirect to /dashboard
/dashboard           → 포트폴리오 요약 (CSR)
/portfolio           → 보유종목 관리 (CSR), ?focus=add-holding|first-stock-guide
/recommendations     → 추천 종목 (CSR, Sprint 3에서 ISR 전환)
/watchlist           → 관심종목 (CSR, PC 전용)
/screener            → 종목 스크리너 (CSR, PC 전용)
/stocks              → 주요 종목 (CSR, Sprint 3에서 ISR 전환)
/stock/[code]        → 종목 상세, ?from=holding|recommendation|watchlist|major|search|alerts
/alerts              → 알림 (CSR, PC/모바일 통일)
/settings            → 설정
```

---

## 개발 명령어

```bash
# 프론트엔드
npm run dev              # 포트 3000 (--turbopack)
npm run build
npm run start

# 백엔드
DATABASE_URL=postgres://... node server/server.js  # 포트 3001

# 히스토리 backfill
DATABASE_URL=postgres://... node scripts/backfill-history.js

# KRX 상장법인목록 → stocks_directory 수동 동기화 (name↔code 매핑)
DATABASE_URL=postgres://... node scripts/sync-directory.js

# 종목 확대 — TARGET_CODES에 정의된 ~86개 코드를 네이버 크롤링으로 stocks 테이블에 추가
# (배치 3 × 3초 간격, 전체 ~10~15분)
DATABASE_URL=postgres://... node scripts/expand-stocks.js
```

### 환경변수

```bash
# .env.local (프론트)
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
API_BASE_URL=http://localhost:3001/api        # Server Component 전용

# Vercel 환경변수
NEXT_PUBLIC_API_BASE_URL=https://your-render-api.onrender.com/api
API_BASE_URL=https://your-render-api.onrender.com/api

# Render 환경변수 (백엔드)
DATABASE_URL=postgres://...
FRONTEND_URL=https://your-vercel-app.vercel.app   # CORS 허용
PORT=3001
```

---

## Opinion 분리

```typescript
type MarketOpinion  = '긍정적' | '중립적' | '부정적';  // DB 저장, 공용
type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';  // 런타임 계산

// UI 표시 라벨 소프트화 (내부 값은 유지)
// '매도' → '[주의 필요]'   '추가매수' → '[추가 검토]'
```

---

## 반응형 레이아웃

```
PC (md: 이상):
  HeaderBar + 좌측 고정 사이드바 (w-68) + 우측 메인
  사이드바: 대시보드 / 포트폴리오 / 추천 / 관심종목 / 스크리너 / 주요종목 / 설정

모바일 (md: 미만):
  HeaderBar (검색·알림 아이콘) + 하단 탭바 5개 (fixed bottom-0)
  탭: 대시보드 / 포트폴리오 / 추천 / 알림(뱃지) / 설정
  KOSPI/KOSDAQ: 모바일 대시보드 상단 노출 예정 (Sprint 3 [M4])
```

---

## 분석 알고리즘 요약 (백엔드, 변경 없음)

### HoldingOpinion (런타임)
1. 손절(-7%) → 매도
2. SMA5 null → 보유
3. 이중 이탈(SMA5+SMA20 아래) → 매도
4. 단기이탈+중기지지 → 관망
5. SMA20 null → SMA5만으로 판단
6. 5일선 근접(100~101%) → 추가매수
7. 정배열 → 보유

### MarketOpinion (10점)
- 밸류에이션 0~3 / 기술지표 0~3 / 수급 0~2 / 추세 0~2
- ≥7 긍정적, ≥4 중립적, <4 부정적 **(임시값 — Phase 4 백테스팅 후 최적화)**

---

## 로드맵

### Phase 3 — Next.js 재개발 + 배포 (현재)

**1차 이전 완료 (2026-04-14)**
- [x] Next.js 15.3 + React 19 + Tailwind v4 초기화 (2026-04-15 Next 16.2로 업그레이드 — `next build` EISDIR 이슈 해소)
- [x] 라우팅 구조 (9개 페이지)
- [x] 공유 모듈 이전 (types, lib, stores)
- [x] 레이아웃 셸 7종 (AppShell, HealthGate, Sidebar, MobileTabBar, HeaderBar, DisclaimerModal, ToastHost)
- [x] 리프 컴포넌트 이전 (8종)
- [x] 전체 페이지 이전
- [x] Recharts `'use client'` 격리 (인라인)
- [x] 개발 서버 기동 확인 + GitHub 푸시

**2차 — UX 복구 완료 (Sprint 2, 2026-04-14)**
- [x] **[H3]** 알림 진입점 `/alerts` 단일화 (헤더 드롭다운 제거)
- [x] **[H1/H2]** 온보딩 2단계 + `?focus=` searchParams 기반 pendingFocus 대체
- [x] **[H4]** `/stock/[code]` `?from=` 컨텍스트 복원 (전체 호출처)
- [x] **[UX1]** 온보딩 3갈래 분기 (보유 관리 / 종목 찾기 / 공부 시작)
- [x] **[UX2]** 대시보드 빈 상태 3-CTA 카드
- [x] **[UX5]** 알림 메시지 초보자 친화 리라이트
- [x] **[UX6]** "분석 중" 뱃지 D+N 예상일 안내
- [x] **[UX7]** RecommendedStockCard reason 항상 노출

**3차 — 배포 전 필수 (Sprint 1, ~3일, 2026-04-15 부분 완료)**
- [x] **[C0]** 백엔드 경로 일원화 — 원본 `C:\Users\aistudio\Documents\stock_app_dev\`에서 `server/`(node_modules 제외) + `scripts/backfill-history.js` + `server/stocks.db` 이식 완료 (2026-04-15). `cd server && npm install` 필요
- [x] **[C1]** TypeScript 엄격 모드 복원 — `tsc --noEmit` 0 에러 확인 후 `next.config.ts`의 `ignoreBuildErrors` / `eslint.ignoreDuringBuilds` 제거
- [x] **[P2]** `useSearchParams` Suspense 래핑 — `/portfolio`, `/stock/[code]` 둘 다 (Next.js 15 빌드 차단 회피)
- [x] **[P3]** `/stock/[code]/loading.tsx` 추가 — `use(params)` 깜빡임 완화
- [x] **[P4]** `usePortfolioStore.getState()` 직접 접근 제거 — 셀렉터 `holdings`로 교체 (`stock/[code]/page.tsx`)
- [x] **[P6]** HeaderBar 폴링 분리 — 알림 60초 / 시장지수 300초 (불필요 호출 80% 감소)
- [x] **[P7]** `/alerts` 첫 진입 안내 카드 (`onboarding_alerts_explained`) + UX-NEW4 `?from=alerts` 딥링크
- [x] **[P8]** 대시보드 `onNavigate` 맵 제거 → `router.push()` 직접 호출 (useNavigationStore 잔재 정리)
- [x] **[P5/UX-NEW1]** `computeProbability` 라벨 "상승 예측 확률" → **"종합 신호 점수 (0~100)"** + amber 면책 배너
- [x] **[UX-NEW2]** PER 0/음수/null 분기 — '이익 없음' / '적자' / '---'
- [x] **[UX-NEW6]** 대시보드 "마지막 업데이트" 24h 초과 시 amber + "내일 08:00 이후 새로 고침" 안내
- [x] **[Fix-1]** `StockDetail`에 `holding_opinion` / `last_updated` 필드 정식 추가 → `as unknown as` 캐스트 제거
- [x] **[Fix-2]** `/stock/[code]` 내부 Suspense `fallback={null}` → 스피너+문구 스켈레톤
- [x] **[Fix-3]** `next.config.ts` — 개발 환경 `/api/*` → `http://localhost:3001` 프록시 rewrites 복원
- [x] **[Fix-4]** `/alerts` useEffect 의존성 `[fetchAlerts, markAllRead]` → `[]` (마운트 1회)
- [x] **[Fix-5]** 대시보드 KOSPI 툴팁 — 내부 용어 "Phase 4 백테스팅 모듈" 제거
- [x] **[UX-A]** 종합 신호 점수 설명 — "10점 점수 + 목표가·이평선·변동성으로 환산한 보조 지표" 문구 추가
- [x] **[UX-B]** "실시간 데이터 업데이트" → "데이터 새로 고침" (실시간 오해 방지)
- [x] **[UX-C]** "투자 조언" → "알고리즘 분석 요약" (투자 권유 오해 방지)
- [x] **[UX-D]** `/stock/[code]/loading.tsx` "데이터 분석 중..." → "종목 정보를 불러오는 중이에요..."
- [x] **[UX-E]** 대시보드 빈 상태 CTA — `onboardingDone` 의존 제거 (온보딩 건너뛴 유저도 CTA 노출)
- [x] **[UX-G]** `/alerts` source 뱃지 — 'holding' → [보유 중] / 'watchlist' → [관심 종목]
- [x] **[UX-H]** 거래량 Y축 — `k` → `만`/`백만` 한국식 단위
- [x] **[C-NEW3/Fix-Vercel-2]** `dashboard/page.tsx` 미사용 `onboardingDone` state 제거
- [x] **[H-NEW1/Fix-8]** Recharts `CandlestickBar` wick 좌표 버그 → 캔들 차트 토글 버튼 숨김 (Sprint 3 [M2] lightweight-charts 전환 시 재도입)
- [x] **[C-NEW1/C-NEW2]** `types/stock.ts` 정리 — `AddHoldingPayload` 신설 + `UpdateHoldingPayload` alias, store/stockApi 참조 정합성 확보
- [x] **[UX-I]** "보유 전략" → "내 종목 상태" (초보자 과도한 의미 부여 방지)
- [x] **[UX-L]** 대시보드 보유종목 카드 — `holding_opinion` 뱃지 + "분석 중" 상태 추가
- [x] **[UX-N]** `/alerts` 빈 상태 — 알림 트리거 조건(5일 평균선 이탈·목표가 근접·저평가) + 갱신 시각(매일 08:00) 명시
- [x] **[C2-local]** 로컬 `next build --turbopack` 통과 확인 (Next 16.2, 11개 라우트, tsconfig.json 자동 업데이트 `jsx: react-jsx` 포함)
- [x] **[C2-vercel]** Vercel 배포 성공 확인 (2026-04-15) — Next 15.3 → 16.2 업그레이드로 그간 실패 원인 해소
- [x] **[C-GATE/Fix-GATE]** HealthGate — `fetch` + `AbortController` 25초 타임아웃 도입 (Render cold start 30~50초 1회 재시도로 커버) + UX-O "커피 한 모금 ☕" 문구. `stockApi.getHealth` 타임아웃 6s → 25s 통일
- [x] **[M-1/Fix-7]** 미사용 `chartType` state + `CandlestickBar` 컴포넌트 제거 (Sprint 3 lightweight-charts 전환 시 재도입)
- [x] **[C3]** Neon 마이그레이션 + backfill-history 완료 (2026-04-15)
  - Neon: AWS ap-southeast-1(Singapore) `ep-holy-dawn-a1v2z6yo` (pooler 엔드포인트)
  - 서버 의존성 추가 설치: `express-rate-limit` (`server/package.json` 누락분 보완)
  - `initSchema` → 테이블 전체 생성 완료
  - `registerInitialData` → **97 종목** + **20 추천** 시드 완료
  - `backfill-history.js` → **70,135행** 적재 완료 (97/97 종목, 평균 728일)
  - 검증 SQL `HAVING COUNT(*) < 600` → 1종목만 경고: **쌍용C&E(003410)** 300일 (2024-08 **상장폐지**로 이후 데이터 없음 → `majorStocks`에서 제거 필요, 3.5차 이관)
- [ ] Vercel + Render 배포 + `FRONTEND_URL` CORS 설정
  - **순서 고정**: Neon 마이그레이션 → backfill → Render 배포(API URL 확정) → Vercel 환경변수 설정 → Vercel 빌드 → E2E
  - **HealthGate 타임아웃 상향** (현재 15초 → 25초) 또는 Render Health Check `/api/health` 설정으로 cold start 대응
- [ ] E2E 수동 검증 (포트폴리오 CRUD, 추천, 스크리너, 종목상세, 알림, 온보딩 3갈래)

**3.5차 — 잔여 보완 (Sprint 1.5, 배포 후 우선순위 가능)**
- [ ] **[H-NEW2/P10]** `app/portfolio/page.tsx` 로컬 toast → `useToastStore` 통일
- [x] **[H-NEW3]** `/stock/[code]` `stockApi.deleteStock` 직접 호출 → store 경유로 변경 (로컬 상태 동기화 보장) — `usePortfolioStore.deleteStock` 액션 신설
- [x] **[Fix-6]** 시장지수 중복 fetch 해소 — `useMarketStore` 신설. 300s TTL + inflight Promise로 중복 요청 차단. HeaderBar·대시보드 공용 구독
- [ ] **[Fix-7/M2]** Recharts 커스텀 `CandlestickBar` wick 미동작 → Sprint 3에서 lightweight-charts 전환 우선 검토
- [ ] **[UX-NEW3]** `profitHelpCode` 팝업 외부 클릭 닫기 (mousedown 리스너)
- [ ] **[UX-NEW5]** `RecommendedStockCard` reason 2줄 초과 시 "더 보기" 토글
- [ ] **[UX-NEW7]** 섹터 비교 테이블 — 현재 종목 자동 스크롤 또는 최상단 고정
- [ ] **[UX-NEW8]** 포트폴리오 등록 폼 "비중(%)" 필드 — 레이블 재작성("총 자산의 몇 %") + "잘 모르겠으면 비워두세요" 힌트
- [ ] **[UX-F]** 재무제표 테이블 — periods 정렬 방향(최신 → 과거) 헤더에 명시
- [x] **[Cleanup-1]** 쌍용C&E(003410) `majorStocks` 제거 + Neon에서 stock_history 300행 + stocks 1행 삭제 (96종목/69,835행)
- [x] **[UX-T]** 에러 인터셉터 — HTTP 상태 코드별 한국어 친화 메시지 매핑 (400/401/404/429/5xx + 기본)
- [x] **[UX-U]** silent 목록 확장 — `/market/indices`, `/volatility`, `/news` 추가 (보조 폴링 실패 토스트 억제)
- [x] **[M-1]** Axios 글로벌 기본 타임아웃 30s — Render cold start + 스크래핑 지연 보호
- [x] **[E2E-C1]** 첫 종목 가이드 카드 잔재 제거 — `holdings.length === 1` 조건 강화 + 0개 시 즉시 제거 (2026-04-18)
- [x] **[E2E-C2]** HeaderBar 검색 오버레이 잔재 — `usePathname` 구독으로 라우트 변경 시 검색 입력·드롭다운 초기화
- [x] **[E2E-C3]** 종목 상세 진입 시 스크롤 최상단 — `useEffect([code]) → window.scrollTo({top:0})`
- [x] **[E2E-H1]** 온보딩 "공부 시작" 라우팅 — `/stocks`(97종목) → 대시보드(기본)로 변경, 초보자 UX 개선
- [x] **[E2E-H2]** 포트폴리오 추가 폼 상시 노출 — 우상단 중복 버튼 제거, `showAddForm` state 삭제
- [x] **[E2E-H3]** 모바일 반응형 — 섹터 비교 테이블 `min-w-[600px]` 가로 스크롤, 코드/날짜 `flex-wrap whitespace-nowrap`
- [x] **[E2E-M1]** 검색 부분 일치 정렬 — `ORDER BY CASE ... ILIKE 'prefix%' THEN 1 ...` ('삼성' → 삼성전자·삼성SDI 모두 노출)
- [x] **[E2E-M2]** 로딩 안내 친화화 — HealthGate "30~50초" 명시, `/stock/[code]` "보통 3~5초 소요" 안내
- [x] **[E2E-M3]** Axios 5xx 자동 재시도 1회 — `_retry` 플래그, 2초 대기, `RetryConfig` 타입 확장
- [x] **[Settings-UX]** `/settings` 종목 수동 추가 — `StockSearchInput`(DB 드롭다운) 제거 → 6자리 코드 입력 form (네이버 크롤링 업서트). 로딩 배너·성공/실패 메시지·🔵🟢🔴 콘솔 로그 추가
  - **한계**: 네이버 금융 URL이 `?code=` 필수라 종목명 입력은 미지원 → **3.6차에서 KRX 디렉토리로 해소**

**3.6차 — 종목 디렉토리 선행 (Sprint 1.6, Phase 6 일부 앞당김, 2026-04-19)**

`/settings` 수동 추가 UX가 종목 코드만 받는 한계 해소용. 네이버 크롤링 URL은 `?code=`가 필수라 종목명 직접 입력 불가. **전 상장 종목 명→코드 매핑 테이블을 선행 구축**해 프론트가 "삼성전자" 입력 시 `005930`로 변환해 `POST /stocks`에 전달.

- [x] **[DIR-1]** `stocks_directory` 테이블 신설 — (code PK, name, market [KOSPI/KOSDAQ/KONEX], listed_at, delisted_at, updated_at) + `idx_stocks_directory_name/_market`
- [x] **[DIR-2]** KRX CSV 수집 파이프라인 — `server/domains/stock/directory.js`에 `syncDirectory`/`syncDirectoryIfEmpty` export. `setupScheduler` 내 서버 시작 후 10초 지연으로 **디렉토리가 비어 있을 때만** 1회 동기화. 수동 실행은 `scripts/sync-directory.js`. 일 1회 자동 스케줄링은 Phase 6 본작업으로 이월
- [x] **[DIR-3]** `GET /api/stocks/directory/search?q=` 엔드포인트 — name/code ILIKE + 시작 일치 우선 정렬 (E2E-M1과 동일 패턴), `delisted_at IS NULL`, 최대 10건. `lib/stockApi.ts`에 `searchDirectory()` 래퍼 추가
- [x] **[DIR-4]** `/settings` 입력창 자동완성 — 2자 이상 디바운스 250ms로 `searchDirectory` 호출, 드롭다운에 name + code(mono) + market 뱃지(KOSPI/KOSDAQ 색상 구분) 표시. 선택 시 확정 칩(✓ name (code) · market [×]). 선택 없이 6자리 숫자 직접 입력은 폴백으로 그대로 동작
- [ ] **[DIR-5]** `POST /api/stocks` 확장 — body에 `code` 대신 `q`(name 또는 code) 허용. name이면 디렉토리 조회 후 code 해석, 실패 시 400 + 후보 제안 (현재는 프론트가 `selectedHit.code`를 직접 넘겨 code로 정규화하므로 백엔드는 code 경로만 유지)
- [ ] **[DIR-6]** 상장폐지 감지 — 디렉토리 갱신 시 `delisted_at` 채워진 종목은 `stocks` 테이블에서 경고 로그 (Cleanup-1 같은 수동 정리와 연결)

**범위 제한**: 이번 선행은 **디렉토리 조회만** 포함. 가격·거래량·재무 등 시세 데이터는 여전히 네이버 크롤링 유지 (Phase 6 본 작업에서 KRX OpenAPI 전환).

---

**3.7차 β — 테마 시스템 + 스크리너 강화 + Phase 5 스키마 선행 (Sprint 1.8, 2026-04-24)**

초보자 탐색 진입점 확장. "뉴스에서 본 테마 → 관련 종목" 경로를 정식으로 연결하고, 스크리너에 히스토리/수급 기반 동적 프리셋을 추가.

- [x] **[THEME-1]** `stock_themes` 테이블 + 10개 핵심 테마 시드 (`data.js`)
  - 테마: 2차전지·전기차 / AI·반도체 / 방산·우주항공 / 바이오·헬스케어 / 고배당 / 대형주·우량주 / 수출주·글로벌 / 내수·소비재 / 친환경 / 금융·보험·증권
  - 대표 15종목 수동 큐레이션 + 나머지는 `CATEGORY_TO_THEMES` 폴백 자동 매핑
- [x] **[THEME-2]** 엔드포인트 3종
  - `GET /api/themes` — 테마 목록 + 종목 수
  - `GET /api/themes/:themeId/stocks` — 특정 테마 종목
  - `GET /api/stock/:code/themes` — 종목이 속한 테마
- [x] **[THEME-3]** `/themes` 페이지 신설 — 모바일도 허용 (PC 전용 아님). `?id=<theme>` 쿼리로 상태 공유
- [x] **[THEME-4]** 종목 상세 헤더에 테마 태그 (지연 로딩). 태그 클릭 시 `/themes?id=...` 이동
- [x] **[THEME-5]** 추천 페이지 상단에 "🎯 테마로 종목 찾기" 진입 배너
- [x] **[THEME-6]** Sidebar 메뉴에 "테마 탐색" 추가 (`Sparkles` 아이콘, 관심종목/스크리너 사이)
- [x] **[SCREENER-1]** 동적 프리셋 4개 — `?preset=` 쿼리 분기 방식
  - `breakout_52w` — 52주 신고가 돌파 (stock_history high JOIN LATERAL)
  - `foreign_buy` — 외국인 최근 5거래일 순매수 상위 (investor_history 집계)
  - `fund_buy` — 기관·연기금 최근 5거래일 순매수 상위
  - `neglected` — 30일 평균 대비 최근 5일 거래량 < 30%
  - 기존 4개 프리셋(저평가/자산/성장/소액)은 그대로 유지 (하위 호환)
- [x] **[SCREENER-2]** 프리셋 레이블 초보자 친화 개선 + `NEW` 뱃지 + 프리셋별 보조 메트릭(52주 고점 대비 +N%, 외국인 +N억 순매수 등) 뱃지
- [x] **[SCREENER-3]** 수급 프리셋 빈 결과 전용 안내 ("수급 데이터를 수집 중이에요 — 매일 08:00 업데이트")
- [x] **[PHASE5-PRE]** `users` / `user_subscriptions` 테이블 DDL 선행 추가. 라우트 미연결·데이터 미사용 상태로 스키마만 고정. Phase 5 착수 시 ALTER 없이 구현 가능
- [x] **[LIB]** `lib/themesMeta.ts` — emoji/color 메타를 `/themes`와 `/stock/[code]`가 공유
- [ ] **[EXPAND-1]** 종목 96 → ~180개 확대 — `scripts/expand-stocks.js` 신설 (TARGET_CODES ~86개, 배치 3 × 3초 간격으로 네이버 크롤링 + upsert). **스크립트 실행은 운영자 수동 — `DATABASE_URL=... node scripts/expand-stocks.js`**
- [x] **[EXPAND-2]** `STOCK_THEME_MAP` 수동 큐레이션 확장 — 15 → ~50종목. 2차전지/AI/방산/바이오/금융·고배당/엔터/조선·친환경 카테고리 전반에 걸쳐 대표 종목 추가. 나머지는 `CATEGORY_TO_THEMES` 폴백 유지

**범위 제한**: 프리셋 분기 로직은 단순 if-return 패턴. Phase 4 백테스팅 시점에 preset → 점수화 모듈로 통합 예정.

---

**3.8차 — vibe-investing 접목 (무료 단계, 2026-04-25)**

기존 DB 데이터(stocks, stock_history, investor_history)만 활용해 분석 깊이를 한 단계 끌어올림. 추가 스크래핑 없음.

- [x] **[FG-1]** `GET /api/market/fear-greed` — RSI proxy(40%) + 외국인 매수 비율(30%) + 52주 고점 근접 비율(30%) 가중. `investor_history` 비어 있으면 외국인 점수 50 폴백. 어떤 단계 실패해도 `score:50, label:'중립'` 반환
- [x] **[FG-2]** 대시보드 시장 온도 게이지 카드 — 그라데이션(blue→slate→red) + 점수/라벨 + ? 도움말 토글
- [x] **[SCREENER-4]** 그레이엄 저평가 프리셋 — `Graham Number = √(22.5 × EPS × BPS)`. `eps_current > 0 AND pbr > 0` 조건 필수, 적정가 > 현재가 종목만 상승 여력순 정렬
- [x] **[SCREENER-5]** 3개월 모멘텀 프리셋 — `LATERAL JOIN`으로 90일 전 가장 가까운 종가 추출, 상승률 상위 20개
- [x] **[PEG-1]** 종목 상세 PEG 카드 — `PER ÷ EPS 성장률`. 음수·0 성장률은 `---` 표시. PER/PBR/ROE/목표가 4열 → 5열 그리드로 확장 (`md:grid-cols-3 lg:grid-cols-5`)
- [x] **[PEG-2]** `HelpBottomSheet`에 `peg` 항목 추가
- [x] **[SHARPE-1]** `GET /api/holdings/sharpe` — 보유 종목별 20일 일간 수익률 stddev → 252거래일 환산. 무위험금리 3.5%. 가중치는 `holding_stocks.weight` (없으면 10). 5일 미만 히스토리는 제외
- [x] **[SHARPE-2]** 대시보드 위험 대비 수익 카드 — 1 초과/0 초과/0 이하로 색상 구분(emerald/blue/red), 도움말 토글

---

**3.9차 — 의사결정 중심 UX 완성 (2026-05-11)**

탐색→분석→결정→학습 전체 흐름 완성. 결론·다음 행동·맥락형 학습을 모든 핵심 페이지에 배치.

**1묶음 (A~C) — 결론·행동 최상단 배치**
- [x] **[UX-A]** 종목 상세 결론 카드 (`generateStockSummary` / `generateActionGuide` 순수 함수). 헤더 직하·차트 위 배치. market_opinion·holding_opinion에 따라 emerald/red/slate 톤. 한 줄 요약 → 의견 뱃지 → 3단계 행동 가이드 → 면책
- [x] **[UX-B]** 포트폴리오 매도/관망 종목 카드에 인라인 행동 가이드 스텝. 첫 스텝은 종목 상세 진입 버튼으로 연결
- [x] **[UX-C]** 대시보드 "오늘 확인할 것" 카드 — 매도/관망 보유 종목 + 미읽 알림 집계. 0건+보유있음 시 "✅ 모두 양호" emerald 카드

**2묶음 (D~G) — 탐색·온보딩·학습 흐름 완성**
- [x] **[UX-D]** `RecommendedStockCard` 결론형 재작성 — `왜 지금?`(blue) / `가격 차이`(emerald) 라벨드 섹션. `상세 분석 보기` + `관심 ♡` 버튼 2개. `useWatchlistStore.addToWatchlist` + `useToastStore` 연결. 관심 추가 토스트에 `알림 설정 →` 액션 포함
- [x] **[UX-D2]** `/recommendations` 상단 "📌 이 종목들은 왜 추천됐나요?" 안내 배너 추가
- [x] **[UX-E]** `DisclaimerModal` Step 0(앱 가치 제안) 신설 — 137종목 분석 / 내 종목 상태 / 테마 탐색 / 가격 변화 알림 4가지 카드. `disclaimer_accepted` 없을 때만 Step 0부터 시작. 기존 사용자는 Step 1/2 그대로
- [x] **[UX-E2]** 온보딩 3갈래 레이블 명확화 + 부제 추가. `주식 기초부터 이해하기` 선택 시 `/stocks` 이동 + `localStorage.onboarding_mode = 'learn'` 플래그
- [x] **[UX-F]** `/themes` 종목 카드 우측 ♡ 버튼 — `e.stopPropagation()`으로 카드 클릭과 분리, `inWatch` 상태에 따라 색/채움 변화. 추가 토스트에 알림 설정 액션 포함. `<button>` 중첩 회피 위해 외곽을 `<div role="button">`로 변경
- [x] **[UX-G1]** `/stocks` 학습 모드 배너 — `onboarding_mode === 'learn'`일 때 3단계 기초 가이드(LEARN_TIPS). "다음 팁 →" / "완료" 버튼으로 순환, 닫기 시 플래그 제거
- [x] **[UX-G2]** `HelpBottomSheet` 각 용어에 `implication`(선택 필드) 추가 — "그래서 어떻게 보면 되나요?" 슬레이트 박스. PER/PBR/ROE/PEG 4종에 시사점 1줄 작성. 기존 `body`/`inApp`/`example` 구조 보존

**3묶음 (모바일 보완, 2026-05-13)**
- [x] **[MOB-1]** `/themes` 진입 경로 강화 — 추천 페이지 배너 테두리 진하게 + 압축 문구, 대시보드 빈 상태 CTA 3→4 카드(테마별 종목 탐색 추가), 스크리너 페이지 상단에 "🎯 테마로 보기 →" 링크
- [x] **[MOB-2]** 종목 상세 모바일 빠른 진입 — `#portfolio-add-form` id + `scroll-mt-20`, 결론 카드 직하에 lg:hidden "+ 포트폴리오에 추가하기 ↓" 버튼 (긍정적 미보유 종목 한정)
- [x] **[MOB-3]** 포트폴리오 행동 가이드 버튼 — `min-h-[44px] flex items-center`로 터치 영역 보장
- [x] **[MOB-4]** DisclaimerModal Step 0 — `max-h-[90vh] flex-col`로 모달 자체 높이 제한, 컨텐츠 영역 `overflow-y-auto`, 버튼 영역은 스크롤 밖에 고정 (작은 화면에서도 4개 기능 카드 + "시작해볼게요" 버튼 모두 접근 가능)
- [x] **[MOB-5]** Fear & Greed 게이지 포인터 `transition-all duration-500` — 점수 변경 시 부드러운 이동
- [x] **[MOB-6]** `/alerts` 가이드 텍스트 `break-keep` — 한국어 단어 단위 줄바꿈

---

**4.5c차 — 종합 해석 (초보자용 데이터 풀이, 2026-07-28)**

데이터·지표를 보여주기만 하던 걸 초보자 언어로 풀이 + 상충 짚기. **투자 권유 아님** — 사실+정도표현(싼/비싼/높은/낮은 편)까지만, 판단 단어(좋다/나쁘다/위험/사라/팔라) 금지. 종합은 상충 서술 + 판단 유보. 기존 계산(scoringBreakdown·indicators·sectorData·DART 재무)만 재사용, 신규 계산·백엔드 변경 없음.

- [x] **[INT-1]** `lib/stockDetail/interpret.ts` — 순수 함수: 밸류(PER vs 업종중앙값)/재무(부채비율)/기술(SMA 관찰형)/수급(외국인·기관 연속 순매수·순매도 스트릭)/업종위치 + `synthesize`(상충/쏠림/부족 분기, 결론 유보) + `consecutiveStreak`
- [x] **[INT-2]** `tests/stockDetail/interpret.test.ts` — 경계값(PER=중앙값, 부채비율 100/200) + available:false + **금지어 전수 스윕**(광범위 입력 출력에 사라/팔라/좋다/나쁘다/위험 미포함, 관찰형 "팔고 있어요"는 허용). 16 → 49 테스트
- [x] **[INT-3]** [요약] `InterpretationPanel` — 결론 카드와 종합점수 사이. "현재 이렇게 보고 있어요" 항목별 풀이 + 종합 문단 + 면책 각주. 역할 분리(결론=한 줄/해석=근거/점수=수치)
- [x] **[INT-4]** [기업] 재무제표·업종비교 아래 한 줄 해석(interpretFinancial·interpretSectorPosition)
- **판단**: tone(positive/caution)은 synthesize 상충 집계용 논리 구분일 뿐 **UI는 무채색**(항목에 방향색 칠하면 "긍정=사라" 오독 → 3.13 규칙). 수급 스트릭은 scoringBreakdown이 매수만 카운트해 부족 → `investorData` net값에서 부호 있는 스트릭 계산
- 검증: tsc 0 · build ✓ · npm test 49 · 금지어 grep(출력) 0

---

**4.5a차 — DART OpenAPI 연동 ([기업] 탭 강화, 2026-07-27)**

금감원 DART OpenAPI(무료·공식)로 종목상세 [기업] 탭에 재무제표 원문 + 공시를 채움. **AI 없이 순수 파싱.** 성공 응답 구조는 부트 샘플(임시)로 라이브 검증 후 파서 확정 → 임시 코드 제거.

- [x] **[DART-1]** `dart_corp_codes`(고유번호↔종목) / `dart_financials`(canonical 계정) / `dart_disclosures`(rm·corp_cls 포함) 스키마 + migrate 검증
- [x] **[DART-2]** `server/scrapers/dart.js` — fail-soft(예외 미발생), 키는 env만·로그 노출 0, corpCode ZIP(adm-zip)+정규식 XML, status 000/013/020 분기
- [x] **[DART-3]** sync 스크립트 3종 — corpcodes / financials(`--dry-run`/`--save-sample`) / disclosures(**적응형 페이징**+노이즈 블랙리스트). 전부 `--dry-run`
- [x] **[DART-4]** 공시 카테고리 규칙 분류 9종(clarification 포함) + `NOISE_PATTERNS` 블랙리스트(소유상황·대량보유·의결권권유만 제외, 미분류 other는 저장)
- [x] **[DART-5]** `GET /stock/:code/dart/financials`·`/dart/disclosures` — DB 읽기 전용, 10분 캐시, 데이터 없으면 `available:false`
- [x] **[DART-6]** [기업] 탭 재배치 — 공시(구분선·무채색 뱃지·정정/철회 표시·DART 원문) → 재무제표(DART 우선, 네이버 폴백, 3섹션 세로) → 업종비교 → 뉴스
- **검증 파서 보정**(부트 샘플): 재무 계정 부분일치 오매칭(귀속·계속영업 하위라인)→정확일치+배제+PK first-wins / net_income IS·CIS 중복→손익 IS 한정 / 공시 corp_code 필터 정상(삼성 월 778건은 실제 다발) → 적응형+블랙리스트 / rm 꼬리공백 trim
- **판단**: 재무 증감은 화살표(▲▼)+**무채색**(매출 증가 ≠ 주가 상승, 3.13 방향색 규칙). 기존 네이버 FinancialsTable도 rise색 제거 통일. corp_code 매핑은 부트 샘플에서 005930→00126380 폴백(10만 건 부트 적재 회피)
- 검증: tsc 0 · build ✓ · npm test 16 · 순수 로직 스모크 53 · 어드버서리얼 리뷰(CONFIRMED 1건 수정)
- 환경변수: `DART_API_KEY`(Render). 미설정 시 기능 비활성(에러 아님, `available:false`)
- ⚠️ **운영 대기**: 적재 3종 미실행 상태 — `/dart/*`는 `available:false`(재무는 네이버 폴백, 공시는 "최근 공시가 없어요"). UI 확정 후 1회 적재 예정(운영자 수동)

---

**3.14차 — 벤치마크·상관관계 + 테마 배너 정리 (2026-07-22)**

출처: Vibe-Trading(HKUDS)의 벤치마크 패널·상관관계 히트맵 참고. **AI 없이 기존 데이터(stock_history)만으로 순수 계산**. 포트폴리오 관리의 두 핵심 질문 — "시장 대비 잘하고 있나", "진짜 분산됐나" — 에 답하는 지표 추가.

- [x] **[BM-DATA]** KOSPI 지수 히스토리 **전용 테이블** `market_index_history(symbol, date, close NUMERIC(12,2))` 신설 (운영자 결정 — stock_history 의사코드 대신 전용 테이블로 INTEGER 반올림 손실·집계쿼리 오염 회피). 적재는 `scripts/sync-index-history.js` (네이버 `siseJson?symbol=KOSPI/KOSDAQ`, backfill 패턴 재사용, ON CONFLICT 멱등). **실행은 운영자 수동** — `DATABASE_URL=... node scripts/sync-index-history.js`. 일 1회 자동 스케줄링은 Phase 6 이월
- [x] **[BM-1]** `GET /api/holdings/benchmark` — KOSPI 대비 초과수익 + 정보비율(IR). 현재 보유 구성을 과거 시세로 역산한 일별 가치(= `/holdings/history` 동일 시계열)로 포트 일수익률 → 같은 날짜 KOSPI 종가 변화율과 비교. `excessReturn = portfolioReturn - benchmarkReturn`, `IR = mean(초과수익)/std × √252`, `trackingError = std × √252`. KOSPI 히스토리 없거나 정렬 날짜 부족 시 `{available:false}` 폴백 (엔드포인트·UI는 스크립트 미실행 상태에서도 정상)
- [x] **[BM-2]** 대시보드 요약 라인에 "KOSPI 대비 N%p" + `?` 툴팁(포트 vs KOSPI 수익률 + 정보비율 초보자 설명). 방향색: 초과수익 양수=rise(빨강)/음수=fall(파랑). `available:false`면 이 항목만 미표시
- [x] **[CORR-1]** `GET /api/holdings/correlation` — 보유 종목 간 상관관계(최근 60거래일 일별 수익률, 피어슨). 보유 2종목 이상만(`single`/`empty`/`insufficient` reason), 20일 미만 종목 제외, 상위 3쌍(상관 내림차순) + max/avg. 종목별 history는 **한 쿼리로 묶어 조회**(Neon 풀 max=5)
- [x] **[CORR-2]** 포트폴리오 "분산 상태 점검" 블록 — 기존 비중 경고(weight>50)와 **별개**. 최고 상관 ≥0.7 caution 경고 / 0.4~0.7 정보성(중립) / <0.4 "잘 분산돼 있어요"(중립). **상관계수는 방향 아닌 관계 강도 → rise/fall 색 금지, caution/muted만** (3.13 색 규칙 준수)
- [x] **[UI]** 테마 배너 중복 정리 — 추천 페이지 배너에 `md:hidden`. 사이드바(`md:flex`의 "테마 탐색")가 나타나는 md+ 에선 중복이라 숨기고, 사이드바 접근 경로가 없는 모바일(md 미만)에선 `/themes` 진입로로 유지. *(스펙의 `lg:hidden` → 실제 사이드바 breakpoint가 `md:`라 `md:hidden`으로 조정)*
- [x] **[LIB]** `stockApi.getBenchmark`/`getCorrelation` + silent 목록에 `/holdings/benchmark`·`/holdings/correlation` 추가. `types/stock.ts` `BenchmarkResult`/`CorrelationResult`
- 검증: tsc 0 · next build ✓ · npm test 16 · node --check (schema/router/script)
- **판단 보류**: [CORR-2-3] 자산 배분 도넛 범례에 상관쌍 표시(선택) — 도넛에 이미 `집중` 태그가 있어 과밀 우려로 생략
- ⚠️ **운영 대기**: `sync-index-history.js` 미실행 상태에선 벤치마크가 `available:false`로 폴백(요약 라인에 "KOSPI 대비" 미표시). 스크립트 1회 실행 후 노출됨

---

**3.13차 — 비주얼 리디자인 (2026-07-22 완료)**

다크 slate+blue(AI 기본값) → 라이트 + 한국 증시 색. "색만 바뀐 느낌" 지적 후 밀도·정보위계·중복제거까지 포함. 규칙 12개는 `docs/FRONTEND_UX.md` 명문화, 토큰은 `docs/DESIGN.md` SSOT.

- [x] **[VIS-1]** 라이트 전환 (paper/surface/ink) — 전 페이지·전 컴포넌트 다크 잔재 0 (grep 검증)
- [x] **[VIS-2]** 한국 증시 색 — 상승/수익/긍정=rise(빨강), 하락/손실/부정=fall(파랑). 기계적 치환 금지, 용례별 판단(투자자 3주체·범주=무채색)
- [x] **[VIS-3]** accent(blue) 폐지 — blue는 fall 전용, 주요 버튼 ink. 게이지/바/점수 채움 무채색(방향색은 뱃지·수치에만)
- [x] **[VIS-4]** 이모지/장식 아이콘 제거(동작 아이콘만), 첫글자 아바타→종목코드
- [x] **[VIS-5]** tabular-nums + 밀도 규칙(패딩 base, 요소 tight/블록 리듬)
- [x] **[VIS-6]** 대시보드 히어로(80px 수익률 2열), 종목상세 3탭([요약][차트·지표][기업]) — 사이드바 폐지
- [x] **[VIS-7]** 카드 감옥 해체(목록=구분선, 묶일 것만 카드), 경고/면책 각주·[?]토글화(정보보다 크면 안 됨)
- [x] **[VIS-8]** 전 페이지 일괄(대시보드/포트폴리오/종목상세/추천/테마/스크리너/주요종목/알림/설정/관심종목) + 공용 ui(ErrorBanner/HelpBottomSheet/StatCard) + 죽은 themesMeta 삭제
- [x] **[BUG]** KOSPI/KOSDAQ 중복값·알림 누적·비중 0%(<1% 표시)·차트 Y축 포맷·업종비교 괄호(평균→제거)·보유 뱃지 누락
- 검증: next build + tsc 0 + npm test 16 통과 · 전역 grep(emerald/이모지/rounded-3xl/uppercase-tracking) 0
- 방식: 셸+대시보드 세로 슬라이스 → 페이지별 육안 판정 → 나머지 배치(멀티에이전트 변환 + 어드버서리얼 검증). 커밋 페이지별 분리
- ⚠️ 원본 사이드바 lightningcss darwin-arm64를 package.json에 넣어 Vercel(linux) 빌드 깨진 사고 → 제거. **플랫폼 전용 패키지 deps 금지**(메모리화)

---

**3.12.1차 — 원칙 위반 핫픽스 (2026-07-15)**

3.12 마무리에서 "범위 밖"으로 기록됐던 이슈 2건이 프로덕션에 노출된 원칙 위반이라 즉시 처리.

- [x] **[FIX-1]** 명령형/금지 표현 제거 — `summary.ts` "매수하세요"→"실제 매수는 증권사 앱에서 직접 진행해 주세요", `ScoringBreakdownPanel` "매수 신호/매도 신호"→관찰형("기술 지표가 상승/하락 흐름"). 명령형 금지 테스트 추가(재발 방지). 전수 grep으로 세 곳 모두 수정
- [x] **[FIX-2]** 포트폴리오 비중 미저장 → **판단 (B)**: 서버 `recalcWeights`가 이미 매수가·수량으로 비중 자동 계산(add/update/delete마다 호출, `POST /holdings`는 body의 weight를 읽지도 않음). 폼의 "총 자산의 몇 %" 입력은 반영된 적 없고 외부 자산까지 포함한 개념이라 충돌 → **입력 필드 제거**(PortfolioAddForm + DetailHeader 수정 폼) + "자동 계산" 안내. 집중도 경고(weight>50)는 자동 계산값으로 **이미 정상 동작**하던 경로(태스크 전제의 "작동한 적 없음"은 부정확 — 자동 weight는 살아있음). 거짓 UI만 제거

---

**3.12차 — 종목상세 리팩터링 (2026-07-15)**

1444줄 `app/stock/[code]/page.tsx`가 멀티에이전트 리뷰를 stall시켜 리뷰 자동화 복구가 목적. 계획 문서 `docs/REFACTOR_PLAN_STOCK_DETAIL.md` 기반, 단계별 독립 커밋(각 tsc 통과). Sprint 3 [M1] "차트 분리" 흡수.

- [x] **[P1]** 042670(두산인프라코어) 상장폐지 정황 제거 — `majorStocks`에서 제거. **Neon 행 삭제는 운영자 수동(로컬 DATABASE_URL 부재)**. P2가 구조적으로 무력화하므로 삭제 전에도 거짓 신호 없음
- [x] **[P2]** `signals.js` stale 가드 — 최신 history 10일 초과 시 신호 중단 + `stale:true` + amber 배너. `SignalResult.stale` 추가
- [ ] **[P3]** 041040(CJ CGV) — expand-2 삽입 실패분. **재삽입은 운영자 수동**. DisclaimerModal "178개"→"180여 개" 근사 표현으로 변경
- [x] **[S0]** StatsGrid ↔ chartTimeframe 결합 해소 (월봉 전환 시 전일종가·거래량 오염 수정) — 단독 커밋
- [x] **[S1]** 순수 함수 → `lib/stockDetail/{summary,format}.ts` (+ `helpTexts.ts` 정적 맵)
- [x] **[S2]** InvestorChart / FinancialsTable / NewsList (리프)
- [x] **[S3]** ConclusionCard / StatsGrid / SignalPanel / SectorCompare
- [x] **[S4]** MetricsGrid / IndicatorPanel — `onHelp(t)` 콜백 배선 (Context 미도입)
- [x] **[S5]** **ChartSection 통합 추출**(PriceChart/VolumeChart 분리안 폐기) + `detectCrossHistory` 신설 → `/signals` 응답 `markers[]`(최근 20일 크로스). 기존 "어제 1일" 마커의 노출 확률 ~4% → SIG-4 정상화. 헤더·사이드바 점수는 일봉 기준 계산으로 이동(S0와 동일 결합 해소)
- [x] **[S6]** DetailHeader / RightSidebar / PortfolioAddForm — refresh는 셸 소유(콜백). `id="portfolio-add-form"` DOM 계약 보존
- [x] **[S7]** 셸 **1444 → 254줄** (fetch 오케스트레이션 + 일봉 점수 + 레이아웃 조립만). `components/stock/detail/` 13개 + `lib/stockDetail/` 3개
- 검증: 각 단계 tsc 0 error. 구조 스냅샷(`docs/refactor-baseline/`) 대비 차트 높이(288/96/264) + DOM id 보존 확인. 스크린샷은 로컬 dev(lightningcss) 불가로 구조 grep 대체. S5 마커는 배포 API 30종목 샘플 중 22종목에서 markers[] 확인(창 20일 확대 실동작)
- ⚠️ **[정정]** 리팩터링 동기였던 "1444줄 → 리뷰 stall 복구"는 **미달성**. 254줄 셸 + 13컴포넌트로 분해 후에도 동일 stall 재현(4개 중 3개 에이전트 무진전) → 원인은 파일 크기가 아님. 단, 워크플로 변수(병렬 에이전트 수·컨텍스트 주입 방식)를 통제하지 않은 관찰이므로 "인프라 문제" 단정도 근거 부족. **원인 미확정**으로 기록. 리팩터링의 독립적 가치(응집도·테스트 가능성·컴포넌트별 리뷰 용이성)는 유효
- **[미수정 이슈]** 매수 폼 "총 자산 비중(%)" 입력이 store에서 `weight:0` 하드코딩으로 버려짐(3.12 이전부터) — `docs/FRONTEND.md` 참조. 리팩터링 범위 밖

---

**3.11차 — 매수/매도 관찰 신호 강화 (2026-05-13)**

일 1회 배치(어제 종가) 데이터로 7종 관찰 신호를 계산해 종목 상세·대시보드에 노출. **명령형("사세요"/"파세요") 절대 금지 — 전부 관찰형 서술.** 방향 중립 신호(스퀴즈)는 방향 단정 안 함. 백테스팅 미검증이라 "예측" 아닌 "관찰"로 표현.

- [x] **[SIG-1]** `server/domains/analysis/signals.js` — 7종 관찰 신호 계산: 골든/데드크로스(SMA5×SMA20 교차), 볼린저 스퀴즈+돌파, RSI 과매도/과매수, MACD 히스토그램 전환, OBV 매집/분산, 거래량 급증, 외국인/기관 연속 순매수. 각 detect는 데이터 부족 시 null (전체 실패로 이어지지 않음). SMA/EMA는 시계열 헬퍼로 전환 시점(어제→오늘) 판정
- [x] **[SIG-2]** `GET /api/stock/:code/signals` — `{ signals, consensus:{positive,caution,total,summary}, asOf }`. computeSignals 내부 10분 캐시. 실패 시 빈 배열 + 안내 문구로 200 반환. analysisRouter가 stockRouter보다 먼저 마운트돼 `/stock/:code`에 안 가로채임
- [x] **[SIG-3]** 종목 상세 신호 요약 패널 (`Card` secondary) — 합의 요약(긍정 N/주의 M 색상 구분) + 개별 신호 라벨/관찰형 설명 + "어제 종가 기준" + 투자 권유 아님 면책. 결론 카드·한눈에 보기 다음, 차트 이전 배치
- [x] **[SIG-4]** 차트 골든/데드크로스 `ReferenceDot` 마커 — `chartData.rawDate`로 발생일 매칭. 보이는 구간(일봉 20일)에 있을 때만 마커+범례 노출
- [x] **[SIG-5]** 거래량 차트 하단 흐름 한 줄 해석 — 최근 거래량 vs 20일 평균 비율(2배↑/1.3배↑/0.5배↓/평소) 관찰 문구
- [x] **[SIG-6]** 대시보드 "오늘 확인할 것" — 매도/관망 종목 외에 관찰 신호상 주의 우세(caution>0 && caution≥positive) 보유 종목 추가. **성능: 보유 5개 이하만 신호 조회**
- [x] **[SIG-DOCS]** `types/stock.ts` `StockSignal`/`SignalResult` + `ChartDataPoint.rawDate`, `lib/stockApi.ts` `getSignals` + silent 목록 `/signals`

---

**3.10차 — DESIGN.md 디자인 시스템 도입 (2026-05-13)**

Google Labs DESIGN.md 포맷을 SSOT로 채택. 하드코딩된 임의값(text-[10/11px], rounded-3xl)을 토큰과 Tailwind 표준 클래스로 교체. 종목 상세에 "한눈에 보기" 9지표 그리드 신설. 기능 변경 없이 스타일만 개선.

- [x] **[DS-1]** `docs/DESIGN.md` SSOT + `app/design-tokens.css` @theme 블록. `rounded.sm/md/lg`는 이미 Tailwind 기본 `rounded-lg/xl/2xl`과 정렬돼 있어 `--radius-*` 오버라이드 생략 (기존 badge/button 회귀 위험 차단)
- [x] **[DS-2]** `components/ui/Card.tsx` — `primary`/`secondary`/`tertiary` variant + `tight`/`base`/`emphasis` padding + `accentBar` prop (positive/negative/neutral 좌측 4px 컬러바)
- [x] **[DS-3]** Pretendard CDN 로드 (globals.css @import) + `--font-sans` 폴백 스택
- [x] **[DS-4]** `text-[10px]`/`text-[11px]` 임의값 33건 전면 제거 → `text-xs` (12px). 위계는 이미 slate 명도로 표현되어 크기만 승격
- [x] **[DS-5]** `/stock/[code]` "한눈에 보기" 9지표 그리드(현재가·전일·거래량·52w H/L·PER·PBR·ROE·목표가) + 52주 범위 내 현재가 위치 게이지(구간별 안내 문구 5단계)
- [x] **[DS-6]** 결론 카드 `<Card variant="primary" accentBar={opinion}>` 위계 승격. 배경 tint 대신 accent bar로 절제
- [x] **[DS-7]** `rounded-3xl` 24건 전면 교체 — 일반 카드 → `rounded-xl`(12px), 강조 카드/모달(대시보드·포트폴리오 gradient, HelpBottomSheet) → `rounded-2xl`(16px)
- [ ] **[DS-8]** 정보성 blue → slate 절제 — 판단 위험이 커 3.10차에선 미실행. 인터랙티브 blue와 정보 blue 자동 분리 규칙 정의 후 별도 차수에서 진행
- [x] **[DS-DOCS]** `docs/FRONTEND_UX.md` 디자인 시스템 섹션 갱신 — 컬러 팔레트를 토큰 클래스 기준으로 재작성, DEPRECATED 목록 명시

---

**3.7차 종목 확대 2차 (2026-05-13)**

1차(EXPAND-1) 실행 후 일부 코드는 합병·코드변경·임시정지 등으로 실패. 2차 시도 + 신규 대상 추가로 200종목 근접을 목표.

- [ ] **[EXPAND-3]** `expand-stocks.js` 2차 실행 → 금융 6 / 바이오 10 / AI·반도체 6 / 방산 3 / 소재·중공업 4 / 소비재 3 / 에너지 5 / 게임·엔터 5 / KOSDAQ 우량주 2 ≈ 44개 추가 대상. **실행은 운영자 수동** — `DATABASE_URL=... node scripts/expand-stocks.js`
- [x] **[THEME-FIX]** `stock_themes` 시드 FK 위반으로 트랜잭션 전체가 abort되어 21행만 시드되던 버그 수정 — `STOCK_THEME_MAP`의 큐레이션 코드를 `stocks` 테이블의 실재 코드 Set으로 사전 필터링. skip 카운트와 최종 row 카운트를 로그로 가시화
- [x] **[UI-COUNT]** `/stocks` 페이지 헤더 — "N개 종목 · M개 섹터" 동적 표시 (정적 카운트 하드코딩 제거). `recommendations`·`dashboard`의 "97종목"/"97개" 잔재도 일반화 ("업종별 주요 종목")
  - 잔재: `components/layout/DisclaimerModal.tsx`의 "137개 종목 분석" 카드는 가치 제안 문구로 유지 — EXPAND-3 후 실수치로 갱신 필요

---

**3.7차 — 초보자 UX + 백엔드 위생 (Sprint 1.7, 2026-04-19)**

디렉토리 이식과 함께 묶어 처리한 동반 개선. 3.6차와 독립이지만 같은 배포 주기에 묶는다.

- [x] **[UX-INIT 6-1]** `/stock/[code]` 아코디언 — 투자자별 매매동향·분기별 실적·같은 업종 비교 기본 접힘(초보자 과부하 완화). 기술지표 종합·최신 뉴스는 펼침 유지. 각 헤더에 `ChevronDown` 회전 토글
- [x] **[UX-INIT 6-2]** PER 카드 섹터 게이지 바 — `sectorData.medians.per` 대비 위치 시각화(에메랄드/앰버) + "업종 평균보다 저렴/높음" 라벨
- [x] **[UX-INIT 6-3]** 포트폴리오 수익률 행동 유도 텍스트 — `holding_opinion === '매도'`일 땐 숨김. [주의 필요] 뱃지·설명과 중복 경고 방지
- [x] **[UX-SEARCH]** HeaderBar 빈 검색 결과 박스 — "이런 종목은 어때요?" 대표 종목 3개(삼성전자/SK하이닉스/NAVER) 빠른 이동 버튼
- [x] **[UX-ALERT]** `/alerts` 알림 카드 하단 — 타입별 1줄 가이드 (sell_signal/sma5_break/sma5_touch/target_near/undervalued)
- [x] **[FIX-SCHEMA]** `stock_analysis.ai_report` + `ai_report_date` 컬럼 선행 추가 (Phase 5 Claude Haiku AI 리포트 대비). `migrate.js`에 `addColumnIfNotExists` 헬퍼 추가로 기존 DB도 자동 보강
- [x] **[REFACTOR]** `requireDeviceIdMiddleware` — portfolio/alert/watchlist 라우터 전체에 `router.use(...)` 일괄 적용. 각 핸들러는 `req.deviceId` 참조만. `requireDeviceId`(레거시)는 하위 호환 유지
  - 예외: `server/domains/stock/router.js` 추천 엔드포인트는 deviceId가 있으면 홀딩 필터링, 없으면 전체 반환 — 필수가 아니므로 `getDeviceId` 직접 호출 유지

---

**4차 — 성능 최적화 (Sprint 3, 배포 후)**
- [ ] **[M1]** 차트 `components/charts/` 분리 + dynamic import 공유 청크화
- [ ] **[M3]** ISR 적용 (`/stocks`, `/recommendations` 우선 → `/stock/[code]` 마지막)
- [ ] **[M4]** 모바일 대시보드 상단 KOSPI/KOSDAQ 노출
- [ ] **[M2]** 캔들차트 lightweight-charts 전환 (별도 차수)

**5차 — 후속 UX 개선 (Sprint 4, 배포 후)**
- [ ] **[UX3]** `/stock/[code]` 탭 구조 ([요약] [차트] [분석] [기업])
- [ ] **[UX4]** 수익/손실 맥락 제공 (KOSPI 비교 또는 6구간 메시지 전체 적용)
- [ ] 검색 드롭다운 빈 결과 CTA 이동 대상 재정의

목표 사용자: **50명**

### Phase 4 — 데이터 누적 + 백테스팅
- **시작 조건**: backfill 완료 + 최소 2개월 실서비스 데이터 누적 후
- [ ] 스코어 임계값 백테스팅 (7/4점 → 데이터 기반)
- [ ] 섹터별 스코어링 가중치 (바이오·금융 우선)
- [ ] **`computeProbability` 폐기 결정** — MarketOpinion 스코어로 일원화 (백테스팅 대상 단일화)
- [ ] backfill 검증 SQL 사전 작성 (공휴일·임시휴장 오차 반영, 600건 이하 경고)

### Phase 5 — 소셜 로그인 + 구독 (50명 달성 후)
- [ ] Google OAuth 먼저 → Kakao OAuth 심사 병행 신청 (영업일 3~7일)
- [ ] device_id → user_id B안 병합 + 데이터 이전 확인 UI
- [ ] **device_id 소실 케이스 방침** — 브라우저 캐시 클리어 시 고아 데이터 발생. "데이터 없음" 안내 + 서버측 cleanup 스크립트 필요
- [ ] JWT (1h + 14일 refresh) — Express 백엔드에서만 검증, `jsonwebtoken` 사용 (Phase 5 사전 결정 §OAuth 참조)
- [ ] **Kakao Redirect URI 사전 등록** — 개발/스테이징/프로덕션 URI 전부 Kakao Developers에 등록 (Vercel Preview URL은 배포마다 변경되므로 Production URL만 OAuth 허용)
- [ ] 구독 DB 스키마 (상태·만료·환불 이력) → Toss Payments → Claude Haiku AI 리포트 (순차)
  - **사전 준비 완료**: `stock_analysis.ai_report` / `ai_report_date` 컬럼은 3.7차에서 선행 추가 (FIX-SCHEMA)
- [ ] **Toss Payments 웹훅 멱등성** — `payment_id` 기준 중복 차단, 최대 5회 재전송(지수 backoff) 대응
- [ ] KIS OpenAPI 신청 **병행 시작** (Phase 7 착수 전 심사 완료 필요, 영업일 1~3일)
- 목표: **200명**

#### Phase 5 설계 확정 사항 (2026-04-24)

**OAuth 개발 순서 확정**: Google OAuth 먼저(당일 승인) → Kakao OAuth 심사 병행.
(주의: 이전 문서의 "Kakao 먼저" 표현과 불일치 있었음 → Google 먼저로 통일)

**device_id → user_id 마이그레이션 (B안 상세)**
1. OAuth 콜백 성공 시 클라이언트가 기존 `device_id`를 `X-Device-Id` 헤더에 포함해 `POST /api/auth/link` 호출
2. 서버: `holding_stocks` / `watchlist` / `alerts`의 `device_id` → 신규 `user_id`로 UPDATE (트랜잭션)
3. 클라이언트: localStorage `device_id` 제거, JWT `accessToken` 저장
4. 마이그레이션 실패 → "이전 데이터를 불러올 수 없어요" 안내 + 수동 재등록 유도
5. 브라우저 캐시 클리어로 `device_id` 소실된 경우: 고아 데이터 그대로 방치 (cleanup은 별도 스크립트)

**JWT 검증 위치 확정**: Express 백엔드에서만. Next.js middleware 불사용.
→ `jsonwebtoken` 사용 가능. `jose` 도입 불필요.

**AI 리포트 접근 제어**: `user_subscriptions.status = 'active'` 조건.
스키마 선행 준비 완료 (`stock_analysis.ai_report` / `ai_report_date` 컬럼 기추가).

**Toss Payments 웹훅 설계**:
- `user_subscriptions` 테이블: `(user_id FK, status, plan, expires_at, payment_id UNIQUE, created_at)`
- 중복 수신: `payment_id UNIQUE` 제약으로 INSERT 실패 → 멱등 처리
- 재전송: 최대 5회, 지수 backoff (Toss 기본 정책)
- Phase 5 착수 시 `schema.js`에 DDL 추가

### Phase 6 — 데이터 소스 안정화
- [x] **상장 종목 디렉토리(명↔코드 매핑)**: 3.6차로 선행 이관 완료 (`stocks_directory` + KRX 파싱 + 서버 시작 시 1회 자동 동기화)
- [ ] **디렉토리 자동 스케줄링 (일 1회)**: 3.6차에서는 '비어 있을 때만' 조건이라 장기적으로 갱신 불가. `setupScheduler`에 일 1회 cron(예: 장마감 후 16:00 KST) 편입 + DIR-5(POST /stocks `q` 확장) + DIR-6(상장폐지 감지) 마무리
- [ ] **가격·거래량·투자자 매매동향**: KRX OpenAPI 전환 — CSV 응답 + 거래소 접두어 파싱 어댑터 레이어 선행 설계
- [ ] **PER/PBR/목표가**: KRX 월별 공시라 실시간 불가 → **네이버 스크래핑 유지** (Phase 6 범위 축소)
- [ ] 재무지표: FinanceDataReader(Python) — Node `child_process` 또는 별도 Python 마이크로서비스로 격리
- **목표**: 스크래핑 의존도 축소 (완전 제거 불가)

### Phase 7 — 실시간 분석 (구독자 100명+)
- [ ] Express WebSocket 레이어 확장 우선 검토
- [ ] KIS WebSocket + SSE 알림 — **장 외(09:00~15:30 KST 밖) 연결 폴백 로직 필수** (일봉 데이터 fallback)
- **사전 검증**: 수익 vs 서버 비용 마진 확인

### Phase 8 — AI 실시간 분석 (장기)
- [ ] Claude Haiku 실시간 패턴 감지
- [ ] 상업 데이터 제공사 검토 (FnGuide)

---

## Phase 3 재개발 — 원계획 대비 변경점

1. **ISR 유보**: 전체 CSR. Sprint 3에서 적용.
2. **차트 인라인**: 분리 미적용. Sprint 3에서 분리.
3. **레이아웃 확장**: 원계획 3종 → 실제 7종 (AppShell, HeaderBar, DisclaimerModal, ToastHost 추가).
4. **useNavigationStore 제거**: `useRouter/usePathname` 대체. pendingFocus → `?focus=` searchParams.
5. **알림 단일화**: 헤더 드롭다운 제거. `/alerts` 단일 라우트.
6. **`?from=` 컨텍스트**: 전체 호출처에서 searchParams 전달.
7. **Turbopack**: Windows+Node24 webpack 이슈 우회 (Next 16 업그레이드로 해소, Turbopack은 유지).
8. **타입 우회 임시**: `ignoreBuildErrors: true`. Sprint 1 [C1]에서 제거.
9. **단일 레포 이식 (신규)**: `server/`를 Next.js 레포 루트로 이식. `scripts/` 포함.

---

## 문서 참조

| 파일 | 내용 |
|------|------|
| `docs/BACKEND.md` | 백엔드 상세 (DB 스키마, API 28개, 알고리즘, 스케줄링) |
| `docs/FRONTEND.md` | 프론트엔드 상세 (페이지별 스펙, 컴포넌트, 스토어 인터페이스) |
| `docs/FRONTEND_UX.md` | UX 원칙 (온보딩, 면책, 디자인 시스템, 초보자 안내) |
| `docs/NEXTJS.md` | Next.js 전환 상세 (Server/Client 경계, ISR 패턴, 라우팅) |
| `docs/SKILL_KOREAN_STOCK_APP.md` | 도메인 지식 (주식 지표, 섹터별 특성, 면책 표현) |
