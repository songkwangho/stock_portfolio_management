---
version: alpha
name: Stock Analyzer
description: 한국 주식 초보자를 위한 의사결정 지원 다크 테마 디자인 시스템
colors:
  # ── 배경 계층 (elevation) ──
  bg-deep: "#020617"          # slate-950 — 페이지 최하단 배경
  bg-card: "#0f172a"          # slate-900 — 기본 카드 (secondary)
  bg-card-raised: "#1e293b"   # slate-800 — 강조 카드 (primary)
  bg-inset: "#020617"         # slate-950 — 카드 내부 함몰 영역 (입력창, 통계 셀)

  # ── 테두리 ──
  border-subtle: "#1e293b"    # slate-800 — 기본 테두리
  border-muted: "#334155"     # slate-700 — 강조 테두리
  border-focus: "#2563eb"     # blue-600 — 포커스 링

  # ── 의미색 (3 + 1 제한) ──
  positive: "#10b981"         # emerald-500 — 상승/긍정/수익
  positive-soft: "#10b98118"  # emerald-500 10% — 긍정 배경
  negative: "#ef4444"         # red-500 — 하락/부정/손실
  negative-soft: "#ef444418"  # red-500 10% — 부정 배경
  accent: "#2563eb"           # blue-600 — 인터랙션 전용 (버튼/링크)
  accent-hover: "#3b82f6"     # blue-500 — 인터랙션 hover
  caution: "#f59e0b"          # amber-500 — 관망/미검증 데이터 (제한적)
  caution-soft: "#f59e0b18"   # amber-500 10% — 경고 배경

  # ── 텍스트 계층 ──
  text-primary: "#f8fafc"     # slate-50 — 제목/핵심 수치
  text-body: "#cbd5e1"        # slate-300 — 본문
  text-muted: "#94a3b8"       # slate-400 — 보조 설명
  text-faint: "#64748b"       # slate-500 — 레이블/캡션

  # ── 차트 전용 팔레트 (범주형, 채도 억제) ──
  chart-1: "#3b82f6"          # blue-500 — 종가/주선
  chart-2: "#10b981"          # emerald-500 — SMA5/보조선1
  chart-3: "#f59e0b"          # amber-500 — SMA20/보조선2
  chart-individual: "#94a3b8" # slate-400 — 개인 투자자 (중립 채도)
  chart-foreign: "#3b82f6"    # blue-500 — 외국인
  chart-institution: "#8b5cf6" # violet-500 — 기관

typography:
  h1:
    fontFamily: Pretendard
    fontSize: 1.5rem          # 24px — 페이지 제목
    fontWeight: 700
    lineHeight: 1.3
  h2:
    fontFamily: Pretendard
    fontSize: 1.125rem        # 18px — 섹션 제목
    fontWeight: 700
    lineHeight: 1.4
  h3:
    fontFamily: Pretendard
    fontSize: 1rem            # 16px — 카드 제목
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: Pretendard
    fontSize: 0.875rem        # 14px — 본문
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Pretendard
    fontSize: 0.75rem         # 12px — 보조 (최소 크기)
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Pretendard
    fontSize: 0.75rem         # 12px — 레이블
    fontWeight: 700
    letterSpacing: 0.05em
  stat-value:
    fontFamily: Pretendard
    fontSize: 1.25rem         # 20px — 통계 수치 강조
    fontWeight: 800
    lineHeight: 1.2

rounded:
  sm: 8px                     # rounded-lg — 뱃지/조밀 요소
  md: 12px                    # rounded-xl — 기본 카드
  lg: 16px                    # rounded-2xl — 강조 카드/모달

spacing:
  tight: 12px                 # p-3 — 조밀 그리드 (통계 셀)
  base: 16px                  # p-4 — 기본 카드
  emphasis: 24px              # p-6 — 강조 카드 (결론/모달)

sizing:
  touch-min: 44px             # 최소 터치 타겟 (iOS HIG 기준)
  gauge-height: 8px           # 게이지 바 높이
  icon-sm: 16px
  icon-md: 20px

components:
  card-primary:
    backgroundColor: "{colors.bg-card-raised}"
    textColor: "{colors.text-body}"
    borderColor: "{colors.border-muted}"
    rounded: "{rounded.md}"
    padding: "{spacing.emphasis}"
  card-secondary:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-body}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.md}"
    padding: "{spacing.base}"
  card-tertiary:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-muted}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.sm}"
    padding: "{spacing.tight}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: 12px
    minHeight: "{sizing.touch-min}"
  button-secondary:
    backgroundColor: "{colors.bg-card-raised}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.md}"
    padding: 12px
    minHeight: "{sizing.touch-min}"
  input:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-body}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.md}"
    padding: 12px
    minHeight: "{sizing.touch-min}"
  badge-positive:
    backgroundColor: "{colors.positive-soft}"
    textColor: "{colors.positive}"
    rounded: "{rounded.sm}"
  badge-negative:
    backgroundColor: "{colors.negative-soft}"
    textColor: "{colors.negative}"
    rounded: "{rounded.sm}"
  badge-caution:
    backgroundColor: "{colors.caution-soft}"
    textColor: "{colors.caution}"
    rounded: "{rounded.sm}"
  badge-neutral:
    backgroundColor: "#64748b18"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
---

## Overview

Stock Analyzer는 주식 지식이 없는 초보자가 "그래서 무엇을 해야 하는가"를
바로 알 수 있도록 돕는 의사결정 지원 도구다. 디자인의 목적은 화려함이
아니라 명료함이다. 모든 시각적 결정은 "초보자가 결론과 다음 행동을
더 빨리 찾을 수 있는가"라는 질문을 통과해야 한다.

핵심 원칙 세 가지:
1. **결론 우선** — 데이터보다 결론과 행동 가이드를 시각적으로 앞세운다.
2. **색의 절제** — 색은 의미가 있을 때만 쓴다. 의미색은 3~4개로 제한한다.
3. **밀도의 균형** — 정보가 많은 곳은 조밀하게, 강조할 곳은 넉넉하게.

## Colors

팔레트는 고대비 중립색(slate 계열)을 기반으로 하고, 의미를 가진 색은
엄격히 제한한다.

**의미색 (남용 금지):**
- **positive (#10b981):** 상승·긍정·수익. "좋다"는 직관과 일치하는 초록.
- **negative (#ef4444):** 하락·부정·손실. "주의"의 신호인 빨강.
- **accent (#2563eb):** 버튼·링크 등 상호작용 요소 **전용**. 정보 표시에는
  절대 쓰지 않는다. 사용자가 파란 요소를 보면 "누를 수 있다"고 학습하게 한다.
- **caution (#f59e0b):** 관망 상태, 백테스팅 전 미검증 데이터 등 제한적 경고.

**왜 색을 제한하는가:** 초보자는 색이 많을수록 "각 색이 무슨 의미인지"를
학습해야 한다. 매매동향 차트에서 개인/외국인/기관을 노랑/분홍/보라로
칠하면, 사용자는 색과 주체를 매핑하느라 인지 부하가 늘어난다. 정보의
위계는 색이 아니라 명도(slate 계층)로 표현하는 것이 원칙이다.

**소프트 배경색:** positive-soft, negative-soft 등 10% 불투명도 변형은
뱃지·강조 영역 배경으로 쓴다. 원색 배경은 텍스트 대비를 해치므로 금지한다.

## Typography

한글 가독성을 위해 Pretendard를 기본 폰트로 한다(시스템 폰트 fallback:
-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif).

**최소 폰트 크기는 body-sm(12px)다.** 그보다 작은 임의값(10px, 11px)은
전면 금지한다. 더 낮은 위계가 필요하면 크기를 줄이는 대신 색상
(text-muted → text-faint)으로 표현한다. 이는 초보자·고령 사용자의
가독성을 보장하기 위한 접근성 규칙이다.

**수치 강조:** 통계 수치(현재가, 수익률 등)는 stat-value(20px, 800)로
본문과 명확히 구분한다. 초보자는 "숫자"를 먼저 보므로 수치의 위계를 높인다.

## Layout

**패딩은 3단계로만 쓴다:**
- **tight (12px):** 통계 그리드처럼 정보 밀도가 중요한 곳.
- **base (16px):** 일반 카드 (기본값).
- **emphasis (24px):** 결론 카드·모달처럼 강조가 필요한 곳.

도미노 같은 앱이 한 화면에 9개 지표를 보여줄 때, 우리가 4개 카드를
스크롤하게 만들면 초보자는 지친다. 통계는 tight 패딩의 3열 그리드로
압축해 "한눈에" 보여준다.

**반응형:** 모바일(<768px)은 단일 컬럼. 통계 그리드는 모바일 3열 유지
(수치가 짧아 3열이 가능). 종목 상세의 우측 사이드바(포트폴리오 추가)는
모바일에서 결론 카드 직후로 끌어올린다.

## Elevation & Depth

카드 위계는 **그림자가 아니라 배경 명도**로 표현한다. 다크 테마에서는
명도 차이가 그림자보다 위계를 명확히 전달한다.

- **primary (bg-card-raised, slate-800):** 결론 카드, 오늘의 액션 등
  최우선 정보. 추가로 border-l-4 컬러바(의견에 따라 emerald/red/slate)로 강조.
- **secondary (bg-card, slate-900):** 차트, 지표, 뉴스 등 일반 정보. 기본값.
- **tertiary (bg-inset, slate-950):** 카드 내부 함몰 영역(통계 셀, 입력창).

그림자(box-shadow)는 버튼 호버 등 인터랙션 피드백에만 최소한으로 쓴다.

## Shapes

라운딩은 sm(8px)·md(12px)·lg(16px) 3단계만 쓴다. rounded-3xl(24px)
같은 과도한 라운딩은 카드가 차지하는 공간을 늘려 정보 밀도를 떨어뜨리므로
지양한다. 뱃지는 sm, 카드는 md, 모달·강조 카드는 lg를 쓴다.

## States

인터랙티브 요소는 아래 상태를 반드시 시각화한다:
- **hover:** accent → accent-hover, 또는 배경 명도 한 단계 상승.
- **focus:** border-focus(blue-600) 링. 키보드 접근성 필수.
- **disabled:** 불투명도 50%, 커서 not-allowed.
- **active(선택됨):** accent 배경 + text-primary. 탭·프리셋 버튼 등.

## Components

- **card-primary:** 결론 카드, 오늘의 액션 — 최우선 정보.
- **card-secondary:** 차트, 지표, 뉴스, 재무 — 일반 정보.
- **card-tertiary:** 통계 셀, 입력창 배경 — 함몰 영역.
- **button-primary:** 주요 액션(상세 분석, 포트폴리오 등록). accent 배경.
- **button-secondary:** 보조 액션(관심 추가, 취소). 중립 배경.
- **badge-*:** 시장 의견, 수익률 방향, 알림 타입. soft 배경 + 의미색 텍스트.

모든 버튼·입력·탭은 최소 44x44px 터치 타겟을 지킨다.

## Do's and Don'ts

- ✅ 의미색은 positive/negative/accent/caution 4개 이내로 제한
- ✅ 정보 위계는 색이 아니라 slate 명도로 표현
- ✅ 최소 폰트 body-sm(12px), 낮은 위계는 색상으로 보완
- ✅ 결론·행동 가이드를 card-primary로 최상단 배치
- ✅ 통계는 tight 패딩 3열 그리드로 압축
- ✅ 모든 인터랙티브 요소 44x44px 터치 타겟 + focus 링
- ✅ accent(blue)는 "누를 수 있는 것"에만 사용
- ❌ text-[10px], text-[11px] 등 12px 미만 임의값 금지
- ❌ rounded-3xl(24px) 남발 금지
- ❌ 정보 표시에 accent(blue) 색상 사용 금지 (상호작용 전용)
- ❌ 한 화면에 의미색 5개 이상 동시 사용 금지
- ❌ 원색 배경(불투명 100%) 위에 텍스트 배치 금지 (soft 변형 사용)
- ❌ 위계 표현에 box-shadow 의존 금지 (배경 명도로 표현)