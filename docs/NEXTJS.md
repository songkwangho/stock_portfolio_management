# Next.js 전환 상세 가이드

## 개요

이 문서는 기존 Vite+React SPA에서 Next.js 15 App Router로 재개발할 때의
설계 결정, Server/Client 경계, ISR 패턴, 라우팅 전략을 다룬다.

백엔드(Express + PostgreSQL)는 변경하지 않는다.
프론트엔드 코드만 재개발 대상이며, 기존 로직의 약 90%는 그대로 재사용한다.

---

## 재사용 vs 재작성 분류

### 그대로 복사 (변경 없음)
- `stores/usePortfolioStore.ts` — `'use client'` 내부에서 동일하게 동작
- `stores/useAlertStore.ts`
- `stores/useWatchlistStore.ts`
- `stores/useToastStore.ts`
- `lib/stockApi.ts` — 환경변수명만 `NEXT_PUBLIC_API_BASE_URL`로 변경
- `lib/deviceId.ts` — WebDeviceIdStorage 그대로
- `lib/dataFreshness.ts` — parseServerDate, getDataFreshnessLabel 그대로
- `types/stock.ts` — 전체 타입 정의 그대로
- `components/ui/` 전체 — ErrorBanner, HelpBottomSheet, StatCard, NavButton
- `components/stock/ScoringBreakdownPanel.tsx` — `'use client'` 추가만
- `components/stock/RecommendedStockCard.tsx`
- `components/stock/StockSearchInput.tsx`
- `components/portfolio/WatchlistContent.tsx`
- Recharts 차트 코드 — `'use client'` 컴포넌트 안에 그대로

### 새로 설계 (재작성)
- `app/` 라우팅 구조 전체 — 파일 기반 라우팅으로 전환
- `app/layout.tsx` — 사이드바 + 탭바 + 헬스 게이트 통합
- `components/layout/Sidebar.tsx` — 기존 App.tsx 사이드바 분리
- `components/layout/MobileTabBar.tsx` — 기존 App.tsx 탭바 분리
- `components/layout/HealthGate.tsx` — 기존 App.tsx 헬스 게이트 분리
- `components/charts/CandleChart.tsx` — lightweight-charts로 교체

### 제거 대상
- `useNavigationStore` — Next.js 라우터로 대체
- `App.tsx` 탭 전환 로직 — 파일 기반 라우팅으로 대체

---

## Server Component 설계

### ISR 적용 페이지

```typescript
// app/stocks/page.tsx
export const revalidate = 86400; // 24h — 하루 1회 스크래핑과 일치

export default async function StocksPage() {
  // 서버에서 직접 fetch — 클라이언트 JS 없음
  const stocks = await fetch(
    `${process.env.API_BASE_URL}/api/stocks`,
    { next: { revalidate: 86400 } }
  ).then(r => r.json());

  return <StocksPageClient initialStocks={stocks} />;
}
```

```typescript
// app/stock/[code]/page.tsx
export const revalidate = 86400;

export async function generateStaticParams() {
  // 빌드 시점에 97개 종목 정적 생성
  const stocks = await fetch(`${process.env.API_BASE_URL}/api/stocks`)
    .then(r => r.json());
  return stocks.map((s: { code: string }) => ({ code: s.code }));
}

export default async function StockDetailPage({ params }: { params: { code: string } }) {
  const stock = await fetch(`${process.env.API_BASE_URL}/api/stock/${params.code}`)
    .then(r => r.json());

  return <StockDetailClient initialStock={stock} />;
}
```

```typescript
// app/recommendations/page.tsx
export const revalidate = 86400;

export default async function RecommendationsPage() {
  const recs = await fetch(`${process.env.API_BASE_URL}/api/recommendations`)
    .then(r => r.json());
  return <RecommendationsClient initialData={recs} />;
}
```

### CSR 전용 페이지 (개인 데이터)

```typescript
// app/dashboard/page.tsx — ISR 없음
// device_id 기반 개인 데이터는 서버에서 fetch 불가 → 전부 CSR
export default function DashboardPage() {
  return <DashboardClient />; // 'use client' 컴포넌트
}
```

### 환경변수 구분

```bash
# 서버에서만 사용 (Server Component, API Routes)
API_BASE_URL=http://localhost:3001

# 클라이언트에서 사용 (Client Component)
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

Server Component에서는 `process.env.API_BASE_URL` 사용.
Client Component에서는 `process.env.NEXT_PUBLIC_API_BASE_URL` 사용.

---

## Client Component 패턴

### 'use client' 격리 규칙

```typescript
// ✅ 올바른 패턴 — Server에서 초기 데이터, Client에서 상호작용
// app/stocks/page.tsx (Server)
import StocksPageClient from '@/components/stock/StocksPageClient';
export default async function Page() {
  const data = await fetchStocks();
  return <StocksPageClient initialData={data} />;
}

// components/stock/StocksPageClient.tsx
'use client';
import { useState } from 'react';
// Zustand, 이벤트, 차트 등 클라이언트 전용 로직
```

```typescript
// ✅ Zustand 스토어는 'use client' 내부에서만
'use client';
import { usePortfolioStore } from '@/stores/usePortfolioStore';

// ❌ Server Component에서 Zustand 절대 사용 금지
// import { usePortfolioStore } from '@/stores/usePortfolioStore'; // 오류
```

### Recharts 격리

```typescript
// components/charts/PortfolioChart.tsx
'use client';
import { ComposedChart, Area, Line, XAxis, YAxis, ... } from 'recharts';

// 기존 DashboardPage 차트 코드 그대로 붙여넣기
// 변경 필요한 것: 없음 (이미 클라이언트 컴포넌트)
```

### CandleChart (lightweight-charts)

```typescript
// components/charts/CandleChart.tsx
'use client';
import dynamic from 'next/dynamic';

const LightweightChartCore = dynamic(
  () => import('./LightweightChartCore'),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full bg-slate-800/50 rounded-2xl animate-pulse" />
    ),
  }
);

export default function CandleChart({ data }: { data: ChartDataPoint[] }) {
  return <LightweightChartCore data={data} />;
}

// components/charts/LightweightChartCore.tsx
'use client';
import { createChart } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
// lightweight-charts 초기화 로직
```

---

## 라우팅 구조

### layout.tsx

```typescript
// app/layout.tsx
import Sidebar from '@/components/layout/Sidebar';
import MobileTabBar from '@/components/layout/MobileTabBar';
import HealthGate from '@/components/layout/HealthGate';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-slate-950 text-white">
        <HealthGate>  {/* 'use client' — 서버 연결 확인 후 children 렌더 */}
          <div className="flex min-h-screen">
            <Sidebar />  {/* hidden md:flex — PC 전용 */}
            <main className="flex-1 md:ml-68 pb-20 md:pb-0">
              {children}
            </main>
          </div>
          <MobileTabBar />  {/* fixed bottom-0 md:hidden */}
        </HealthGate>
      </body>
    </html>
  );
}
```

### 알림 패널

기존 App.tsx에서 상태로 관리하던 알림 패널은 레이아웃 수준에서 유지.

```typescript
// components/layout/Sidebar.tsx ('use client')
// 기존 PC 사이드바 + 알림 패널 통합
// useAlertStore 사용 가능
```

### StockDetail 라우팅

```typescript
// 기존: navigateTo('detail') + selectedStock 상태
// 변경: /stock/[code] URL로 직접 이동

// 내부 링크
import { useRouter } from 'next/navigation';
const router = useRouter();
router.push(`/stock/${code}`);

// 또는
import Link from 'next/link';
<Link href={`/stock/${code}`}>종목 상세</Link>
```

### 모바일 탭바 active 상태

```typescript
// components/layout/MobileTabBar.tsx ('use client')
'use client';
import { usePathname } from 'next/navigation';

export default function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <nav className="fixed bottom-0 md:hidden ...">
      <TabButton href="/dashboard" active={isActive('/dashboard')} />
      <TabButton href="/portfolio" active={isActive('/portfolio')} />
      ...
    </nav>
  );
}
```

---

## 헬스 게이트

```typescript
// components/layout/HealthGate.tsx ('use client')
'use client';
import { useState, useEffect } from 'react';

export default function HealthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'timeout'>('checking');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setState('timeout'); }, 15000);

    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/health`, { signal: controller.signal })
      .then(r => r.json())
      .then(() => { clearTimeout(timer); setState('ok'); })
      .catch(() => setState('timeout'));

    return () => clearTimeout(timer);
  }, []);

  if (state === 'checking') return <SplashScreen />;
  if (state === 'timeout') return <TimeoutScreen onRetry={() => setState('checking')} />;
  return <>{children}</>;
}
```

---

## Tailwind v4 설정

```css
/* app/globals.css */
@import "tailwindcss";

/* 기존 커스텀 컬러, 애니메이션 그대로 */
```

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Express API 프록시 (개발 환경)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

---

## 개발 순서 권장

1. **프로젝트 초기화**: `npx create-next-app@latest` (App Router, TypeScript, Tailwind)
2. **레이아웃**: `app/layout.tsx` + `HealthGate` + `Sidebar` + `MobileTabBar`
3. **타입·유틸 이전**: `types/stock.ts`, `lib/deviceId.ts`, `lib/dataFreshness.ts`, `lib/stockApi.ts`
4. **Zustand 스토어 이전**: 4개 스토어 그대로 복사
5. **UI 컴포넌트 이전**: `ErrorBanner`, `HelpBottomSheet`, `StatCard` 등 `'use client'` 추가
6. **차트 컴포넌트 격리**: Recharts 컴포넌트 분리, CandleChart 교체
7. **페이지 이전**: CSR 페이지 먼저 (Dashboard, Portfolio) → ISR 페이지 (Stocks, Recommendations)
8. **StockDetail 페이지**: ISR + CSR 혼합 패턴
9. **배포**: Vercel 연결 + 환경변수 설정

---

## 주의 사항

### Hydration Mismatch 방지

```typescript
// ❌ 서버/클라이언트 렌더 결과가 다른 패턴
const time = new Date().toLocaleString('ko-KR'); // 서버 시간 ≠ 클라이언트 시간

// ✅ useEffect에서 처리
const [time, setTime] = useState('');
useEffect(() => { setTime(new Date().toLocaleString('ko-KR')); }, []);
```

### localStorage 접근

```typescript
// ❌ Server Component에서 localStorage 접근 불가
const id = localStorage.getItem('device_id'); // 오류

// ✅ 'use client' + useEffect 또는 lib/deviceId.ts 함수 사용
'use client';
import { getDeviceId } from '@/lib/deviceId';
useEffect(() => { const id = getDeviceId(); }, []);
```

### 스코어 임계값 면책 (ScoringBreakdownPanel)

7/4점 임계값은 Phase 4 백테스팅 전 임시값.
`ScoringBreakdownPanel` 상단의 amber 경고 배너는 Phase 4 완료 전까지 반드시 유지.
