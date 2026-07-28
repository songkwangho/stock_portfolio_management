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

### SSOT (2026-07-22 — 3.13차 라이트 + 한국 증시 색)

디자인 토큰 단일 진실 공급원은 [DESIGN.md](./DESIGN.md).
Tailwind v4 `@theme` 블록: [app/design-tokens.css](../app/design-tokens.css) → [app/globals.css](../app/globals.css) import.
**토큰 수정**: DESIGN.md 편집 → `design-tokens.css @theme` 동기화(수동).

### 확정 12규칙 (전 페이지 공통 — 3.13차)
1. **라이트**: `paper`(페이지)/`surface`(카드)/`inset`(함몰). 다크 slate 전량 제거
2. **한국 증시 색**: 상승·수익·긍정 = `rise`(#D91C1C 빨강) / 하락·손실·부정 = `fall`(#1B5FD0 파랑). 서구와 반대 — 기계적 치환 금지, 용례마다 판단
3. **게이지/바 채움 = 무채색**(ink~muted~faint). 방향색은 뱃지·수익률·의견·숫자에만
4. **accent 폐지**: blue는 `fall` 전용. 장식/정보 blue → ink/중립. 주요 버튼 = `bg-ink text-surface`
5. **의견 매핑**: market 긍정→rise/부정→fall/중립→중립. holding 매도→fall/관망→caution/추가매수→rise/보유→중립
6. **시스템 위험색 ≠ 방향색**: 에러·삭제 = `caution` 또는 muted. rise/fall·raw red-500 금지(rise=수익과 충돌)
7. **이모지 0**, 장식 아이콘 0 — 동작 아이콘만(삭제/외부링크/새로고침/닫기/검색/알림/관심Heart/네비/체크)
8. **첫글자 아바타 → 종목코드**(tabular-nums) 또는 제거
9. **카드 = 실제로 묶일 것만**. 목록 = 구분선 행, 표 = 표 구조
10. **밀도**: 카드 패딩 base(p-4), 요소 간격 tight(8~12), 블록 사이 여백 큼(리듬)
11. **라운딩**: `rounded-lg`/`rounded-xl`/`rounded-2xl`(강조·모달). `rounded-3xl` 금지
12. **금융 수치 `tabular-nums`**, 터치 타겟 44px, 경고/면책은 각주(text-xs faint) 또는 [?] 토글 — 정보보다 크면 안 됨

**카드 위계**: [components/ui/Card.tsx](../components/ui/Card.tsx) — `primary`(surface+line-strong+shadow-sm) / `secondary`(surface+line) / `tertiary`(inset). **폰트**: Pretendard(CDN, 실패 시 시스템 폰트).

### 접근성 원칙 (필수)
1. 최소 폰트: `text-xs`(12px) 이상 — 3.10차부터 강제
2. 터치 타겟: 모든 인터랙티브 요소 최소 44×44px
3. hover 의존 금지 — 모바일에서도 항상 접근 가능
4. 용어 설명 기본 노출 — [?] 버튼 뒤에만 숨기지 않음
5. 색상+텍스트 병기 (색각이상 대응)
6. 테이블→카드 전환 (모바일 가로 스크롤 제거)
7. 아이콘 전용 버튼 금지 — 텍스트 레이블 병기

### Opinion 뱃지 스타일

**MarketOpinion** (한국 색):
```
긍정적: bg-rise/10 text-rise    중립적: bg-inset text-muted    부정적: bg-fall/10 text-fall
```

**HoldingOpinion** (표시 라벨 소프트화, 내부 값 유지):
```
보유      → "[보유]"       bg-inset text-muted
추가매수  → "[추가 검토]"  bg-rise/10 text-rise
관망      → "[관망]"       bg-caution/10 text-caution
매도      → "[주의 필요]"  bg-fall/10 text-fall
```
"[주의 필요]" / "[추가 검토]" 뱃지 아래: italic 면책 문구 별도 줄

**분석 중** (`sma_available === false`): `bg-inset text-muted` — "이평선 데이터를 수집 중이에요."

**알림 출처 뱃지** (범주 → 무채색, 방향색 아님):
```
'holding'   → [보유 중]    bg-inset text-muted
'watchlist' → [관심 종목]  bg-inset text-muted
undefined   → [알림]       bg-inset text-muted  (레거시 폴백)
```

**알림 타입 레이블** (이모지 제거, 색은 타입별 판단):
```
sell_signal → 가격 하락 경고 (fall)     sma5_break  → 단기 하락 알림 (fall)
sma5_touch  → 가격 지지 알림 (caution)  target_near → 목표가 근접 알림 (caution)
undervalued → 저평가 분석 결과 (중립)
```

### 컬러 팔레트 (라이트, 3.13차 DESIGN.md 토큰)

| 용도 | 토큰 클래스 | 값 |
|------|-------------|-----|
| 페이지 배경 | `bg-paper` | #FAFAF8 |
| 카드 | `bg-surface` | #FFFFFF |
| 함몰/셀 | `bg-inset` | #FAFAF8 |
| 테두리 (기본/강조) | `border-line` / `border-line-strong` | #E7E7E3 / #D4D4CE |
| 상승·수익·긍정 | `text-rise` / `bg-rise` | #D91C1C (빨강) |
| 하락·손실·부정 | `text-fall` / `bg-fall` | #1B5FD0 (파랑) |
| 주의·관망·경고·시스템위험 | `text-caution` / `bg-caution` | #9A5B08 (amber) |
| 텍스트 계층 | `text-ink` > `text-muted` > `text-faint` | #17181C > #6E7076 > #85878D |

**차트**: 가격=ink, SMA5=rise, SMA20=caution, 그리드=#E7E7E3, 축=#85878D. 투자자 3주체(외국인/기관/개인)=무채색(범주). 파이=무채색 ramp + 집중(>50%) caution 태그.

### 공통 패턴 (라이트, 3.13차)

```
카드(일반):  bg-surface border border-line rounded-xl p-4
카드(결론):  <Card variant="primary" padding="base" accentBar={opinion}>  — surface + line-strong + shadow-sm + 좌 4px accentBar
카드(함몰):  bg-inset rounded-lg
버튼(주):    bg-ink text-surface rounded-xl min-h-[44px] px-4 py-3 hover:opacity-90
버튼(보조):  bg-surface border border-line-strong text-ink hover:bg-inset
인풋:        bg-surface border border-line-strong rounded-xl px-4 py-3 focus:border-ink placeholder:text-faint
게이지:      트랙 bg-line, 채움 bg-ink/bg-muted/bg-faint (무채색)
목록:        divide-y divide-line 또는 border-b border-line 행 (카드 아님)
```

DEPRECATED (사용 금지): `rounded-3xl`, `text-[10/11px]`, `uppercase tracking-widest`, 다크 slate/emerald/blue-accent, 이모지, 첫글자 아바타, 큰 경고 박스. 3.13차 전량 제거.

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

### 데이터 종합 해석 (4.5c차 — 초보자 풀이)

지표·데이터를 초보자 언어로 풀되 **투자 권유가 되지 않도록** 표현 범위를 강제한다. 순수 함수 `lib/stockDetail/interpret.ts` + 전수 금지어 테스트(`tests/stockDetail/interpret.test.ts`)로 회귀 차단.

- **허용**: 사실 + 정도표현("싼/비싼/높은/낮은/많은 편"), 관찰형 서술("N일 연속 팔고 있어요")
- **금지**: 명령형(사세요/파세요/사라/팔라), 가치 판단어(좋다/나쁘다/위험/안전/건전/탄탄/우량). 미검증 신호를 "예측"으로 표현 금지 — "관찰"로만
- **종합(synthesize)**: 상충을 짚되 **결론 유보**("서로 엇갈려 판단이 애매한 구간", "백테스팅으로 검증된 기준은 아니에요")
- **데이터 없으면** available:false → 억지 해석 없이 항목/패널 미표시
- **색**: 항목 tone(positive/caution)은 synthesize 상충 집계용 **논리** 구분일 뿐 → UI는 **무채색**(방향색 칠하면 "긍정=사라"로 오독, 3.13 규칙). 레이블 muted + 풀이 ink
- **역할 분리**: 결론 카드=한 줄 결론 / 해석 패널=왜 그런지 근거 / 종합점수=수치

### DART 재무·공시 표시 (4.5a차)

- **공시**: 호재/악재 **판정 금지** — 중립 서술만. category 뱃지는 **무채색**(표시용 분류). 정정/철회만 caution 표시, DART 원문 링크 제공
- **재무 증감**: 화살표(▲▼) + **무채색**(매출 증가 ≠ 주가 상승 — 3.13 방향색 규칙). 손익·현금흐름은 DART 중간보고서가 **누적(YTD)**이라 분기 비교 부적절 → "누적" 라벨 + 화살표 생략, 재무상태표만 화살표
- **폴백**: DART 미적재/실패 시 available:false → 재무는 네이버 폴백, 공시는 "최근 공시가 없어요" (에러 아님)
