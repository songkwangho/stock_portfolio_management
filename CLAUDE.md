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
│   ├── db/                       # 스키마·마이그레이션
│   ├── helpers/
│   ├── scrapers/                 # 네이버 증권
│   ├── domains/                  # 도메인별 서비스
│   ├── scheduler.js
│   ├── stocks.db                 # SQLite (Neon 마이그레이션 시 덤프 소스)
│   └── package.json              # 별도 의존성 — `cd server && npm install` 필요
│
└── scripts/
    └── backfill-history.js       # 97종목 × 3년 히스토리 적재 (배치 3개, ~6시간)
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
- [ ] **[C2-vercel]** Vercel 배포 검증 — **Build Command 반드시 `npm install && cd server && npm install`** (루트 + server 의존성 분리). git push 후 Vercel 대시보드 로그 확인
- [ ] **[C3]** Neon 마이그레이션 + backfill-history
  - `DATABASE_URL` 설정 후 `node server/db/migrate.js`
  - SQLite(`stocks.db`) 덤프 → Neon 적재 스크립트 작성·실행
  - `node scripts/backfill-history.js` (97종목 × 3년, 배치 3개씩, ~6시간)
  - 완료 검증 SQL: `SELECT code, COUNT(*) days FROM stock_history GROUP BY code HAVING COUNT(*) < 600 ORDER BY days ASC;`
- [ ] Vercel + Render 배포 + `FRONTEND_URL` CORS 설정
  - **순서 고정**: Neon 마이그레이션 → backfill → Render 배포(API URL 확정) → Vercel 환경변수 설정 → Vercel 빌드 → E2E
  - **HealthGate 타임아웃 상향** (현재 15초 → 25초) 또는 Render Health Check `/api/health` 설정으로 cold start 대응
- [ ] E2E 수동 검증 (포트폴리오 CRUD, 추천, 스크리너, 종목상세, 알림, 온보딩 3갈래)

**3.5차 — 잔여 보완 (Sprint 1.5, 배포 후 우선순위 가능)**
- [ ] **[H-NEW2/P10]** `app/portfolio/page.tsx` 로컬 toast → `useToastStore` 통일
- [ ] **[H-NEW3]** `/stock/[code]` `stockApi.deleteStock` 직접 호출 → store 경유로 변경 (로컬 상태 동기화 보장)
- [ ] **[Fix-6]** 시장지수 중복 fetch 해소 — HeaderBar + dashboard 각자 호출 → `useMarketStore` 신설 또는 Zustand 구독 패턴
- [ ] **[Fix-7/M2]** Recharts 커스텀 `CandlestickBar` wick 미동작 → Sprint 3에서 lightweight-charts 전환 우선 검토
- [ ] **[UX-NEW3]** `profitHelpCode` 팝업 외부 클릭 닫기 (mousedown 리스너)
- [ ] **[UX-NEW5]** `RecommendedStockCard` reason 2줄 초과 시 "더 보기" 토글
- [ ] **[UX-NEW7]** 섹터 비교 테이블 — 현재 종목 자동 스크롤 또는 최상단 고정
- [ ] **[UX-NEW8]** 포트폴리오 등록 폼 "비중(%)" 필드 — 레이블 재작성("총 자산의 몇 %") + "잘 모르겠으면 비워두세요" 힌트
- [ ] **[UX-F]** 재무제표 테이블 — periods 정렬 방향(최신 → 과거) 헤더에 명시

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
- [ ] JWT (1h + 14일 refresh) + Next.js middleware 보호 라우트 (Phase 3~4 동안 비활성, 구조만 선행 분리)
  - **Edge 호환 JWT 라이브러리 사전 결정 필수** — Express `jsonwebtoken`은 Edge Runtime 미지원. middleware는 `jose` 사용
- [ ] **Kakao Redirect URI 사전 등록** — 개발/스테이징/프로덕션 URI 전부 Kakao Developers에 등록 (Vercel Preview URL은 배포마다 변경되므로 Production URL만 OAuth 허용)
- [ ] 구독 DB 스키마 (상태·만료·환불 이력) → Toss Payments → Claude Haiku AI 리포트 (순차)
- [ ] **Toss Payments 웹훅 멱등성** — `payment_id` 기준 중복 차단, 최대 5회 재전송(지수 backoff) 대응
- [ ] KIS OpenAPI 신청 **병행 시작** (Phase 7 착수 전 심사 완료 필요, 영업일 1~3일)
- 목표: **200명**

### Phase 6 — 데이터 소스 안정화
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
