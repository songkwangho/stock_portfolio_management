# Frontend UX Documentation — 온보딩·면책·디자인시스템·초보자 안내

> 스토어·페이지·컴포넌트·타입 명세는 `docs/FRONTEND.md` 참조

---

## 온보딩 플로우

**localStorage 키 4개**: `disclaimer_accepted`, `onboarding_done`, `onboarding_first_stock_guided`, `onboarding_alerts_explained`

**플로우**:
1. **면책 모달** — 원금 손실 위험 + 정보 제공 도구 명시 → [확인했습니다]
2. **온보딩 스텝** — "내 주식을 추가해볼게요" → [건너뛰기] / [직접 추가할게요]
   - [직접 추가할게요]: `/portfolio`로 이동 + 검색 폼 자동 노출
3. **첫 종목 추가 직후 가이드 카드** (1회, holdings 0→1 전환 시)
   ```
   🎉 첫 종목을 추가했어요!
   지금 할 수 있는 것:
   • 종목 분석 보기 → (ScoringBreakdownPanel, 기술지표)
   • [?] 버튼으로 용어 설명 보기
   • 추천 탭에서 다른 종목 살펴보기
   ```
4. **알림 패널 첫 진입 안내** (1회)
   ```
   📬 알림은 어떻게 동작하나요?
   • 보유·관심 종목 가격 변화 알림
   • 하루 1회 갱신 (실시간 아님)
   • 동일 종목당 하루 최대 2건
   • SMA 관련 알림은 보유 종목에만
   ```
5. **대시보드 CTA** — `onboarding_done` 이후 재방문 시에만 표시

---

## 투자 면책 고지 (7곳)

| 위치 | 형태 |
|------|------|
| 첫 실행 모달 | 모달, 1회 |
| 추천 페이지 상단 | 상시 |
| 종목 상세 종합의견 박스 | 인라인 |
| 종목 상세 분석 하단 | 인라인 |
| 추천 카드 하단 | 카드 푸터 |
| HoldingsAnalysisPage 매도/추가검토 뱃지 하단 | italic |
| ScoringBreakdownPanel 상단 | 종합점수 바로 아래 |

---

## UI 디자인 시스템

### SSOT (2026-05-13 — DESIGN.md 채택, 3.10차)

디자인 토큰의 단일 진실 공급원은 프로젝트 루트 [docs/DESIGN.md](../docs/DESIGN.md).
Tailwind v4 `@theme` 블록은 [app/design-tokens.css](../app/design-tokens.css)에 정의되어 있고
[app/globals.css](../app/globals.css)에서 import된다.

- **카드 위계**: [components/ui/Card.tsx](../components/ui/Card.tsx) — `primary` / `secondary` / `tertiary` variant. 배경 명도로 위계 표현 (그림자 금지)
- **색상**: 의미색 4개(positive/negative/accent/caution) + slate 그레이스케일
- **타이포**: 최소 12px(body-sm), `text-[10px]`/`text-[11px]` 임의값 금지
- **폰트**: Pretendard (CDN 로드, 실패 시 시스템 폰트 fallback)
- **라운딩**: `rounded-lg`(8px, 뱃지) / `rounded-xl`(12px, 카드) / `rounded-2xl`(16px, 강조·모달). `rounded-3xl` 사용 금지

**토큰 수정 절차**: DESIGN.md 편집 → `app/design-tokens.css`의 `@theme` 블록 동기화.
DESIGN.md → CSS 자동 변환 CLI(`@google/design.md`)는 아직 프로젝트에 도입되지 않았으므로 수동.

### 접근성 원칙 (필수)
1. 최소 폰트: `text-xs`(12px) 이상 — 3.10차부터 강제
2. 터치 타겟: 모든 인터랙티브 요소 최소 44×44px
3. hover 의존 금지 — 모바일에서도 항상 접근 가능
4. 용어 설명 기본 노출 — [?] 버튼 뒤에만 숨기지 않음
5. 색상+텍스트 병기 (색각이상 대응)
6. 테이블→카드 전환 (모바일 가로 스크롤 제거)
7. 아이콘 전용 버튼 금지 — 텍스트 레이블 병기

### Opinion 뱃지 스타일

**MarketOpinion**:
```
긍정적: bg-emerald-500/10 text-emerald-400 border-emerald-500/20
중립적: bg-slate-500/10 text-slate-400 border-slate-500/20
부정적: bg-red-500/10 text-red-400 border-red-500/20
```

**HoldingOpinion** (표시 라벨 소프트화, 내부 값 유지):
```
보유      → "[보유]"       bg-blue-500/10 text-blue-400
추가매수  → "[추가 검토]"  bg-emerald-500/10 text-emerald-400
관망      → "[관망]"       bg-yellow-500/10 text-yellow-400
매도      → "[주의 필요]"  bg-red-500/10 text-red-400
```
"[주의 필요]" / "[추가 검토]" 뱃지 아래: italic 면책 문구 별도 줄

**분석 중** (`sma_available === false`):
```
"분석 중" bg-slate-500/10 text-slate-400
이유: "이평선 데이터를 수집 중이에요."
```

**알림 출처 뱃지**:
```
'holding'   → [보유 중]    bg-blue-500/10 text-blue-300
'watchlist' → [관심 종목]  bg-purple-500/10 text-purple-300
undefined   → [알림]       bg-slate-500/10 text-slate-400  (레거시 폴백)
```

**알림 타입 레이블**:
```
sell_signal  → 🔴 가격 하락 경고
sma5_break   → 📉 단기 하락 알림
sma5_touch   → 💡 가격 지지 알림
target_near  → 🎯 목표가 근접 알림
undervalued  → 💎 저평가 분석 결과
```

### 컬러 팔레트 (다크 테마, 3.10차 DESIGN.md 토큰)

| 용도 | 토큰 클래스 | 값 (slate 참조) |
|------|-------------|------------------|
| 배경 (deep) | `bg-deep` | `#020617` (slate-950) |
| 배경 (카드) | `bg-card` | `#0f172a` (slate-900) |
| 배경 (강조 카드) | `bg-card-raised` | `#1e293b` (slate-800) |
| 배경 (함몰) | `bg-inset` | `#020617` (slate-950) |
| 테두리 (기본) | `border-border-subtle` | slate-800 |
| 테두리 (강조) | `border-border-muted` | slate-700 |
| 인터랙션 (blue — 버튼/링크 전용) | `bg-accent`, `text-accent`, `hover:bg-accent-hover` | blue-600 / blue-500 |
| 상승/긍정 | `text-positive`, `bg-positive` | emerald-500 |
| 하락/부정 | `text-negative`, `bg-negative` | red-500 |
| 관망/미검증 | `text-caution`, `bg-caution` | amber-500 |
| 텍스트 계층 | `text-text-primary` > `text-text-body` > `text-text-muted` > `text-text-faint` | slate-50 > slate-300 > slate-400 > slate-500 |

### 공통 패턴 (3.10차 갱신)

```
카드 (일반):  <Card variant="secondary" padding="base">     — bg-card + rounded-xl(12px) + p-4
카드 (결론):  <Card variant="primary" padding="emphasis" accentBar="positive">
              — bg-card-raised + rounded-xl + p-6 + border-l-4
카드 (함몰):  <Card variant="tertiary" padding="tight">     — bg-inset + rounded-lg(8px) + p-3
버튼:         bg-accent hover:bg-accent-hover text-white rounded-xl min-h-[44px] px-4 py-3 text-sm font-bold
인풋:         bg-inset border-border-subtle rounded-xl px-4 py-3 text-sm focus:border-accent
뱃지:         text-xs font-bold px-2.5 py-1 rounded-lg bg-{semantic}-500/10 text-{semantic}-500
```

DEPRECATED (사용 금지): `rounded-3xl`, `text-[10px]`, `text-[11px]`. 3.10차에서 전량 제거됨.

---

## 초보자 친화 UX 규칙

### 수익률 행동 유도 텍스트 (6구간)

| 구간 | 문구 |
|------|------|
| ≥20% | "목표 수익 달성! 🎉 일부 팔아볼까요?" |
| ≥10% | "잘 하고 계세요! 추세를 유지해 보세요" |
| ≥0% | "소폭 수익 중이에요. 지켜보세요" |
| ≥-3% | "소폭 손실이에요. 주식은 단기 등락이 있어요." |
| ≥-7% | "손실이 나고 있어요. 시장 상황을 지켜봐요" |
| <-7% | "손실이 커지고 있어요. 해당 종목의 분석을 다시 확인해보세요 🔴" |

특정 숫자(-7%)를 직접 노출하면 매도 권유로 오해될 수 있어 문구로 대체.

### holding_opinion 이유 텍스트 (뱃지와 줄 분리)

| 상태 | 뱃지 | 이유 |
|------|------|------|
| 매도 (손절) | [주의 필요] | "손실이 커지고 있어요. 해당 종목의 분석을 다시 확인해보세요 🔴" |
| 매도 (이탈) | [주의 필요] | "5일·20일 평균 모두 아래로 내려갔어요. 하락 추세예요." |
| 관망 | [관망] | "5일 평균 아래지만 20일 평균이 지지 중이에요." |
| 추가매수 | [추가 검토] | "5일 평균 부근에서 지지받고 있어요." |
| 보유 | [보유] | "5일 평균 위, 이평선 정배열이에요." |

### 스코어 임계값 면책

`ScoringBreakdownPanel` 상단 amber 배너 (Phase 4 백테스팅 전까지 고정):
> "⚠️ 이 점수 기준은 실증 검증 전이에요. 과거 데이터로 최적화하기 전 임시 기준이니 참고용으로만 봐주세요."

### 섹터별 PER 힌트 (StockDetailView)

| 섹터 | 힌트 |
|------|------|
| 기술/IT | "IT 기업은 PER 20~40배도 정상이에요." |
| 금융/지주 | "금융 기업은 PER 5~15배가 일반적이에요." |
| 바이오/헬스케어 | "바이오 기업은 R&D 투자로 일시 적자가 많아요." |
| 에너지/소재 | "에너지·소재는 원자재 가격에 따라 PER이 출렁여요." |

### 스크리너 함정 안내 (프리셋별 caveat)

| 프리셋 | caveat |
|--------|--------|
| 저평가 우량주 | "금융·통신·자동차 업종이 많이 포함될 수 있어요. 이 업종은 원래 PER이 낮은 편이라 단순 저평가로 보기 어려워요." |
| 안전한 자산주 | "자산 대비 저평가지만 사업이 부진한 경우도 많아요. ROE를 함께 확인해보세요." |
| 고수익 성장주 | "일시적 호황으로 ROE가 높을 수 있어요. 최근 분기 실적도 함께 봐주세요." |
| 소액 투자 | "주가가 낮다고 좋은 종목은 아니에요. 시가총액과 사업 내용을 꼭 확인하세요." |

결과 상단 공통: "📌 아래 종목들은 조건에 맞는 참고 목록이에요. 업종마다 정상 지표 범위가 달라 직접 확인이 필요해요."

### 포트폴리오 집중도 경고

종목 비중 >50% 시 카드 테두리 yellow + 안내:
> "⚠️ [종목명] 비중이 N%예요. 한 종목에 집중되면 이 종목 하락 시 손실이 커져요."

### 포트폴리오 추이 차트 — 수익/손실 시각화

차트 상단 힌트:
> "💡 평가금액(실선)이 투자원금(파선) 위에 있으면 수익 중, 아래면 손실 중이에요."

- 평가금액: 실선 Area (손실 시 #ef4444, 수익 시 #3b82f6)
- 투자원금: 회색(#94a3b8) 파선 (`strokeDasharray="5 5"`)

### 이평선 안내 (StockDetailView 라인 차트)

```
💡 이평선(이동평균선) 보는 법
파란선(5일 평균, 단기 흐름) / 노란선(20일 평균, 중기 흐름).
주가 > 파란선 = 단기 상승 흐름 · 파란선 > 노란선 = 정배열(긍정적 추세).
```

### 지표 가용성 안내 (StockDetailView)

`*_available === false` 시:
```
⏳ 일부 지표는 데이터 수집 중이에요
RSI — 최소 15일 데이터 필요. 현재 N일치, 약 (15-N)일 후 표시.
MACD — 최소 26일 데이터 필요.
볼린저밴드 — 최소 20일 데이터 필요.
```

### KOSPI 비교 ℹ️ 툴팁 (DashboardPage)

StatCard `tooltip` props로 분리:
```
오늘 KOSPI ±N% ℹ️
클릭 시: "KOSPI는 오늘 하루 변동률이에요. 내 수익률(매입 이후 전체 기간)과 직접 비교하기 어려워요."
```
KOSPI 데이터 미수신 시 툴팁 라인 자체 숨김.

### 데이터 표시 원칙

- `parseServerDate()`: PostgreSQL ISO 8601 + SQLite 레거시 양쪽 처리
- KST 변환: `Asia/Seoul` 타임존 명시 (`Intl.DateTimeFormat` 사용, `getTimezoneOffset()` 금지)
- 재무제표: "(단위: 억 원)", 1조 이상 "X조 Y,YYY억"
- 금액 포맷: `formatKoreanWon()` — ₩N만 / ₩N.N억 (영문 k 사용 금지)
- 등락률 placeholder: `['0', '0.00', '+0.00', '-0.00']` 집합 판정으로 숨김

### 알림 패널 반응형

- PC: 헤더 드롭다운
- 모바일: 전체 화면 모달 (스크롤 충돌 회피)
- 알림 시각: `getDataFreshnessShort()` ("3분 전" 형태)

### 추천 적정가 표현

"상승여력 +N%" → **"적정가 대비 현재가 괴리 +N%"**
+ "※ 이 수치는 실제 수익률이 아니에요."
애널리스트 목표가 기준 시: "통상 6~12개월 기준" 안내 추가.
