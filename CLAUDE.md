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
│   ├── themes/page.tsx           # 3.7차β — 테마 탐색 (모바일 허용, ?id=<theme>)
│   ├── stock/[code]/
│   │   ├── page.tsx              # CSR 3탭[요약/차트·지표/기업] (3.13 VIS-6), Suspense(useSearchParams), use(params)
│   │   └── loading.tsx           # use(params) 깜빡임 완화
│   ├── alerts/page.tsx           # PC/모바일 통일, 첫 진입 안내 카드
│   ├── journal/page.tsx          # 4.5b·C차 — 거래 진단 (CSR, PC 전용)
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
│   │   ├── RecommendedStockCard.tsx
│   │   └── detail/               # 3.12차 리팩터링 — 종목상세 17개 컴포넌트
│   │                             #   (ChartSection·ConclusionCard·InterpretationPanel·DartFinancials 등)
│   ├── portfolio/
│   │   └── WatchlistContent.tsx
│   ├── dashboard/
│   │   └── AttentionBlock.tsx    # A차 — 주목 레이어 블록 (대시보드 최상단)
│   └── ui/
│       ├── ErrorBanner.tsx
│       ├── HelpBottomSheet.tsx
│       ├── StatCard.tsx
│       └── NavButton.tsx
│   # 차트는 3.12차 S5에서 components/stock/detail/ChartSection.tsx로 추출됨.
│   # 공유 청크(dynamic import)로 묶는 components/charts/ 신설은 Sprint 3 [M1] 잔여.
│
├── stores/                       # Zustand ('use client' 내부에서만 import)
│   ├── usePortfolioStore.ts
│   ├── useAlertStore.ts
│   ├── useWatchlistStore.ts
│   ├── useMarketStore.ts         # 3.5차 Fix-6 — 시장지수 300s TTL + inflight 공용 구독
│   └── useToastStore.ts
│
├── lib/
│   ├── stockApi.ts
│   ├── deviceId.ts               # SSR-safe
│   ├── dataFreshness.ts
│   ├── stockDetail/              # 3.12차 — summary·format·helpTexts + 4.5c interpret (순수)
│   ├── journal/                  # 4.5b·C차 — interpret.ts (서버 metrics → 관찰형 한국어, 순수)
│   ├── attention/                # A차 — interpret.ts (원시 사실 → 중립 배지, 순수)
│   └── portfolio/                # D차 — attribution.ts (종목별 기여 분해 + 히어로 합계 SSOT, 순수)
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
│   ├── domains/                  # analysis·alert·portfolio·watchlist·system·dart(4.5a)·journal(4.5b·T2·T3)·attention(A차) — 아래는 발췌
│   │   ├── stock/
│   │   │   ├── service.js        # getStockData + syncAllStocks
│   │   │   ├── data.js           # registerInitialData (97 + 20 + 10테마)
│   │   │   ├── directory.js      # 3.6차 — KRX stocks_directory 동기화 + self-heal 하드닝(D1~D4)
│   │   │   ├── history.js        # 2A — fetchHistory/upsertHistory 공용(backfill·승격 공유)
│   │   │   └── router.js
│   │   ├── journal/              # 4.5b·C·T2·T3 — parsers/·biases/·universe·roundtrip·promote·service (상세는 docs/BACKEND.md)
│   │   └── attention/            # A차 — 주목 레이어. score·facts(순수) + service(DB 로드) + router
│   ├── scheduler.js              # setupScheduler + 디렉토리 D1(부팅 재동기화)·D4(일 07:30)
│   └── package.json              # 별도 의존성 — `cd server && npm install` 필요
│   # 운영은 전부 PostgreSQL (`pg` Pool, Neon). SQLite 레거시는 2026-04-15 정리 완료.
│
└── scripts/
    ├── backfill-history.js       # 97종목 × 3년 히스토리 적재 (배치 3개, ~6시간)
    ├── sync-directory.js         # 3.6차 — KRX 상장법인목록 수동 동기화
    ├── expand-stocks.js          # 3.7차 감마 — 종목 96→~180 확대 (배치 3 × 3초)
    ├── cleanup-delisted.js       # 상장폐지 종목 정리 (Cleanup-1)
    ├── cleanup-directory-junk.js # 1C — stocks_directory 000000/999999 정리 (--dry-run)
    ├── sync-index-history.js     # 3.14차 — KOSPI/KOSDAQ 지수 일봉 적재 (벤치마크용, 운영자 수동)
    ├── sync-dart-corpcodes.js    # 4.5a차 — DART 고유번호↔종목 매핑 (--dry-run)
    ├── sync-dart-financials.js   # 4.5a차 — DART 재무제표 (--dry-run/--save-sample)
    ├── sync-dart-disclosures.js  # 4.5a차 — DART 공시 (적응형 페이징 + 노이즈 블랙리스트)
    └── shoot-journal.mjs         # Playwright 시각검증 하네스 — /journal 스크린샷 (npm run shot:journal)
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
/themes              → 테마 탐색 (CSR, 모바일 허용), ?id=<theme>          # 3.7차β
/stock/[code]        → 종목 상세 (3탭), ?from=holding|recommendation|watchlist|major|search|alerts|theme
/alerts              → 알림 (CSR, PC/모바일 통일)
/journal             → 거래 진단 (CSR, PC 전용)                            # 4.5b·C차
/settings            → 설정
```

---

## 개발 명령어

```bash
# 프론트엔드
npm run dev              # 포트 3000 (--turbopack)
npm run build
npm run start
npm test                 # vitest run (순수 로직 유닛 — 파서·라운드트립·편향·해석 금지어 스윕 등)
npm run shot:journal     # Playwright 시각검증 하네스 — /journal 스크린샷 (artifacts/, CI 제외)
                         #   로컬/prod 대상: SHOT_BASE_URL·SHOT_API_BASE 오버라이드. chromium 필요(npx playwright install chromium)

# 백엔드
DATABASE_URL=postgres://... node server/server.js  # 포트 3001

# 히스토리 backfill
DATABASE_URL=postgres://... node scripts/backfill-history.js

# KRX 상장법인목록 → stocks_directory 수동 동기화 (name↔code 매핑)
DATABASE_URL=postgres://... node scripts/sync-directory.js

# stocks_directory 쓰레기 정리 (000000 붕괴 잔재 · 999999 진단 센티넬) — 1C, --dry-run 먼저
DATABASE_URL=postgres://... node scripts/cleanup-directory-junk.js --dry-run

# 디렉토리 강제 재동기화 (무료 Render — Shell 불가, 재배포 없이 재적재) — D3
curl -X POST "https://<render-api>/api/stocks/directory/sync" -H "x-admin-token: $ADMIN_SYNC_TOKEN"

# 종목 확대 — TARGET_CODES에 정의된 ~86개 코드를 네이버 크롤링으로 stocks 테이블에 추가
# (배치 3 × 3초 간격, 전체 ~10~15분)
DATABASE_URL=postgres://... node scripts/expand-stocks.js

# KOSPI/KOSDAQ 지수 일봉 적재 (벤치마크 초과수익·IR용) — 3.14차, 운영자 수동
DATABASE_URL=postgres://... node scripts/sync-index-history.js

# DART 적재 3종 (4.5a차) — 전부 --dry-run 지원. DART_API_KEY 필요
DART_API_KEY=... node scripts/sync-dart-corpcodes.js
DART_API_KEY=... node scripts/sync-dart-financials.js --dry-run
DART_API_KEY=... node scripts/sync-dart-disclosures.js --dry-run
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
ADMIN_SYNC_TOKEN=...   # D3 — POST /stocks/directory/sync 관리 레버 보호 (미설정 시 401·기능 비활성)
DART_API_KEY=...       # 4.5a — DART 적재/조회 (미설정 시 DART 기능 비활성, 에러 아님)
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

**4.5b차 — 거래일지·행동편향 진단 (2026-07-29)**

출처 컨셉: Vibe-Trading(HKUDS) Shadow Account. **규칙 기반, AI 불필요.** 초보자에게 "내가 뭘 반복하는지"를 본인 거래 데이터로 **관찰형**으로 보여준다(판정 아님, interpret.ts 안전 원칙 계승). 4.5c 이후 구현(순번은 논리적 위치).

- [x] **[JRN-1]** 신규 도메인 `server/domains/journal/` — CBD 분해. `parsers/`(Port&Adapter): `detectBroker`(헤더 시그니처) + `parseKiwoom/Toss/Samsung` + `normalize`(CSV 파싱·값정제·side/date 표준화·검증) + `index`(레지스트리+폴백). 브로커 추가 = 어댑터 추가
- [x] **[JRN-2]** `journal_trades` 스키마 — `{device_id, code, side, quantity, price, traded_at, source}`만. **원본 CSV·PII(계좌번호·예수금·성명) 미저장** — 파서 화이트리스트에서 제거. `DELETE /api/journal` 전량 삭제. price NUMERIC→Number() 캐스팅
- [x] **[JRN-3]** `roundtrip.js` — 종목별 FIFO 매수lot↔매도 매칭(부분/당일/공매도 skip) + `summarize`(승률·손익비·이익/손실 평균보유일·MDD, 전부 **실현손익 기준**)
- [x] **[JRN-4]** `biases/`(순수, metrics·flag만 — 판단 텍스트 없음): 처분효과/과매매/추격매수(stock_history 가격조회 포트 주입, coverage)/앵커링. **임계값 전부 미검증 임시값(provisional)** → Phase 4 백테스팅 대상
- [x] **[JRN-5]** API 3종 (`router.use(requireDeviceIdMiddleware)`): `POST /api/journal/upload`(csvText·broker?) / `GET /api/journal/analysis`(available:false 폴백) / `DELETE /api/journal`. `express.json` limit 4mb. journalRouter는 `/api/journal` prefix 전용 마운트
- [x] **[JRN-6]** 프론트 `app/journal/` — CSV 업로드(**EUC-KR 디코드→utf-8 폴백**, 프론트 처리라 백엔드 iconv 불필요) → 매매 통계 표 + 행동 관찰 카드 + "실증 검증 전" 뱃지 + 면책. **전 영역 무채색**(방향색 금지). Sidebar '거래 진단'(PC). x-device-id는 axios 인터셉터 재사용
- [x] **[JRN-7]** `lib/journal/interpret.ts`(순수) — 서버 metrics→초보자 관찰형 한국어(4.5c 구조 동일). `tests/forbiddenWords.ts` 공용 추출(4.5c도 재사용) + 질책·후회·손익판정·명령형(~세요) 확장, 전 출력 전수 검사
- **안전**: 편향은 태생이 판단적이라 원칙 위반 위험 최대 → 사실+중립 교육정의+관찰형("~하는 흐름이 보여요")까지만. 금지어(잘못/실수/손해/후회/좋다/나쁘/위험/사라/팔라/~세요) 전수 테스트로 회귀 차단
- 검증: tsc 0 · next build ✓(/journal) · npm test 89(파서13+라운드트립·편향·요약+해석 금지어 스윕) · 금지어 grep(출력) 0 · 방향색 0
- **단계 커밋**: 4.5b-1(파이프라인·적재) / 4.5b-2(FIFO·편향·analysis) / 4.5b-3(페이지·해석·금지어)
- **리뷰 반영(F1/F2/F3)**: ① 재업로드=**교체(replace)** — 트랜잭션 DELETE→INSERT, 유효 신규데이터 있을 때만(빈/전건 미매칭 업로드는 기존 데이터 보존). ② **미매칭 매도 coverage 고지** — 구간 이전 보유분 매도는 승률·손익에서 빠짐을 각주로. ③ **처분효과 문턱** — gap≥3일 & 이익/손실 각 n≥3일 때만 명명(소표본·미세격차 과다명명 방지). 어드버서리얼 리뷰 9에이전트/5findings 전건 REJECTED(실결함 0)
- ⚠️ **운영 대기/검증**: ① **파서 헤더** — 키움 ✅ 실파일 대조 완료(2026-07-31: 프리앰블 1행 + '거래구분'/'거래단가'/'거래수량'/'거래일자'·YYYY.MM.DD, 종목코드 컬럼 없음→종목명 매핑). **토스·삼성은 여전히 추정** — 실 export로 검증 필요(어긋나면 각 `parseX.js` SYN만 보강, 파이프라인 불변). ② 추격매수는 `stock_history` 필요 — 없으면 coverage로 skip 투명 공개. ③ 재업로드=교체이므로 여러 증권사 파일을 합치려면 각 파일 병합 후 1회 업로드(재업로드는 이전분을 덮어씀)

---

**Phase C — 매매 패턴 관찰 활성화 (와닿는 포트폴리오 관리, 2026-08-03)**

동료 평가("와닿는 게 없다") + 실계좌 E2E 진단 → 안전 원칙 과적용으로 인한 "공허" 반전. **신규 데이터 0**(journal 도메인 내 조립·표출). 경계선 R1(현저성 정렬)·R2(이벤트 배지 O/해석 라벨 X)·판단어 금지 준수, 인과 서술 금지(두 사실 나란히). "실현손실 전제라 침묵하던 처분효과"의 반쪽을 미실현 손실로 완성.

- [x] **[C-1]** 적재 메타·지속 커버리지 캐비엇 — `journal_imports(device_id PK, total, imported, skipped, skipped_names[], uploaded_at)` F1 교체 트랜잭션 안 upsert(가드 동일). `analyze`가 병합 → `journalCoverageNotes`(배열: 유니버스 제외+미매칭 매도 2축). **건수(skipped)≠종목수(skipped_names.length)** 분리 고지. 업로드 직후 1회성 → analysis 지속 노출로 전환
- [x] **[C-2]** open-lot 미실현 손실·킬러 한 줄 — `computeRoundtrips`가 FIFO 미청산분 `openLots`({code,quantity,avgBuyPrice 잔여가중,firstBuyDate}) 반환. `valueOpenLots`: stock_history 최신 종가(+날짜) → stocks.price 폴백 → unvalued. **asOfDate(최신 종가 날짜)·"지금" 금지**. `readOpenLossHeadline`: "실현 청산 N건 전부 이익, 최근 종가(asOfDate) 기준 미실현 손실 M종목(평균 K일)". 스코프 캐비엇 2축(가격=최근 종가/수량=업로드 내역) 내장. 결과 최상단 무채색 카드
- [x] **[C-3]** 평단 하향 추가매수 관찰 — `biases/avgdown.js`(순수): 매수만으로 러닝 평단 유지(매도 미변경), 각 매수가<직전 평단→이벤트, 첫 매수 제외. `readAvgDown`: "하락 뒤 다시 사서 평단을 낮춘 매수 N건(예: 딥노이드…)". **"물타기"·"편향"·판단어 금지**, 인과 미서술. 추격 0/N은 '예상된 null'로 재프레이밍(주석)
- **원칙**: 전 영역 무채색, provisional 뱃지, 면책, FORBIDDEN 스윕(물타기/편향 추가). tone/방향색 미사용
- 검증: tsc 0 · next build ✓(/journal) · **npm test 114** · 금지어 grep(출력) 0 · 방향색 0
- **어드버서리얼 리뷰(8에이전트/4렌즈)**: 4 CONFIRMED 수정 — ① 미실현 보유일 전역 asOfDate→종목별 날짜+음수 클램프(순수 `evaluateOpenLots` 추출·단위테스트), ② "전부 이익"을 winCount===roundtripCount로 게이트(본전 pnl=0 과장 방지), ③ FORBIDDEN 스윕에 물타기/편향 추가(전 브랜치 커버)
- ⚠️ **운영 대기/검증**: ① ingest 메타 upsert·`valueOpenLots`(DB 로드부)는 DB 통합이라 실DB는 운영자 검증(F1 동일 — 계산은 순수 `evaluateOpenLots`로 단위테스트됨). ② 미실현 평가는 **"업로드하신 내역 기준"**(부분 히스토리면 open-lot 과대 가능 — 미매칭 매도 캐비엇과 짝) + "최근 종가(asOfDate) 기준". ③ 추격 0/N 1종목 손계산 스팟체크
- **후속(로드맵)**: 유니버스 확장(§A 선행) ✅ **완료**(T1~T3 + 디렉토리 self-heal, 아래 차수) → A 주목 레이어(트리아지) ✅ **완료**(아래 차수) → B 포지션 앵커 해석 → D 성과 귀인

---

**유니버스 확장 + 디렉토리 self-heal (매핑 커버리지 60%→~100%, 2026-08-07)**

실계좌 75건 중 40%가 187 `stocks` 유니버스 밖으로 제외되던 사각 해소. **진짜 병목은 KRX 신규 적재가 아니라 journal이 187 `stocks`에 매핑하던 것** — ~2,650행 `stocks_directory`로 전환. Phase 1(KIND 보통주 ~100%) 우선, ETF/우선주 잔여는 Phase 2(KRX Open API)로 전방 호환.

- [x] **[T1]** `stocks_directory.type` 컬럼(common/preferred/etf/etn/reit/spac, 기본 common). KIND 적재분은 전부 common, Phase 2에서 태깅. CHECK 미부여(신규/기존 DB 정합 + Phase 2 값 확장 회피). `migrate.addColumnIfNotExists`로 기존 DB 멱등 보강
- [x] **[T2]** journal 매핑 대상 `stocks`(187) → `stocks_directory`(~2,650). 종목명→코드는 **정확·유일 매핑만**(동명은 오매핑 대신 skip) — 순수 `universe.buildNameIndex` 추출 + 단위테스트. avgdown 종목명도 디렉토리 조회
- [x] **[Part 1]** parseRow 알파뉴메릭 코드 복구(`stripped[2]` 우선 + 끝자리 영문 `/^[0-9A-Z]{6}$/` — 우선주/스팩 `00088K`류 ~90행이 000000 붕괴하던 것 복구) + 진단 라우트(debug/parsepreview) 제거 + `cleanup-directory-junk.js`(000000/999999 정리)
- [x] **[D1~D4]** 디렉토리 self-heal 하드닝(무료 Render, Shell 불가 → 부팅 self-heal): **D1** under-threshold 재동기화(`count<1000`, 실패로 남은 1행이 auto-sync 영구 skip시키던 고착 해소) / **D2** `fetchMarketWithRetry`(3회 선형 백오프 + Referer) / **D3** `POST /stocks/directory/sync`(토큰 보호 수동 레버) / **D4** 매일 07:30 강제 재동기화
- [x] **[E1]** `fetchMarket` 머리글 sniff 오탐 제거 — KRX 엑셀이 `<html>` 래퍼로 시작해도 유효한데 에러 페이지로 오탐하던 것. **파싱된 종목 행 수가 유일 게이트** + 임계값 미달 시 진단 로그(content-type·len·head)
- [x] **[T3 승격]** **2A** `fetchHistory`/`upsertHistory` → `server/domains/stock/history.js` 공용화(backfill·승격 공유) / **2B** `promote.js`(§4 A안: 보유분 현재가 동기[동시성3·예산8s] + 미등록 코드 12개월 이력 비동기 backfill, upsert-only·실패 격리) / **2C** ingest에서 `promoteCodes` 연동(try/catch로 업로드 무손상, `unvaluedCount` 캐비엇 유지). 네이버 개별 호출 `timeout: 4000`으로 동기 예산 hard budget화
- **환경변수**: `ADMIN_SYNC_TOKEN`(Render) — D3 관리 레버 보호(미설정 시 401)
- 검증: node --check · tsc 0 · **npm test 118**(+universe 4) · 운영자 실계좌 재업로드로 커버리지 확인
- ⚠️ **운영 대기**: ① 재적재 후 `cleanup-directory-junk.js`로 000000/999999 정리 ② 실계좌 재업로드 재검증(승격 후 킬러 한 줄 최신 종가) ③ ETF/우선주 잔여는 Phase 2(KRX Open API)

---

**A차 — 주목 레이어 / 트리아지 (2026-08-08)**

유니버스 확장으로 사각이 해소돼 착수. **보유+관심 종목을 객관적 현저성으로 정렬해 상위 몇 개만** 보여주는 대시보드 최상단 블록. 조언이 아니라 **주의 환기** — 판단·신호·목표가 없음. 신규 수집 0(기존 테이블 조립). 운영자 결정: 창=5거래일 · 스코프=보유+관심 · 표면=대시보드 상단 · 공시 type=중립(최신성+건수만).

- [x] **[A-1]** 신규 도메인 `server/domains/attention/` — D-Repo only(External/LLM 없음). `score.js`(순수: 정규화·곱 결합·바닥 컷·상위 K·dedupe) + `facts.js`(순수: 5거래일 수익률·거래량 배수·공시 집계·날짜 헬퍼) + `service.js`(DB 로드만) + `router.js`(`requireDeviceIdMiddleware`)
- [x] **[A-2]** `GET /api/attention` — `holding_stocks ∪ watchlist` × `stock_history` × `dart_disclosures` 조립 → **원시 사실(숫자) 배열**만 반환. 보유·관심 0이면 `available:false`, 전부 바닥 미만이면 `items:[]`(500 금지 — journal/dart 폴백 패턴). 가격은 히스토리 최신 종가 → `stocks.price` 폴백, 승격 전 종목은 `priced:false`
- [x] **[A-3]** **R1 현저성 점수** — 네 컴포넌트 각 0~1 정규화 후 `Π(0.1 + 0.9·c)`: 공시 최신성×건수(`exp(-d/7)` 블렌드·14일 룩백) · \|5거래일 수익률\|(15% 캡) · \|미실현\|(30% 캡) · 비중(30% 캡). **방향은 점수에서 배제(크기만)**. 관심은 미실현·비중 baseline 0.3. 상위 K=5, 바닥 미달 컷, 보유·관심 중복은 보유 우선 — ⚠️ **집계·baseline·floor는 2026-08-12 재설계로 대체(아래 A차 후속). 컴포넌트 정의만 유효**
- [x] **[A-4]** **R2 이벤트 배지** `lib/attention/interpret.ts`(순수) — 공시(건수·최신성) / 분류(중립 라벨 나열) / `5일 ±N%` / `거래량 평소의 N배` / `미실현 ±N%`(보유만) / `시세 정보 없음`. **배지는 나란히만 — 인과 문장 미생성.** 부호는 텍스트+색, 방향색은 가격·미실현에만
- [x] **[A-5]** 대시보드 최상단 `components/dashboard/AttentionBlock.tsx` — 구분선 목록(카드 나열 아님), 무채색 기본, provisional 뱃지, 면책 + `asOfDate` 고지. 클릭 시 `/stock/[code]?from=holding|watchlist`. 후보 없으면 스스로 미표시(빈 상태 CTA와 중복 회피)
- **판단 — `scoreFloor` 0.12 → 0.006 조정** *(2026-08-12 철회 — noisy-OR 전환으로 0.15)*: 곱 형태에서 disc=0이면 그 항이 0.1로 고정돼 **공시 없는 종목의 이론 최대가 보유 0.1 / 관심 0.0137**. 0.12는 사실상 '공시 필수' 필터라 DART 적재 대기 중(4.5a ⚠️)엔 블록이 상시 빈 상태가 된다. 0.006은 조용한 보유(≈0.001)는 컷하고 5거래일 ±6%(관심)·±8%+비중(보유)은 통과시키는 값 — **실데이터 튜닝 1순위**
- **판단 — 공시 룩백 14일**: 가격 창(5거래일)과 별개 상수. 5거래일(≈7일)로 맞추면 7일 반감 감쇠가 사실상 무의미해져, 넓게 잡고 최신성 감쇠로 자연 정렬시켰다(provisional)
- 검증: node --check · tsc 0 · next build ✓ · **npm test 158**(+attention 40: score 12·facts 10·interpret 10·service 8) · 금지어 스윕(`FORBIDDEN_ATTENTION` = BASE + 호재/악재/기회/추천/목표가) 전 브랜치 · 방향색은 가격·미실현 배지에만
- ⚠️ **운영 대기/검증**: ① `service.js`의 실DB 경로는 운영자 검증(로컬 DATABASE_URL 부재 — 조립은 스텁 쿼리로 단위테스트, 계산은 순수 모듈로 커버) ② **DART 미적재 상태에선 공시 컴포넌트가 상시 0** → 현재 현저성은 사실상 가격·거래량·미실현·비중만으로 결정됨. 적재 후 정렬이 크게 바뀌므로 상수 재튜닝 필요 ③ 프론트 시각 확인은 운영자 스크린샷(대시보드 상단)
- **후속**: 52주 고가 근접 배지(≈250거래일 이력 필요) · R2 심화(공시 카테고리 세분) · B 포지션 앵커 해석 · D 성과 귀인

**A차 후속 — 현저성 점수 재설계: 곱(AND) → noisy-OR (2026-08-12)**

실계좌에서 **중요도 역전** 관찰: 유유제약(미실현 -14.75%, 12일 전 '기타' 공시 1건) 0.0431 **1위** > 컴투스홀딩스(미실현 **-39.13%**, 비중 **63%**, 공시 없음) 0.0245. 원인은 disc 상수가 아니라 **집계 형태** — `Π(0.1+0.9·c)`는 논리곱(균형) 의미론이고 floor 0.1이 "컴포넌트 0→최대 = 10배 스윙"을 만들어, 잡공시 하나가 심각한 손실을 눌렀다. 트리아지가 원하는 건 정반대인 **논리합**("어느 하나만 강해도 상단").

- [x] **[AT-1]** `score = 1 − Π(1 − w_k·c_k)` (noisy-OR). 컴포넌트 정의(캡·decay)는 **불변**, 집계부만 교체. 가중치 `w = {unrl .85, stake .70, move .45, disc .25}` — c=1인 단일 축이 보장하는 최소 점수(provisional)
- [x] **[AT-2]** 공시 **카테고리 가중** — `other` 0.4 / `earnings` 0.8 / material(증자·감자·배당·자사주·구조변경·해명·주요사항) 1.0. `facts.summarizeDisclosures`가 건별 `events:[{category,daysAgo}]`를 넘기고 정책은 score.js가 소유. 가중이 전부 1이면 옛 공식과 **정확히 동일**(일반화이지 다른 계산 아님, 테스트로 고정). 유유제약 disc 0.144 → **0.058**
- [x] **[AT-3]** `scoreFloor` 0.006 → **0.15** (분포가 [0,0.05]→[0,0.96]으로 이동)
- **판단 — `watchlistBaseline` 0.3 폐기 (지시문 "불변" 지시에서 이탈, 보고 완료)**: 곱에서 baseline은 **감점**(0.37배)이었지만 OR에서는 **가점**이라 부호가 뒤집힌다. 그대로 두면 아무 일 없는 관심 종목이 `1−(1−.85×.3)(1−.70×.3)` = **0.411** — 실제 사건(잡공시 단독 0.014)의 27배로 상위 K를 잠식한다. OR에서 "증거 없음"은 0이어야 한다(R1 "모르는 것을 점수로 만들지 않는다"와 동일 원칙). 결과적으로 관심 문턱 ≈±5%로 옛 ±5.7%와 연속
- **판단 — 크기 게이팅 (A) 유지**: 소액(비중 1%) 큰 변동의 상위 진입을 허용. 포트폴리오 상대값 재정의(B)는 관찰 후 후속
- ⚠️ **성질 변화(의도)**: `w_stake` 단독 진입 때문에 **비중 6.4%↑ 보유는 조용해도 노출**된다(곱 시절엔 컷). 문턱을 테스트로 고정 — 조이려면 `scoreFloor`↑ 또는 `w_stake`↓인데 둘 다 관심 문턱을 함께 밀어 올린다
- 재정렬 결과: 컴투스홀딩스 **0.958(1위)** · 딥노이드 0.882(2위) · 유유제약 0.849(3위)
- 검증: node --check · tsc 0 · next build ✓ · **npm test 248**(+14, attention 54) · 금지어 스윕 불변(interpret.ts 미변경) · 합성 픽스처로 "공시 다발 상위 독점" 재발 확인

---

**B차 — 포지션 앵커 해석 (탈앵커 시장 맥락, 2026-08-12)**

평단 대비 손익은 사용자가 **이미 보고 있다**(DetailHeader "수익률 X% (매수가 ₩…)") — 다시 풀어주는 건 한계효용 0 + 상처 재확인이고, 무엇보다 이 앱은 `journal/biases/anchoring.js`에서 **평단 집착을 편향으로 관찰**한다. 평단을 해석의 중심에 놓으면 종목상세가 그 편향을 강화하는 자기모순. 그래서 평단을 **시장 범위 안의 또 하나의 참고점**으로 상대화한다("얼마 잃었다" → "이 종목 지형은 이렇고 네 진입은 여기"). **신규 데이터·백엔드 0** — 기존 `priceContext.range` 재조립.

- [x] **[B-1]** `interpretPositionAnchor(range, avgPrice, currentPrice, held)` — 관점 key `positionAnchor`(라벨 '매수가'), tone 항상 neutral. 현재가 위치는 **서버 `range.positionPct`를 그대로**(StatsGrid 게이지·'변동' 관점과 SSOT), 평단 위치만 `pricePositionPct`로 0~100 클램프. 범위 밖 평단은 % 대신 "이 범위 위/아래로 벗어나 있어요"(클램프 값을 진짜 위치처럼 쓰지 않음). 탈앵커 문장: "매수가는 그때 산 가격일 뿐이고, 지금 이 종목의 위치는 시장이 정해요."
- [x] **[B-2]** `FORBIDDEN_POSITION` 신설 = DIRECTIVE + **본전·회복·만회·되돌리**(앵커링 강화 = 평단을 복귀 목표로 설정) + **싸다/비싸다/싼/비싼**(범위 위치 ≠ 가치) + 반등·상승/하락 흐름. `매수`는 '매수가' 정상 표기라 미차단, `매도`만 차단
- [x] **[B-3]** 종목상세 관점 패널 — `interpretPriceContext` 바로 뒤. 역할 분리: 변동=현재가만 / 매수가=거기에 내 진입점 오버레이. 비보유·평단없음·표본부족은 available:false로 자동 미표시
- [x] **[B-4]** 포트폴리오 보유 카드 축약 한 줄 `describePositionAnchorShort` — "52주 범위에서 지금은 아래쪽, 매수가는 위쪽에 있어요". 무채색
- [x] **[B-5]** `rangeSpanPhrase` 추출 — `interpretPriceContext`에 인라인이던 '최근 1년/N거래일' 삼항식. 같은 range 소비 표면이 늘수록 한쪽만 고쳐 라벨이 갈린다
- **판단 — `positionAnchor`는 관점 균형 집계에서 제외**(`BALANCE_EXCLUDED_KEYS`): 종목에 대한 관점이 아니라 **내 진입점에 대한 사실**이라, "관찰한 N개 관점" 안에 섞으면 집계 의미가 흐려진다. 패널에는 렌더되고 카운트에서만 빠짐
- ⚠️ **비용**: 포트폴리오 페이지엔 `range`가 없다(`/volatility`는 종목당 엔드포인트) → **보유 수만큼 호출**. 상한 8종목·silent 실패·코드별 1회(ref 캐시)로 제한. 벌크 엔드포인트가 생기면 한 번으로 접힌다
- 검증: tsc 0 · next build ✓ · **npm test 265**(+17) · `FORBIDDEN_POSITION` 전수 스윕(평단 범위밖/경계/현재가동일 × 표본 장단, 100+ 출력) 0 매칭 · SSOT 테스트(9개 위치값에서 게이지 단어 일치)
- **후속(범위 밖)**: 보유기간 축(첫 매수일~오늘)으로 앵커를 시간으로도 상대화 · D 성과 귀인

---

**D차 — 성과 귀인 / 종목별 기여 분해 (2026-08-12)**

"내 계좌가 왜 -28%인가"에 **출처의 사실**로 답한다(판정 아님). 사용자가 실제로 보는 그 숫자를 종목별로 쪼갠다. **신규 API·백엔드 0** — 보유 스토어 위 순수 클라이언트 계산. 재정렬 로드맵 C·A·B에 이어 마지막 항목.

- [x] **[D-1]** `lib/portfolio/attribution.ts`(신규 순수 모듈) — `contribPP_i = (현재가−평단)×수량 ÷ 총원금 × 100`. `|contribPP|` 내림차순(방향 아닌 크기), 동률은 코드 오름차순 고정. 문장은 상위 3종목 + '외 N종목'
- [x] **[D-2]** **SSOT — `computePortfolioTotals`를 대시보드 히어로와 공유**. 인라인 reduce 3줄을 이 함수로 교체해 `Σ contribPP === 히어로 손익률`이 구조적으로 보장된다(각자 계산하면 "히어로 -36%인데 합계 -35%"가 되고 그 순간 두 숫자 다 신뢰를 잃는다 — 52주=40행·positionAnchor 위치 재계산과 같은 계열). 부수 효과로 평단·수량·현재가 결측 행이 NaN을 퍼뜨리던 것도 제거
- [x] **[D-3]** `FORBIDDEN_ATTRIBUTION` = DIRECTIVE + **효자·발목·주범·애물단지·골칫**(종목 가치 판정 — `+` 기여도 칭찬하지 않는다, 대칭이어야 판정이 아님) + 회복·만회·본전·되돌리(앵커링, B 정합) + 잘한·잘못·실수(사후 판단)
- [x] **[D-4]** 대시보드 표출 — 히어로/KOSPI 라인 아래. 문장 + 상위 5행 기여 막대(초과분 '외 N종목') + `?` 도움말 + '임시 기준' 뱃지. **방향색은 막대·수치에만**, 종목명·라벨 무채색
- **판단 — 집중도를 순(net) 대비가 아니라 총 변동량(Σ\|기여\|) 대비로**: 지시문 초안 `|top| >= |전체 손익률| × 0.5`는 이익·손실이 상쇄돼 전체가 0에 수렴하면 **분모가 0이 되어 어떤 구성이든 집중으로 판정**된다(+300/-300도, +200/+100/-150/-150도). 총 변동량 기준이면 상쇄와 무관하게 "이 종목이 움직임의 몇 할인가"를 그대로 재고, 문장("전체 손익 변동의 절반 이상")이 계산과 정확히 일치한다. 임계 0.5는 provisional
- **판단 — 종목명 뒤 조사 회피**: `${name}이에요`는 받침 유무로 갈리는데 종목명은 영문·숫자로도 끝나(LG, KODEX 200) 발음 기준이라 규칙 판정이 불가능하다 → `${name}의 기여가 가장 커요`
- [x] **[D-5] 표시 반올림 정합 (최대잔차, 라이브 후속)** — 내부 계산은 `Σ === rate`로 정확한데(1e-9) 행마다 독립적으로 `toFixed(1)`을 하니 **화면상 합**이 0.1 어긋났다(라이브: `-24.4 -5.2 +0.4 +0.0 = -29.2`인데 문장은 `-29.1%`). 사용자에겐 "둘 중 하나는 거짓말"이다. → `Contribution.displayPP` 신설(tenths 단위 최대잔차 배분, 문장·막대가 **공유**). 원본 `contribPP`는 불변 — 정렬·집중도는 정밀값으로 판정한다(표시값으로 재판정하면 경계에서 뒤집힌다). 각 표시값은 실제값의 ±0.1 이내
  - `formatPP`/`formatRatePct` export — 문장과 막대 라벨이 **같은 포매터**를 쓴다. 각자 포맷하면 `-0.0%p`(음의 0)와 `+0.0%p`가 갈린다
  - 대시보드: 막대 라벨 `displayPP`(막대 **너비**는 정밀값 유지 — 비례 폭이라 반올림과 무관) · 도움말 `avgProfitRate.toFixed(2)` → `portfolioProfitRate.toFixed(1)`로 통일 · **'외 N종목' 행에 나머지 합 표기**(값 없이 이름만 두면 5행만 그리는 UI에서 보이는 열의 합이 다시 어긋난다)
  - **히어로도 1자리 통일** — 헤드라인만 2자리면 한 값이 헤드라인(-29.01%)과 본문(-29.0%)에서 다르게 찍혀 §11 취지가 되살아난다. `formatRatePct`로 교체(직접 `toFixed(1)`이면 `|손익률|<0.05%`에서 히어로만 `-0.0%`가 되어 문장 `0.0%`와 또 갈린다). 샤프·정보비율의 `toFixed(2)`는 포트 손익률이 아니라 **불변**
- 검증: tsc 0 · next build ✓ · **npm test 303**(+38) · 합산 정확성 4구성 `|Σ−rate| < 1e-9` · **표시 정합** `Σ round(displayPP×10) === round(rate×10)`(독립 반올림이면 실제로 어긋나는 구성 다수로 스윕 비공회전 확인) · `FORBIDDEN_ATTRIBUTION` 전수 스윕 0 매칭
- **부대**: `attention-score-redesign.md` untrack(`git rm --cached`) + 세션 지시문 3종 `.gitignore` — `git add -A`로 레포 루트 지시문이 딸려 커밋된 사고(3e5b946) 재발 차단
- **후속(범위 밖)**: 기여의 시간 분해(언제 벌어졌나, history 시계열) · 종목별 alpha/beta 요인 귀인(벤치마크 블록과 통합 검토 시)

---

**마감 묶음 — 벌크 볼래틸리티 · 인라인 렌즈 버킷 (2026-08-13)**

C·A·B·D 종결 직후 마감. **기존 데이터·기존 계산 재조립만** — 신규 수집원 필요한 항목(배당 렌즈·코포레이트 액션 분류·우선주/ETF 매핑)은 Phase 2로 분리.

- [x] **[F-1]** `GET /api/holdings/volatility` — 보유 전 종목 range를 **1요청**으로. 포트폴리오 카드의 '매수가 위치' 한 줄(B §5-2)이 종목당 `/stock/:code/volatility`를 부르던 것을 접었다. 종목별 창은 `ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC) <= 250`으로 잘라 **단건 엔드포인트와 정확히 같은 표본**을 쓴다(전역 날짜 목록으로 자르면 종목별 표본 수가 달라진다). `computePriceContext` 재사용 = 카드 range == 종목상세 == StatsGrid 게이지(SSOT). 위치를 못 구하는 표본은 `ranges`에서 생략
  - 프론트: `getHoldingsVolatility()` + `HoldingsVolatilityResult`. 보유 8종목 상한 폐지(요청 1회라 불필요), 의존성은 **보유 코드 집합**으로 — `holdings` 배열 참조는 가격 갱신마다 새로 생겨 그대로 걸면 range를 반복 조회한다(range는 종가 기준이라 장중 불변). silent 목록은 `url.includes('/volatility')`라 이미 커버
- [x] **[F-2]** `lib/screener/presets.ts` 신설 — `Preset`·`PRESETS`·`LENSES`·`presetMetric`을 `/screener` 페이지에서 추출한 **SSOT**. 두 화면이 각자 필터를 들면 "같은 렌즈인데 결과가 다른" 상태가 되고, **캐비엇이 갈리면 한쪽 화면에서만 중립 프레임이 빠진다**. `LENSES`도 여기 둔다 — 칩과 프리셋이 다른 파일이면 slug 오타가 '눌러도 아무 일 없는 칩'으로 조용히 남는다(테스트로 고정)
- [x] **[F-3]** "종목 탐색" 렌즈 **인라인 버킷** — 렌즈 클릭 시 `/screener`로 이탈하던 것을 같은 페이지 접이식 결과로. 스크리너와 **같은 preset 엔드포인트** 호출(신규 계산 0), 렌즈당 1회 로드·실패 silent·상위 5건 + '더 보기'. 캐비엇 존치, `자세히 →`로 딥링크 경로 병존
- **판단 — 렌즈 금지어 스윕에서 `caveat` 제외**: 캐비엇은 의도적으로 부정문이라("소외됐다고 무조건 좋은 종목이 아니에요") 판단어를 부분문자열로 훑으면 **경고문 자체를 금지어로 잡는다**. 스윕 대상은 사용자가 렌즈의 정체성으로 읽는 이름·설명·요약·칩 라벨 + 보조 지표 출력. 그레이엄 `upside` 재유입 방지는 별도 단언
- 검증: node --check · tsc 0 · next build ✓ · **npm test 312**(+9)

**[검증] CIS 폴백 커버리지 실측 (2026-08-13, 재적재 후)**

라이브 189종목 전수 프로브: `dart_financials` 보유 **117종목**, 그중 **손익 3계정 존재 117/117(손익 없는 종목 0)** · 성장 관점 available **117** · 현금 관점 배수형 **103**. 재적재 전 0건이던 유유제약(000220)도 매출 355억·영업이익 43억·`growth.available:true`(매출 YoY +8%)로 켜졌다.
- ⚠️ **"이전 대비 증가분"은 소급 측정 불가**: ① 재적재가 `ON CONFLICT DO UPDATE`로 이전 상태를 덮었고, ② `dart_financials`에 **`sj_div` 컬럼이 없어** 지시문의 `sj_div IN ('IS','CIS')` 쿼리는 실행 자체가 불가하다(저장 시 canonical id로 정규화하며 섹션 정보를 버린다). 어느 행이 CIS에서 왔는지 알려면 스키마에 `sj_div`를 추가해야 한다 — 지금 필요한 정보는 아니라 미실행
- 잔여 갭은 CIS가 아니라 **매핑**: 189 중 72종목이 `dart_financials` 자체가 없다(`dart_corp_codes` 미매핑 또는 sync 미포함). 커버리지를 더 올리려면 corpcodes 재동기화가 다음 레버

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
- **검증 파서 보정**(부트 샘플): 재무 계정 부분일치 오매칭(귀속·계속영업 하위라인)→정확일치+배제+PK first-wins / net_income IS·CIS 중복→손익 IS 한정(**2026-08-12 철회 — 아래 CIS 폴백**) / 공시 corp_code 필터 정상(삼성 월 778건은 실제 다발) → 적응형+블랙리스트 / rm 꼬리공백 trim
- **[DART-FIX] 손익 계정 CIS 폴백 (2026-08-12)**: IS 한정이 **단일 포괄손익계산서 보고 종목의 손익을 통째로 누락**시켰다(유유제약 000220 — 자산·부채·자본·현금흐름만, 손익 0건 → 성장 관점 미표시·현금 관점 배수 없음). `revenue`/`operating_income`/`net_income` sjDiv를 `['IS','CIS']`로 확장. 이중매칭은 3중 방어 — first-wins 디둡(pk에 sj_div 미포함) + **`orderBySection`(신설) IS 우선 안정정렬**(응답 순서에 정확도를 걸지 않음) + `NAME_EXCLUDE`·nameKeys 정확일치(기타포괄·총포괄·귀속 차단). 검증: `npm test` 234(+18) · tsc 0. **재적재는 운영자 수동** — `sync-dart-financials.js`만 재실행(corpcodes·disclosures 불요)
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
- [ ] **가격·거래량·투자자 매매동향**: KRX OpenAPI 전환 — CSV 응답 + 거래소 접두어 파싱 어댑터 레이어 선행 설계. **레퍼런스: korean-stock-search** (아래 §외부 스킬 자산화 판정 — 네이버 스크래핑 단일소스 리스크 대응책)
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

## 외부 스킬 자산화 판정 — NomaDamas/k-skill (2026-07-29)

레포: https://github.com/NomaDamas/k-skill (스킬 100+, 금융 6종 검토)

라이선스: 루트 MIT / proxy 디렉터리만 AGPL.
→ 코드 이식 전, 해당 스킬 디렉터리의 라이선스 헤더를 개별 확인할 것. 루트 MIT만 신뢰 금지.

공용 프록시(k-skill-proxy.nomadamas.org): SLA 없음 → 프로덕션 의존 절대 금지.
자산화 시 반드시 우리 키로 직접 호출한다.

판정:
- korean-stock-search (KRX Open API) — [전략적 이식·리스크 대응]
  네이버 스크래핑 단일소스 리스크(차단 시 서비스 중단, 미검증 리스크 1순위)의 대응책.
  신기능이 아니라 신뢰성/생존 대응으로 분류한다. Phase 6 본작업 시 종목 기본정보·일별시세
  엔드포인트·파싱 레퍼런스로 사용(프록시 아님, 우리 KRX 키 직접). 서비스 오픈 전
  신뢰성 체크리스트에 등재.

- bok-ecos-stats (한국은행 ECOS) — [홀드]
  생(raw) 매크로 스트립은 4.5c "데이터만 보여주고 해석 안 함" 안티패턴을 재현함.
  해석을 붙이면 거시→주식 인과 판단이 되어 판단어 금지·투자권유 회피 원칙과 충돌
  (개별 종목 밸류 해석보다 위험 영역). "안전하게 해석 가능한 매크로" 설계가 나오기
  전에는 착수 금지. 착수 시 4.5b 이후 소규모 차수(4.6)로 독립.

- k-dart (이벤트 확장) — [아이디어만]
  우리 4.5a는 공시목록·재무제표까지 보유. 배당/증자/CB/소송 corp_code 자동해석 및
  이벤트 타입 분류는 미보유 → [기업]탭 확장 백로그.

- daishin-report-search — [프로덕션 부적합]
  서드파티 GitHub 미러 지속성 불확실 + 리포트 저작권 리스크. "리포트 요약" 컨셉만
  향후 정식 소스(FnGuide 등) 확보 시 재검토.

- toss-securities — [홀드, Phase 5 이후]
  사용자별 OAuth(Client ID/Secret) 전제 → 현재 익명 device_id 모델과 상충.
  로그인 도입(Phase 5) 이후 실시간 호가·계좌연동 재평가.

- kosis-stats — [낮음]
  인구·물가·고용 통계. 주식앱과 거리 멂.

개발 레버리지(앱 런타임 무관): k-skill을 Claude Code 플러그인으로 설치해
DART 파서 정합성 대조·KRX 데이터 크로스체크에 활용
(`/plugin marketplace add NomaDamas/k-skill`, 운영자 실행).

---

## 문서 참조

| 파일 | 내용 |
|------|------|
| `docs/BACKEND.md` | 백엔드 상세 (DB 스키마 18테이블, API 44개, 알고리즘, 스케줄링) |
| `docs/FRONTEND.md` | 프론트엔드 상세 (페이지별 스펙, 컴포넌트, 스토어 인터페이스) |
| `docs/FRONTEND_UX.md` | UX 원칙 (온보딩, 면책, 디자인 시스템, 초보자 안내) |
| `docs/NEXTJS.md` | Next.js 전환 상세 (Server/Client 경계, ISR 패턴, 라우팅) |
| `docs/DESIGN.md` | 디자인 시스템 SSOT (3.13차 라이트 + 한국 증시 색 토큰) |
| `docs/DEPLOY.md` | 배포 체크리스트 (Render/Vercel 환경변수, 순서, cold start) |
| `docs/SKILL_KOREAN_STOCK_APP.md` | 도메인 지식 (주식 지표, 섹터별 특성, 면책 표현) |
