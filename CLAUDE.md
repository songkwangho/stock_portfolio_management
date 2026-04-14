# Stock Analyzer — Claude Code 개발 가이드 (Next.js 재개발판)

## 프로젝트 개요

한국 주식 분석 및 포트폴리오 관리 웹앱. 웹앱 전용(Capacitor 없음).
공식 데이터 API + 보조 스크래핑 기반으로 기술적 분석, 종목 추천, 포트폴리오 수익률 추적을 제공한다.
초기에는 기기별 익명 식별자(device_id)로 개인 데이터를 분리하고, Phase 5에서 소셜 로그인으로 전환한다.

**대상**: 한국 주식 투자 초보자 — 전문 용어에 익숙하지 않은 일반 사용자.

---

## 기술 스택

### 프론트엔드
- **프레임워크**: Next.js 15 (App Router)
- **언어**: TypeScript
- **스타일**: Tailwind CSS v4
- **차트**: Recharts v3 (`'use client'` 격리) + lightweight-charts (캔들차트, `dynamic ssr:false`)
- **상태관리**: Zustand v5 (도메인별, `'use client'` 내부에서만)
- **HTTP**: Axios (`NEXT_PUBLIC_API_BASE_URL`)

### 백엔드
- **서버**: Node.js + Express (별도 프로세스, 재개발 미대상)
- **DB**: PostgreSQL (Neon), `pg` Pool
- **데이터**: 네이버 증권 스크래핑 → 장기: KRX/KIS API 전환

### 배포
- **프론트**: Vercel (Next.js)
- **API**: Render Web Service Starter ($7/월)
- **DB**: Neon PostgreSQL (무료)

---

## 프로젝트 구조

```
stock-app/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 루트 레이아웃 (사이드바 + 헬스 게이트)
│   ├── page.tsx                  # / → /dashboard redirect
│   ├── dashboard/
│   │   └── page.tsx
│   ├── portfolio/
│   │   └── page.tsx
│   ├── recommendations/
│   │   └── page.tsx
│   ├── watchlist/
│   │   └── page.tsx              # PC 전용
│   ├── screener/
│   │   └── page.tsx              # PC 전용
│   ├── stocks/
│   │   └── page.tsx              # MajorStocksPage
│   ├── stock/
│   │   └── [code]/
│   │       └── page.tsx          # StockDetailPage (ISR)
│   └── settings/
│       └── page.tsx
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx           # PC 사이드바 ('use client')
│   │   ├── MobileTabBar.tsx      # 모바일 하단 탭바 ('use client')
│   │   └── HealthGate.tsx        # 서버 연결 스플래시 ('use client')
│   ├── charts/                   # 차트 — 전부 'use client'
│   │   ├── PortfolioChart.tsx    # ComposedChart (수익률 추이)
│   │   ├── AssetPieChart.tsx     # PieChart (자산배분)
│   │   ├── VolumeBarChart.tsx    # BarChart (거래량)
│   │   ├── InvestorBarChart.tsx  # BarChart (투자자 동향)
│   │   └── CandleChart.tsx       # lightweight-charts, dynamic ssr:false
│   ├── stock/
│   │   ├── ScoringBreakdownPanel.tsx
│   │   ├── StockSearchInput.tsx
│   │   └── RecommendedStockCard.tsx
│   ├── portfolio/
│   │   └── WatchlistContent.tsx
│   └── ui/
│       ├── ErrorBanner.tsx       # autoRetryMs 지원
│       ├── HelpBottomSheet.tsx   # 8개 용어
│       ├── StatCard.tsx
│       └── NavButton.tsx
│
├── stores/                       # Zustand ('use client' 내부에서만 import)
│   ├── usePortfolioStore.ts
│   ├── useAlertStore.ts
│   ├── useWatchlistStore.ts
│   └── useToastStore.ts
│
├── lib/
│   ├── stockApi.ts               # Axios API 클라이언트
│   ├── deviceId.ts               # DeviceIdStorage 인터페이스 + Web 구현
│   └── dataFreshness.ts          # parseServerDate / getDataFreshnessLabel
│
├── types/
│   └── stock.ts                  # MarketOpinion / HoldingOpinion / 전체 인터페이스
│
└── server/                       # Express 백엔드 (기존 코드 그대로)
    └── (기존 server/ 구조 유지)
```

---

## 핵심 아키텍처 원칙

### Server Component vs Client Component 경계

```
Server Component (기본):
  - app/stock/[code]/page.tsx      → ISR로 종목 기본 정보 fetch
  - app/stocks/page.tsx            → ISR로 97종목 목록 fetch
  - app/recommendations/page.tsx   → ISR로 추천 목록 fetch
  - app/layout.tsx                 → 공통 레이아웃 (정적)

'use client' 필수:
  - 모든 차트 컴포넌트 (Recharts window 참조)
  - Zustand 스토어를 사용하는 모든 컴포넌트
  - device_id에 의존하는 포트폴리오/알림/관심종목
  - HealthGate, Sidebar, MobileTabBar (상태 있음)
```

### ISR 설정 기준

```typescript
// 종목 목록, 추천 — 하루 1회 스크래핑과 주기 일치
export const revalidate = 86400; // 24h

// 종목 상세 — 기본 정보는 ISR, 실시간 체결가는 CSR에서 별도 fetch
export const revalidate = 86400;

// 개인 데이터 페이지 — ISR 없음, 전부 CSR
// DashboardPage, PortfolioPage, AlertPage
```

### 라우팅 구조

```
/                    → redirect to /dashboard
/dashboard           → 포트폴리오 요약, 수익률 추이 (CSR)
/portfolio           → 보유종목 관리 (CSR)
/recommendations     → 추천 종목 (ISR 24h)
/watchlist           → 관심종목 (CSR, PC 전용)
/screener            → 종목 스크리너 (CSR, PC 전용)
/stocks              → 주요 종목 현황 (ISR 24h)
/stock/[code]        → 종목 상세 (ISR 24h + CSR 실시간가)
/settings            → 설정
```

모바일에서 `/watchlist`, `/screener`는 사이드바 전용.
모바일 탭바 5개: 대시보드 / 포트폴리오 / 추천 / 알림 / 설정.

---

## 개발 명령어

```bash
# 프론트엔드 (Next.js)
npm run dev              # 포트 3000

# 백엔드 (Express, 기존 그대로)
DATABASE_URL=postgres://... node server/server.js  # 포트 3001

# 빌드
npm run build
npm run start
```

### 환경변수

```bash
# .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api

# Vercel 배포 시
NEXT_PUBLIC_API_BASE_URL=https://your-render-api.onrender.com/api
```

---

## 코드 작성 규칙

### 기본
- 한국어 UI 텍스트, 영어 코드/변수명
- Tailwind 다크 테마 (slate + blue)
- API는 `lib/stockApi.ts`를 통해서만 호출
- 상태는 도메인별 Zustand 스토어 (반드시 `'use client'` 내부에서만)

### 'use client' 격리 패턴

```typescript
// app/stocks/page.tsx — Server Component (ISR)
import { StockGrid } from '@/components/stock/StockGrid'; // 'use client'

export const revalidate = 86400;

export default async function StocksPage() {
  const stocks = await fetch(`${process.env.API_BASE_URL}/api/stocks`).then(r => r.json());
  return <StockGrid initialData={stocks} />; // 초기 데이터 props로 전달
}

// components/stock/StockGrid.tsx
'use client';
// Zustand, 이벤트 핸들러, 차트 등 클라이언트 전용
```

### 차트 컴포넌트 패턴

```typescript
// components/charts/CandleChart.tsx
'use client';
import dynamic from 'next/dynamic';

const LightweightChart = dynamic(
  () => import('./LightweightChartCore'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

// components/charts/PortfolioChart.tsx
'use client';
import { ComposedChart, Area, Line, ... } from 'recharts';
// 기존 DashboardPage 차트 로직 그대로
```

### device_id

```typescript
// lib/deviceId.ts — 기존 코드 그대로
interface DeviceIdStorage {
  get(): string | null;
  set(id: string): void;
}
class WebDeviceIdStorage implements DeviceIdStorage { ... }

// lib/stockApi.ts — Axios 인터셉터
axios.interceptors.request.use((config) => {
  config.headers['X-Device-Id'] = getDeviceId();
  return config;
});
```

---

## Opinion 분리 (기존과 동일)

```typescript
type MarketOpinion  = '긍정적' | '중립적' | '부정적';  // DB 저장, 공용
type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';  // 런타임 계산

// UI 표시 라벨 소프트화 (내부 값은 유지)
// '매도' → '주의 필요'
// '추가매수' → '추가 검토'
```

---

## 반응형 레이아웃

```
PC (md: 이상):
  좌측 고정 사이드바 (w-68) + 우측 메인
  사이드바 메뉴: 대시보드 / 포트폴리오 / 추천 / 관심종목 / 스크리너 / 주요종목 / 설정

모바일 (md: 미만):
  사이드바 숨김 + 하단 탭바 5개 (fixed bottom-0)
  탭: 대시보드 / 포트폴리오 / 추천 / 알림(뱃지) / 설정
  관심종목·스크리너·주요종목은 각 페이지 내 링크 또는 포트폴리오 탭 내 서브탭
```

---

## 분석 알고리즘 요약 (백엔드, 변경 없음)

### HoldingOpinion (런타임, `calculateHoldingOpinion`)
1. 손절(-7%) → 매도
2. SMA5 null → 보유 (판단 불가)
3. 이중 이탈(SMA5+SMA20 아래) → 매도
4. 단기이탈+중기지지 → 관망
5. SMA20 null → SMA5만으로 판단
6. 5일선 근접(100~101%) → 추가매수
7. 정배열 → 보유

### MarketOpinion (10점, DB 저장)
- 밸류에이션 0~3: PER/PBR 섹터 중앙값 + PEG
- 기술지표 0~3: RSI(30%) + MACD(25%) + 볼린저(20%) + 거래량(25%)
- 수급 0~2: 외국인(max 1.2) + 기관(max 0.8), 10일 감쇠(decay=0.8)
- 추세 0~2: SMA5/SMA20 배열
- ≥7 긍정적, ≥4 중립적, <4 부정적 (임시 임계값 — Phase 4 백테스팅 후 최적화)

---

## 로드맵

### Phase 3 — Next.js 재개발 + 배포 (현재, 1차 이전 완료 · 2026-04-14)

**완료**
- [x] Next.js 15.3 + React 19 + Tailwind v4 App Router 초기화 (`package.json`, `tsconfig`, `postcss`)
- [x] 라우팅 구조 구축: `/dashboard`, `/portfolio`, `/recommendations`, `/watchlist`, `/screener`, `/stocks`, `/settings`, `/stock/[code]`, `/alerts`
- [x] 공유 모듈 이전 (`types/stock.ts`, `lib/deviceId.ts` SSR-safe, `lib/stockApi.ts` 클라이언트 격리, `lib/dataFreshness.ts`)
- [x] Zustand 스토어 이전 (`usePortfolioStore`, `useAlertStore`, `useWatchlistStore`, `useToastStore`)
- [x] 레이아웃 셸 (`AppShell` + `HealthGate` + `Sidebar` + `MobileTabBar` + `HeaderBar` + `DisclaimerModal` + `ToastHost`)
- [x] 리프 컴포넌트 이전 (`ErrorBanner`, `StatCard`, `NavButton`, `HelpBottomSheet`, `StockSearchInput`, `RecommendedStockCard`, `ScoringBreakdownPanel`, `WatchlistContent`)
- [x] 기존 페이지 이전 (DashboardPage · HoldingsAnalysisPage → `/portfolio` · RecommendationsPage · WatchlistPage · ScreenerPage · MajorStocksPage → `/stocks` · SettingsPage · StockDetailView → `/stock/[code]`)
- [x] Recharts 컴포넌트 `'use client'` 격리 (페이지 내부 인라인)
- [x] 개발 서버 기동 확인 (`next dev --turbopack`, HTTP 200)
- [x] GitHub 배포 (`origin/main` 푸시)

**미완료 (Phase 3 잔여 과제)**
- [ ] Server Component + ISR 설정 — 현재 모든 페이지가 `'use client'` CSR. `revalidate = 86400` 적용 대상: `/stocks`, `/recommendations`, `/stock/[code]` 기본 정보
- [ ] 차트 컴포넌트 분리 — `components/charts/` 디렉터리로 분리 (PortfolioChart, AssetPieChart, VolumeBarChart, InvestorBarChart). 현재는 페이지 인라인
- [ ] lightweight-charts 캔들차트 도입 (`CandleChart.tsx`, `dynamic ssr:false`) — 현재 캔들은 Recharts `CandlestickBar` 커스텀 shape 사용
- [ ] TypeScript 엄격 모드 통과 — `next.config.ts`의 `typescript.ignoreBuildErrors` / `eslint.ignoreDuringBuilds` 제거. Recharts v3 Tooltip formatter 타입 등 정리
- [ ] 프로덕션 빌드 통과 — 현재 로컬 Windows + Node 24 환경에서 `next build` 페이지 데이터 수집 단계 `readlink EISDIR` 이슈. pnpm 전환 또는 Node LTS(20/22) 검증 필요
- [ ] Vercel + Render 배포
- [ ] SQLite → Neon 데이터 마이그레이션
- [ ] backfill-history 실행 (97종목 × 3년)
- [ ] 백엔드 기동 상태에서 전체 페이지 E2E 수동 검증 (포트폴리오 CRUD, 추천, 스크리너, 종목상세, 알림)

**보완 과제 (재이전 과정에서 신규 도출)**
- [ ] 온보딩 2단계 플로우 (`onboarding_step` 1/2) 복구 — Phase 3 1차 이전 시 `DisclaimerModal`만 이전, 2단계 온보딩 모달은 생략됨
- [ ] 알림 최초 진입 가이드 카드 (`onboarding_alerts_explained`) 복구 — `HeaderBar`에서 누락
- [ ] `HoldingsAnalysisPage`의 `pendingFocus` 처리 (`add-holding-search`, `first-stock-guide`) — `useNavigationStore.consumePendingFocus` 제거에 따라 대체 수단 필요 (searchParams `?focus=...` 등)
- [ ] `useNavigationStore` 폐기에 따른 `selectedStock` 카테고리 컨텍스트 보존 방식 결정 — 현재 `/stock/[code]`는 URL code만 받아 `usePortfolioStore`로 보유 여부를 추론
- [ ] 모바일 탭바의 `/alerts` 독립 페이지 ↔ 헤더 알림 드롭다운 UX 일원화 (현재는 두 곳 모두 존재)
- [ ] 검색 드롭다운 빈 결과 CTA의 "종목코드로 추가" 이동 대상 재정의 (기존 settings 내 해당 기능 확인 필요)

- 목표 사용자: **50명**

### Phase 4 — 데이터 누적 + 백테스팅 (Phase 3과 병행)
- [ ] 스코어 임계값 백테스팅 (7/4점 → 데이터 기반)
- [ ] 섹터별 스코어링 가중치 (바이오·금융 우선)
- 목표: 임계값 실증 검증

### Phase 5 — 소셜 로그인 + 구독 (50명 달성 후)
- [ ] Kakao OAuth (3~4일) + Google OAuth (+1~2일)
- [ ] device_id → user_id B안 병합 (UX 단절 없음)
- [ ] JWT (`Authorization: Bearer`, 1h + 14일 refresh)
- [ ] Next.js middleware로 보호 라우트 처리
- [ ] Toss Payments 구독 (월 9,900원)
- [ ] Claude Haiku AI 분석 리포트 (종목별 일 1회 캐시 + 월 10회 개인)
- 목표 사용자: **200명**

### Phase 6 — 데이터 소스 안정화 (Phase 5 이후)
- [ ] KRX REST API로 네이버 스크래핑 대체
- [ ] Vercel 단일 배포 검토 (Express → Route Handlers 점진 이전)
- 목표: 스크래핑 의존도 제거

### Phase 7 — 실시간 분석 (구독자 100명+)
- [ ] KIS WebSocket API (장중 1분봉)
- [ ] FastAPI 실시간 파이프라인 서버 (상시 실행, 유료 서버)
- [ ] SSE 알림 즉시 푸시
- [ ] 실시간 기능 프리미엄 전용 포지셔닝

### Phase 8 — AI 실시간 분석 (장기)
- [ ] Claude Haiku 실시간 패턴 감지
- [ ] 상업 데이터 제공사 검토 (FnGuide 등)

---

## Phase 3 재개발 — 원계획 대비 변경점

원 계획(본 문서 상단 "프로젝트 구조", "핵심 아키텍처 원칙")과 달라진 부분만 기록. 후속 패스에서 조정할지 여부를 판단할 때 이 섹션을 우선 참조.

### 1. Server Component / ISR 유보
- **원 계획**: `/stocks`, `/recommendations`, `/stock/[code]` 기본 정보를 Server Component + `revalidate = 86400` ISR로 구성.
- **현 상태**: 전체 페이지가 `'use client'` CSR. 개인 데이터(`/dashboard`, `/portfolio`, `/settings`)뿐 아니라 공용 데이터 페이지도 기존 Vite 구현을 가능한 그대로 옮기는 것을 우선시함.
- **사유**: 기존 페이지가 `useEffect` 기반 fetch와 Zustand를 깊게 전제로 작성되어 Server Component로 쪼개면 일괄 이전이 어려움. 1차 작동 확보 후 분리가 비용 대비 효과가 더 큼.
- **후속**: Phase 3 잔여 과제 "Server Component + ISR 설정"에서 처리.

### 2. 차트 컴포넌트 디렉터리 분리 미적용
- **원 계획**: `components/charts/PortfolioChart.tsx`, `AssetPieChart.tsx`, `VolumeBarChart.tsx`, `InvestorBarChart.tsx`, `CandleChart.tsx`로 분리. 캔들은 lightweight-charts + `dynamic ssr:false`.
- **현 상태**: 각 페이지 내부에 Recharts를 인라인 import. 캔들은 Recharts 기반 커스텀 `CandlestickBar` shape 그대로.
- **사유**: 인라인 유지가 기존 동작과 1:1 대응되어 회귀 위험이 최소. 분리는 별도 리팩터링 단계로 분리.
- **후속**: Phase 3 잔여 과제 "차트 컴포넌트 분리" / "lightweight-charts 도입".

### 3. `components/layout/` 구성 차이
- **원 계획**: `Sidebar`, `MobileTabBar`, `HealthGate` 3종.
- **현 상태**: 위 3종 + `AppShell`(컴포지션 컨테이너), `HeaderBar`(검색·알림·시장지수·프로필), `DisclaimerModal`, `ToastHost`를 추가 분리. 기존 App.tsx의 헤더·토스트·면책 모달 책임을 `AppShell` 하위로 옮김.
- **사유**: App Router에서 `layout.tsx`가 Server Component이므로 상태를 가진 셸을 별도 Client Component로 떼어내는 편이 안전. 또한 부분별 파일 분리가 1차 이전 이후 유지보수에 유리.
- **후속**: 구조 굳혀서 docs/NEXTJS.md에 반영 필요.

### 4. `components/ui/NavButton.tsx` 위치 변경
- **원 계획**: `components/ui/NavButton.tsx`.
- **현 상태**: 동일 위치로 이전 (변경 없음). 단 사이드바/모바일탭바 내부 메뉴 선언은 `Sidebar.tsx` / `MobileTabBar.tsx`로 이동(원 App.tsx 인라인에서 분리).

### 5. 라우팅 기반 내비게이션으로 전환 — `useNavigationStore` 제거
- **원 계획**: "기존 Zustand 스토어 이전 (코드 변경 없음)".
- **현 상태**: `useNavigationStore`는 제거. App Router의 `useRouter().push()` / `usePathname()`로 대체. `handleDetailClick(stock)` → `router.push('/stock/<code>')`.
- **사유**: Next.js 라우팅과 중복되는 탭 상태 머신을 유지할 필요 없음.
- **부작용**: `consumePendingFocus`(온보딩 플로우에서 포트폴리오 페이지의 자동 폼 노출, 첫 종목 가이드 카드 트리거)가 사라짐. Phase 3 "보완 과제"에서 searchParams 기반으로 대체 예정.

### 6. `/stock/[code]` 페이지의 stock 컨텍스트 복원 방식
- **원 계획**: 상세 페이지가 부모로부터 `stock: StockSummary` prop을 받음(카테고리=`'보유 종목'` / `'주요 종목'` 등 포함).
- **현 상태**: URL param `code`만 받아 `usePortfolioStore.holdings`에서 보유 여부·메타를 역조회. 보유가 아닌 경우 `{ code, name: code, category: '' }` 로 시작한 뒤 서버 응답으로 덮어씀.
- **부작용**: "추천에서 진입했는지 / 보유 종목에서 진입했는지"가 URL에 표현되지 않음. 현재 로직은 `isHolding` 판정에만 사용되므로 큰 문제 없으나, 추천 분석 우대 동작이 있다면 `searchParams`(`?from=recommendations`)로 확장 필요.

### 7. 헤더 알림 드롭다운과 `/alerts` 페이지 병존
- **원 계획**: 모바일 탭바 5개 중 "알림"은 드롭다운(`handleToggleAlerts`) 또는 전체 화면 모달.
- **현 상태**: 모바일 탭바는 독립된 `/alerts` 라우트로 이동시키되, PC 헤더의 드롭다운은 유지. 결과적으로 두 진입점이 공존.
- **후속**: 하나로 일원화할지, 두 진입점을 의도적 유지할지 결정 필요("보완 과제" 참조).

### 8. 검색 시장지수의 데스크톱 한정 노출
- **원 계획**: 헤더 좌측에 시장지수(KOSPI/KOSDAQ 등) 노출.
- **현 상태**: `HeaderBar`에서 시장지수를 `hidden md:flex`로 PC 전용화. 모바일은 검색창만 표시하여 헤더 과밀 해소.
- **사유**: 모바일 헤더 폭 한계. 필요 시 모바일 대시보드 상단으로 이동 고려.

### 9. 빌드 스크립트 Turbopack 기본 사용
- **원 계획**: 명시 없음(기본 `next build`).
- **현 상태**: `package.json` 스크립트를 `next dev --turbopack` / `next build --turbopack`로 지정.
- **사유**: 현 개발 환경(Windows + Node 24 + npm)에서 기본 webpack 빌드가 `readlink EISDIR`로 실패. Turbopack 컴파일은 정상.
- **후속**: pnpm 전환이나 Node LTS 환경에서 webpack 빌드 재검증 후 필요 시 플래그 제거.

### 10. 임시 타입·Lint 우회
- **원 계획**: 명시 없음(기본 엄격).
- **현 상태**: `next.config.ts`에서 `typescript.ignoreBuildErrors: true`, `eslint.ignoreDuringBuilds: true`로 설정.
- **사유**: 1차 대량 이전에서 누적된 Recharts v3 타입 엄격화 등 주변 타입 오류가 빌드를 차단. 코드 회귀 위험을 낮추기 위해 일시 허용.
- **후속**: Phase 3 잔여 과제 "TypeScript 엄격 모드 통과"에서 제거.

---

## 문서 참조

| 파일 | 내용 |
|------|------|
| `docs/BACKEND.md` | 백엔드 상세 (DB 스키마, API 28개, 알고리즘, 스케줄링) |
| `docs/FRONTEND.md` | 프론트엔드 상세 (페이지별 스펙, 컴포넌트, 스토어 인터페이스) |
| `docs/FRONTEND_UX.md` | UX 원칙 (온보딩, 면책, 디자인 시스템, 초보자 안내) |
| `docs/NEXTJS.md` | Next.js 전환 상세 (Server/Client 경계, ISR 패턴, 라우팅) |
| `docs/SKILL_KOREAN_STOCK_APP.md` | 도메인 지식 (주식 지표, 섹터별 특성, 면책 표현) |
