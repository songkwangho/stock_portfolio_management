# 종목 상세 리팩터링 계획 초안 (`app/stock/[code]/page.tsx`)

> 상태: **초안 (검토 대상)**. 이 문서는 계획만 담는다. 착수 여부·범위는 별도 지시로 결정.
> 작성 근거: 커밋 `a955d1a` 기준 실제 측정값. Sprint 3 [M1] "차트 `components/charts/` 분리"를 이 작업으로 흡수.

---

## 0. 왜 지금인가

- `app/stock/[code]/page.tsx` = **1444줄**. 3.11차 멀티에이전트 리뷰가 이 파일 크기로 4/5 에이전트가 stall(180s×6 무진전) → **리뷰 자동화가 물리적으로 불가능**해졌다. 이는 다음 차수 개발 속도의 블로커.
- 목표: 셸(fetch+레이아웃) ~150줄 + 섹션별 컴포넌트로 분해. **기능 회귀 0**이 최우선.

---

## B1. 현황 정밀 측정 (실측)

### 라인 수
| 파일 | 라인 |
|------|------|
| `app/stock/[code]/page.tsx` | **1444** |
| `app/dashboard/page.tsx` | 632 |
| `app/portfolio/page.tsx` | 486 |
| `app/screener/page.tsx` | 465 |
| `app/themes/page.tsx` | 214 |

→ 1000줄 초과는 **stock/[code]/page.tsx 단 하나**. dashboard(632)가 차순위 관찰 대상이나 이번 범위 밖. 문제는 아직 한 파일에 국한.

### 훅 카운트 (`StockDetailContent`)
- `useState` 선언 **20개** (grep 21은 타입/주석 오탐)
- `useEffect` **6개** (컴포넌트 내부 5 + 기본 export의 Suspense 1)
- `useRef` **1개** (`currentSectorRowRef`)

### useState 전체 (line)
| # | line | state | 초기값/타입 |
|---|------|-------|------------|
| 1 | 161 | `stockDetail` | `StockDetail \| null` |
| 2 | 162 | `loading` | `true` |
| 3 | 163 | `addForm` | `{avgPrice,weight,quantity}` |
| 4 | 164 | `editMode` | `false` |
| 5 | 165 | `editForm` | `{avgPrice,quantity,weight}` |
| 6 | 166 | `adding` | `false` |
| 7 | 167 | `volatility` | `number \| null` |
| 8 | 168 | `refreshing` | `false` |
| 9 | 169 | `indicators` | `TechnicalIndicators \| null` |
| 10 | 170 | `helpTerm` | `HelpTermKey \| null` |
| 11 | 171 | `news` | `NewsItem[] \| null` |
| 12 | 172 | `financials` | `FinancialData \| null` |
| 13 | 173 | `sectorData` | `SectorComparison \| null` |
| 14 | 174 | `chartTimeframe` | `'daily'\|'weekly'\|'monthly'` |
| 15 | 175 | `extraChartData` | `HistoryEntry[]` |
| 16 | 178 | `showInvestor` | `false` |
| 17 | 179 | `showFinancials` | `false` |
| 18 | 180 | `showSector` | `false` |
| 19 | 182 | `stockThemes` | `StockThemeTag[]` |
| 20 | 184 | `signals` | `SignalResult \| null` |

### useEffect 전체 (의존성)
| line | 의존성 | 역할 |
|------|--------|------|
| 187 | `[code]` | 진입 시 스크롤 최상단 |
| 191 | `[sectorData]` | 섹터 테이블 현재 종목 행으로 스크롤 |
| 197 | `[stock.code]` | **메인 fetch** — Phase1(가격·변동성·지표) + Phase2 지연(뉴스·재무·섹터·테마·신호) |
| 228 | `[stockDetail?.price]` | 가격 로드되면 addForm 초기화 |
| 235 | `[chartTimeframe, stock.code]` | 주봉/월봉 데이터 fetch |

### 순수/모듈 함수 (컴포넌트 밖)
| line | 함수 | 성격 |
|------|------|------|
| 25 | `generateStockSummary(stock, isHolding, holdingMatch)` | 순수. 결론 카드 한 줄 요약 |
| 68 | `generateActionGuide(stock, isHolding): string[]` | 순수. 행동 가이드 3단계 |

### 컴포넌트 내부 파생값·인라인 함수 (지역 계산)
| line | 이름 | 의존 | 소비처 |
|------|------|------|--------|
| 252 | `historyData` | chartTimeframe, stockDetail, extraChartData | 차트 |
| 256 | `fullChartData` | historyData | 차트 |
| 276 | `chartData` | fullChartData, sliceCount | 차트, 거래량, StatsGrid(전일·거래량) |
| 284 | `computeProbability()` | latest, prev, volatility, targetPrice | 사이드바 종합점수 |
| 299 | `volumeData` | chartData | 거래량 차트 + 흐름 해석 |
| 313 | `historyForRange` | stockDetail.history | StatsGrid 52주 |
| 314/317 | `high52w`/`low52w` | historyForRange | StatsGrid 게이지 |
| 320 | `prevClose` | chartData | StatsGrid |
| 321 | `latestVolume` | chartData | StatsGrid |
| 322 | `perDisplay` | stockDetail.per | StatsGrid |
| 327 | `formatVol(v)` | — (순수) | StatsGrid |
| 333 | `helpTexts` | — (정적 맵) | 차트/거래량 안내 |

---

## B2. 상태 → 섹션 의존성 맵 (핵심)

분해 리스크는 "여러 섹션이 공유하는 state"에서 나온다. 아래가 판정 결과.

### JSX 섹션 경계 (실측 line)
| 섹션 | line 범위 (근사) |
|------|------------------|
| Header (뒤로/새로고침/삭제/테마태그) | 349–483 |
| ConclusionCard (결론) | 484–547 |
| StatsGrid (한눈에 보기 + 52주 게이지) | 548–594 |
| SignalPanel (3.11 신호) | 600–642 |
| 모바일 스크롤 버튼 (lg:hidden) | 644–658 |
| PriceChart + VolumeChart | 660–767 |
| MetricsGrid (PER/PBR/ROE/목표가/PEG) | 769–902 |
| IndicatorPanel (RSI/MACD/볼린저 + 변동성) | 903–1005 |
| InvestorChart (아코디언) | 1006–1044 |
| FinancialsTable (아코디언) | 1045–1102 |
| SectorCompare (아코디언) | 1103–1215 |
| NewsList | 1216–1248 |
| Right Sidebar (의견·Scoring·AddForm) | 1249–1440 |

### state별 판정
| state | 소비 섹션 | 분해 시 처리 |
|-------|----------|-------------|
| `stockDetail` | Header, Conclusion, StatsGrid, MetricsGrid, PriceChart, Sidebar | **부모 유지 → props 하향** (핵심 데이터) |
| `loading` | 부모 early-return | 부모 유지 |
| `volatility` | IndicatorPanel + `computeProbability`(사이드바) | 부모 유지 → props (2곳 공유) |
| `indicators` | IndicatorPanel | props 하향 (부모 fetch 유지) |
| `sectorData` | SectorCompare + MetricsGrid(PER 게이지) + scroll ref | 부모 유지 → props (2곳 공유) |
| `signals` | SignalPanel + PriceChart(크로스 마커) | 부모 유지 → props (2곳 공유) |
| `stockThemes` | Header | props 하향 (부모 fetch 유지) |
| `news` | NewsList | **NewsList 내부로 이동 가능** (자체 fetch) 또는 props |
| `financials` | FinancialsTable | **FinancialsTable 내부로 이동 가능** 또는 props |
| `helpTerm` | HelpBottomSheet(트리 최하단) + [?]버튼 다수(MetricsGrid/IndicatorPanel/Sidebar) | **cross-cutting** — 부모 유지 + `onHelp(term)` 콜백 하향 (§B4-6) |
| `chartTimeframe` | PriceChart | **PriceChart 내부로 이동** |
| `extraChartData` | PriceChart | **PriceChart 내부로 이동** (chartTimeframe과 세트) |
| `addForm` | PortfolioAddForm | **PortfolioAddForm 내부로 이동** (초기 price만 prop) |
| `editMode`/`editForm`/`adding` | Sidebar 편집 | **Sidebar/AddForm 내부로 이동** |
| `refreshing` | Header 새로고침 | Header 지역화 (refetch 콜백은 부모) |
| `showInvestor` | InvestorChart | **컴포넌트 내부로 이동** |
| `showFinancials` | FinancialsTable | **컴포넌트 내부로 이동** |
| `showSector` | SectorCompare | **컴포넌트 내부로 이동** |

**요약**
- 부모(셸)에 남는 state: `stockDetail, loading, volatility, indicators, sectorData, signals, stockThemes, helpTerm` (+ fetch 오케스트레이션)
- 컴포넌트로 지역화: `chartTimeframe, extraChartData, addForm, editMode, editForm, adding, refreshing, showInvestor, showFinancials, showSector` (+ 선택적으로 news/financials)

**중요 결론**: 지역화 가능한 state가 10개 → 셸의 인지 부하가 절반으로 준다. `stockDetail`만이 진짜 광역 공유.

---

## B3. 제안 구조 + props 인터페이스

> **초안(B3)에 대한 수정 제안**: 원안은 `StatsGrid` 하나로 통합했으나, 실측상 **"한눈에 보기"(548–594)** 와 **"PER/PBR/ROE/목표가/PEG 상세"(769–902)** 는 별개 섹션이다. → `StatsGrid`(요약) 와 `MetricsGrid`(상세)로 **분리**할 것을 제안한다. 또한 원안엔 없던 `DetailHeader`/`RightSidebar`도 명시.

```
app/stock/[code]/page.tsx              # 셸: fetch + 레이아웃 (~180줄 목표)
components/stock/detail/
├── DetailHeader.tsx        # 뒤로/새로고침/삭제 + 테마 태그        (~120줄, 지역:refreshing)
├── ConclusionCard.tsx      # 결론 카드                            (~70줄, 무상태)
├── StatsGrid.tsx           # 한눈에 보기 9지표 + 52주 게이지        (~90줄, 무상태)
├── SignalPanel.tsx         # 3.11 신호 요약                        (~60줄, 무상태)
├── PriceChart.tsx          # 라인+SMA+ReferenceDot + 타임프레임     (~160줄, 지역:chartTimeframe/extraChartData)
├── VolumeChart.tsx         # 거래량 바 + 흐름 해석                  (~60줄, 무상태 / volumeData prop)
├── MetricsGrid.tsx         # PER/PBR/ROE/목표가/PEG + 섹터 게이지    (~150줄, onHelp prop)
├── IndicatorPanel.tsx      # RSI/MACD/볼린저 + 변동성               (~110줄, onHelp prop)
├── InvestorChart.tsx       # 투자자 매매동향 아코디언               (~60줄, 지역:showInvestor)
├── FinancialsTable.tsx     # 분기 실적 아코디언                     (~70줄, 지역:showFinancials)
├── SectorCompare.tsx       # 업종 비교 아코디언                     (~120줄, 지역:showSector + scroll ref)
├── NewsList.tsx            # 최신 뉴스                             (~40줄, 무상태)
└── RightSidebar.tsx        # 의견·Scoring·PortfolioAddForm 컨테이너 (~120줄)
    └── PortfolioAddForm.tsx # 매수 폼 (id=portfolio-add-form 보존)  (~140줄, 지역:addForm/edit*/adding)
lib/stockDetail/
├── summary.ts              # generateStockSummary / generateActionGuide (순수)
└── format.ts               # formatVol + (신규 공용) 거래량 포맷터
```

### props 인터페이스 (TypeScript 시그니처)
```ts
// 모두 'use client' — Recharts/Zustand/이벤트 핸들러 사용

interface DetailHeaderProps {
  stock: StockSummary; stockDetail: StockDetail | null;
  stockThemes: StockThemeTag[]; isHolding: boolean;
  onBack: () => void; onRefresh: () => Promise<void>; onDelete: () => void;
}
interface ConclusionCardProps { stockDetail: StockDetail; isHolding: boolean; holdingMatch?: Holding; }
interface StatsGridProps { stockDetail: StockDetail; }   // 52주·전일·거래량은 stockDetail.history에서 자체 계산(§B4-6)
interface SignalPanelProps { signals: SignalResult; }
interface PriceChartProps { code: string; stockDetail: StockDetail; signals: SignalResult | null; }
interface VolumeChartProps { volumeData: { name: string; volume: number; isUp: boolean }[]; helpText: string; }
interface MetricsGridProps { stockDetail: StockDetail; sectorData: SectorComparison | null; onHelp: (t: HelpTermKey) => void; }
interface IndicatorPanelProps { indicators: TechnicalIndicators | null; volatility: number | null; onHelp: (t: HelpTermKey) => void; }
interface InvestorChartProps { stockDetail: StockDetail; }
interface FinancialsTableProps { financials: FinancialData | null; }
interface SectorCompareProps { sectorData: SectorComparison | null; currentCode: string; }
interface NewsListProps { news: NewsItem[] | null; }
interface RightSidebarProps {
  stock: StockSummary; stockDetail: StockDetail; isHolding: boolean; holdingMatch?: Holding;
  onAdd: (...) => void; onUpdate: (...) => void; onDeleteHolding: (code: string) => void;
}
```

**내부 state / 'use client' 요약**: 전 컴포넌트 `'use client'`. 내부 state 보유: `DetailHeader`(refreshing), `PriceChart`(chartTimeframe/extraChartData), `InvestorChart/FinancialsTable/SectorCompare`(아코디언 boolean), `PortfolioAddForm`(addForm/editMode/editForm/adding). 나머지는 무상태 프레젠테이션.

---

## B4. 리스크 분석 (구체)

| # | 리스크 | 상세 | 완화책 |
|---|--------|------|--------|
| 1 | **ResponsiveContainer 높이 붕괴** | `<ResponsiveContainer>`는 부모의 명시적 높이(`h-72`/`h-24`)가 없으면 0px로 접힌다 | 추출 컴포넌트 root에 기존 `h-72 w-full`/`h-24 w-full` 래퍼 div를 **그대로** 포함. 시각 회귀 체크리스트에 높이 확인 명시 |
| 2 | **ReferenceDot 스코프 제약** | `<ReferenceDot>`은 `<ComposedChart>`의 **직접 JSX 자식**이어야 함 — 별도 컴포넌트로 빼면 Recharts가 인식 못 함 | 크로스 마커 매핑(`signals.signals.filter(...).map(...)`)을 `PriceChart` 내부에 두고 `signals`를 prop으로 주입 |
| 3 | **StatsGrid ↔ chartTimeframe 결합 (기존 잠재 버그)** | `prevClose`/`latestVolume`가 `chartData`(=타임프레임 의존)에서 파생 → 월봉 전환 시 "전일종가/거래량"이 월봉값으로 바뀜 | 리팩터링 시 StatsGrid는 `stockDetail.history`(항상 일봉)에서 직접 계산. **동작 개선이므로 diff에 명시** |
| 4 | **Suspense / useSearchParams 경계** | `from` searchParam·`use(params)`는 셸에서만 읽어야 함 | 자식은 `useSearchParams` 호출 금지. Suspense 래퍼는 기본 export에 유지. `from`·`isHolding`은 계산 후 prop 전달 |
| 5 | **지연 로딩 순서 의존** | 현재 단일 effect가 Phase1(핵심)→Phase2(보조) 순서 오케스트레이션 | **셸이 모든 fetch를 소유하고 데이터를 prop으로 하향**(setter 하향 금지). 예외: `PriceChart`만 chartTimeframe 기반 주봉/월봉 자체 fetch |
| 6 | **helpTerm cross-cutting** | [?] 버튼이 MetricsGrid·IndicatorPanel·Sidebar에 산재, `HelpBottomSheet`는 트리 최하단 | 셸이 `helpTerm` 소유 + `onHelp(term)` 콜백 하향. Context/Zustand 신설은 **불필요**(prop drilling 1단계) |
| 7 | **모바일 스크롤 버튼 DOM 결합** | lg:hidden 버튼이 `getElementById('portfolio-add-form')`로 폼 탐색 | `PortfolioAddForm`에 `id="portfolio-add-form"` + `scroll-mt-20` **보존**. DOM 계약을 문서화. 버튼은 셸/헤더 영역에 유지 |
| 8 | **파생값 이동 경계** | chartData/volumeData/high52w 등이 부모에서 계산돼 여러 섹션이 소비 | chart 관련(chartData/volumeData)은 PriceChart로 이동. StatsGrid 파생은 StatsGrid로. `computeProbability`는 Sidebar로. **중복 계산 허용**(가독성 > 미세 성능) |
| 9 | **Zustand 셀렉터 위치** | `usePortfolioStore`/`useToastStore` 구독이 여러 액션에서 사용 | 액션 쓰는 컴포넌트(Header/Sidebar/AddForm)에서 각자 구독. 셀렉터는 좁게 |

---

## B5. 단계별 순서 + 커밋 경계

원칙: 한 번에 전부 옮기지 않는다. 각 단계 = **독립 커밋 + tsc 통과 + 수동 확인**. 롤백은 단계 커밋 revert.

| 단계 | 대상 | 예상 diff | 검증 | 롤백 조건 |
|------|------|----------|------|-----------|
| **S1** | 순수 함수 → `lib/stockDetail/summary.ts` + `format.ts` | 이동 ~110줄, page.tsx import만 변경 | `tsc` + 결론카드/StatsGrid 렌더 확인 | import 에러·문구 변화 |
| **S2** | 리프 무상태/지역상태: `NewsList`, `FinancialsTable`, `InvestorChart` | 컴포넌트 3개 + 소비부 교체 | `tsc` + 아코디언 토글·뉴스 표시 | 아코디언 미동작 |
| **S3** | `SectorCompare`(scroll ref 포함), `ConclusionCard`, `StatsGrid`, `SignalPanel` | 컴포넌트 4개 | `tsc` + 섹터 스크롤·52주 게이지·신호 패널 | 스크롤/게이지 회귀 |
| **S4** | `MetricsGrid`, `IndicatorPanel` (onHelp 콜백 도입) | 컴포넌트 2개 + helpTerm 콜백 배선 | `tsc` + 모든 [?] 버튼 → HelpBottomSheet 열림 | 도움말 미개폐 |
| **S5** | `PriceChart`(chartTimeframe/extraChartData/ReferenceDot 이동), `VolumeChart` | **최고 리스크** | `tsc` + 일/주/월봉 전환·SMA·크로스 마커·거래량 높이·흐름 해석 | 차트 높이 붕괴·마커 소실 |
| **S6** | `DetailHeader`, `RightSidebar` + `PortfolioAddForm`(id 보존) | 컴포넌트 2~3개 | `tsc` + 보유 추가/수정/삭제·새로고침·모바일 스크롤 버튼 | 폼 제출·스크롤 회귀 |
| **S7** | 셸 정리 — 남은 fetch/레이아웃만 (~180줄 목표) | page.tsx 축소 | `tsc` + **전체 E2E 수동** | — |

**S5 세부 주의**: ResponsiveContainer 래퍼 높이(#1) + ReferenceDot 직접자식(#2) + StatsGrid 결합 해소(#3)를 동시에 다룸. 이 단계만 단독 PR 권장.

**단계별 수동 확인 공통**: (a) 결론카드 톤·컬러바, (b) 9지표 값, (c) 신호 패널 asOf·면책, (d) 차트 3종 전환, (e) [?] 도움말, (f) 보유 CRUD, (g) 모바일 lg:hidden 요소 위치.

---

## 종합

- **분해 안전성**: 광역 공유 state는 `stockDetail` 1개뿐. 나머지는 지역화 또는 1단계 prop drilling으로 해소 가능 → **구조적으로 분해 가능**한 상태.
- **최대 난관**: S5(차트) — Recharts 3대 제약(#1 높이, #2 ReferenceDot, #3 타임프레임 결합).
- **부수 효과(긍정)**: S3에서 StatsGrid의 chartTimeframe 결합(잠재 버그) 해소.
- **범위 밖**: dashboard(632줄)·portfolio(486줄)는 아직 임계 미만 — 후속 차수 관찰.

리팩터링 착수 전 **선행 데이터 과제**(PART A 발견)는 아래 별도 항목 참조 — 리팩터링과 독립이며 병행 가능.
