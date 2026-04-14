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

### Phase 3 — Next.js 재개발 + 배포 (현재)

**1차 이전 완료 (2026-04-14)**
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

**2차 — UX 복구 완료 (Sprint 2, 2026-04-14)**
- [x] **[H3]** 알림 진입점 일원화 — 헤더 드롭다운 제거, 아이콘 클릭 시 `/alerts` 라우팅 (모바일/PC 통일 · Phase 5 middleware 친화) — `components/layout/HeaderBar.tsx`
- [x] **[H1/H2]** 온보딩 2단계 플로우 + pendingFocus 대체 — searchParams 기반 (`/portfolio?focus=add-holding`, `/portfolio?focus=first-stock-guide`) — `components/layout/DisclaimerModal.tsx`, `app/portfolio/page.tsx`
- [x] **[H4]** `/stock/[code]` 컨텍스트 손실 완화 — `?from=holding|recommendation|watchlist|major|search|alerts` searchParams + 즉시 카테고리 뱃지 — `app/stock/[code]/page.tsx` 및 모든 호출처
- [x] **[UX1]** 온보딩 목적 재설계 — "어떻게 사용하실 건가요?" 3갈래 분기 (보유 관리 / 종목 찾기 / 공부 시작) — `DisclaimerModal` purpose step
- [x] **[UX2]** 대시보드 빈 상태 3-CTA 카드 (내 주식 관리 / 살 종목 찾기 / 주식 공부) — `app/dashboard/page.tsx`
- [x] **[UX5]** 알림 메시지 초보자 친화 리라이트 — `/alerts`에서 5개 type별 description 치환 (sell_signal · sma5_break · sma5_touch · target_near · undervalued) — `app/alerts/page.tsx`
- [x] **[UX6]** "분석 중" 뱃지 D+N 안내 — `last_updated` 기준 경과일 + 5영업일 누적 안내 — `app/portfolio/page.tsx`
- [x] **[UX7]** `RecommendedStockCard` reason 항상 노출 (line-clamp-2)

**3차 — 배포 전 필수 (Sprint 1, ~3일, 외부 리뷰 반영)**
- [ ] **[C0]** 백엔드 경로 일원화 결정 — 현재 `server/`와 `scripts/backfill-history.js`는 **원본 `C:\Users\aistudio\Documents\stock_app_dev\`에만 존재**. 신규 디렉터리로 이식할지, 원본 경로에서 그대로 돌릴지 결정 필요. Render 배포 단위·레포 단일화를 고려하면 이식 권장
- [ ] **[C1]** TypeScript 엄격 모드 복원 — `tsc --noEmit`로 오류 목록 확보 → Recharts `Tooltip.formatter` `ContentType` 캐스팅 등 수정 → `next.config.ts`의 `ignoreBuildErrors` / `eslint.ignoreDuringBuilds` 제거
- [ ] **[C2]** Vercel 빌드 검증 — 로컬 Windows+Node24의 `readlink EISDIR`과 무관. git push 후 Vercel 대시보드 로그 확인이 단일 신뢰 경로
- [ ] **[C3]** Neon 마이그레이션 + backfill-history 선행
  - `DATABASE_URL` 설정 후 `server/db/migrate.js`
  - SQLite(`stocks.db`) 덤프 → Neon 적재 스크립트 작성·실행
  - backfill-history 97종목 × 3년 배치 3개씩 (~6시간 예상)
  - 완료 검증 스크립트: `stock_history` 레코드 수 = 97 × (영업일 × 3년) ± 허용 오차
- [ ] Vercel(프론트) + Render(API) 배포
- [ ] 백엔드 기동 상태에서 전체 페이지 E2E 수동 검증 (포트폴리오 CRUD, 추천, 스크리너, 종목상세, 알림, 온보딩 3갈래)

**4차 — 성능 최적화 (Sprint 3, ~2일, 배포 후 가능)**
- [ ] **[M1]** 차트 `components/charts/` 분리 + `dynamic ssr:false` 공유 청크화 (Recharts 1회 로드)
- [ ] **[M3]** ISR 적용 — `/stocks`, `/recommendations` 우선. `/stock/[code]`는 `generateStaticParams`(97종목) 빌드 시간 영향 고려해 마지막
- [ ] **[M4]** 모바일 대시보드 상단 KOSPI/KOSDAQ 노출 (헤더 공간 부족 대체)
- [ ] **[M2]** 캔들차트 lightweight-charts 전환 — 별도 차수 (성능·확대축소 인터랙션 개선)

**5차 — 후속 UX 개선 (Sprint 4, 배포 후)**
- [ ] **[UX3]** `/stock/[code]` 탭 구조 ([요약] [차트] [분석] [기업]) — 정보 과부하 해소
- [ ] **[UX4]** 수익/손실 숫자 맥락 제공 (KOSPI 동기간 비교 또는 6구간 메시지 포트폴리오 카드 적용)
- [ ] 검색 드롭다운 빈 결과 "종목코드로 추가" 이동 대상 재정의

- 목표 사용자: **50명**

### Phase 4 — 데이터 누적 + 백테스팅 (원계획 조정)
- [ ] 스코어 임계값 백테스팅 (7/4점 → 데이터 기반)
- [ ] 섹터별 스코어링 가중치 (바이오·금융 우선)
- [ ] backfill 완료 검증 스크립트 (`stock_history` 레코드 수 기준)
- **조정**: Phase 3 배포 즉시 병행이 아닌, **backfill 완료 + 최소 2개월 실서비스 데이터 누적 후** 시작. 그 이전의 백테스팅은 표본 부족
- 목표: 임계값 실증 검증

### Phase 5 — 소셜 로그인 + 구독 (50명 달성 후)
- [ ] **Google OAuth 먼저** (즉시 활성화, 1~2일) — Kakao 심사 대기(영업일 3~7일) 블로킹 회피
- [ ] Kakao OAuth 심사 병행 신청 → 승인 후 추가 연동
- [ ] device_id → user_id B안 병합 + **"이 기기의 기존 데이터를 내 계정으로 가져올까요? [예/아니요]" 확인 UI** (동일 기기 다계정 로그인 시 데이터 중복/혼재 방지)
- [ ] JWT (`Authorization: Bearer`, 1h + 14일 refresh)
- [ ] Next.js middleware로 보호 라우트 처리
- [ ] 구독 DB 스키마 설계 (상태·만료·환불 이력)
- [ ] Toss Payments 구독 (월 9,900원) — 웹훅 처리, 만료 처리, 이용약관
- [ ] Claude Haiku AI 분석 리포트 (종목별 일 1회 캐시 + 월 10회 개인)
- **조정**: 구현 순서는 **Google OAuth → 구독 DB → Toss → Haiku** 순차. 동시 병행 시 3~4주 초과 위험
- 목표 사용자: **200명**

### Phase 6 — 데이터 소스 안정화 (Phase 5 이후, 목표 재설정)
- [ ] **가격/거래량**: KRX OpenAPI 전환 (일봉만 제공)
- [ ] **재무지표(PER/PBR/EPS 등)**: FinanceDataReader 또는 네이버 부분 유지 — KRX 단독으로는 불가
- [ ] Vercel 단일 배포 검토 (Express → Route Handlers 점진 이전)
- **조정**: 원계획 "스크래핑 완전 제거" → **"스크래핑 의존도 축소"** 로 목표 현실화

### Phase 7 — 실시간 분석 (구독자 100명+, 비용 구조 재검토 필요)
- [ ] 서버 아키텍처 결정: **Express WebSocket 레이어 확장 우선 검토** vs FastAPI 별도 파이프라인
  - 100명 × 9,900원 = 월 990,000원 수익
  - 비용: KIS 서버 $25+ (장외 시간도 상시) + Neon paid + Vercel Pro
  - 마진이 생각보다 좁음 → FastAPI 별도 프로세스는 수익성 검증 후 도입
- [ ] KIS WebSocket API (장중 1분봉)
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
- **부작용**: `consumePendingFocus`(온보딩 플로우에서 포트폴리오 페이지의 자동 폼 노출, 첫 종목 가이드 카드 트리거)가 사라짐.
- **해결 (Sprint 2)**: `app/portfolio/page.tsx`에서 `useSearchParams()` 기반 `?focus=add-holding` / `?focus=first-stock-guide` 처리로 대체 완료.

### 6. `/stock/[code]` 페이지의 stock 컨텍스트 복원 방식
- **원 계획**: 상세 페이지가 부모로부터 `stock: StockSummary` prop을 받음(카테고리=`'보유 종목'` / `'주요 종목'` 등 포함).
- **현 상태**: URL param `code` + `searchParams.get('from')`으로 진입 컨텍스트 복원. 보유 여부는 `usePortfolioStore.holdings`로 재검증, 비보유 케이스는 `from` 값(`holding|recommendation|watchlist|major|search|alerts`)으로 초기 카테고리 결정 후 서버 응답으로 덮어씀.
- **해결 (Sprint 2)**: 모든 호출처(dashboard, portfolio, recommendations, watchlist, screener, stocks, HeaderBar 검색)에서 `?from=` 쿼리 전달.

### 7. 알림 진입점 일원화 — 헤더 드롭다운 제거
- **원 계획**: 모바일 탭바 5개 중 "알림"은 드롭다운(`handleToggleAlerts`) 또는 전체 화면 모달.
- **해결 (Sprint 2)**: PC 헤더 드롭다운 제거, PC/모바일 모두 `/alerts` 라우트로 단일화. `HeaderBar`는 뱃지 + 라우팅만 담당. Phase 5 middleware 보호 라우트 설계도 단순해짐.

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
