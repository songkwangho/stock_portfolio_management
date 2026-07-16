---
version: beta
name: Stock Analyzer
description: 한국 주식 초보자를 위한 의사결정 지원 라이트 테마 디자인 시스템 (3.13차 리디자인)
colors:
  # ── 표면 (light) ──
  paper: "#FAFAF8"          # 페이지 배경 — 종이 톤 (순백보다 눈부심 완화)
  surface: "#FFFFFF"        # 카드 표면
  inset: "#FAFAF8"          # 함몰 영역 (카드 아님 — 배경과 동일면)

  # ── 잉크 / 텍스트 계층 ──
  ink: "#17181C"            # 본문 + 주요 버튼 배경 (near-black)
  muted: "#6E7076"          # 보조 텍스트
  faint: "#85878D"          # 캡션·단위·타임스탬프 (최소 위계, WCAG AA-large)

  # ── 의미색 (한국 증시 관습) ──
  rise: "#D91C1C"           # 상승·수익·긍정·매수방향 (빨강) — WCAG AA 5.08:1
  fall: "#1B5FD0"           # 하락·손실·부정·매도방향 (파랑) — WCAG AA 5.84:1
  caution: "#9A5B08"        # 관망·미검증 데이터 — 비방향성 경고 (앰버 계열) — AA 5.42:1

  # ── 선 ──
  line: "#E7E7E3"           # 기본 구분선·테두리
  line-strong: "#D4D4CE"    # 강조 구분선

  # ── 소프트 배경 (뱃지·강조 영역, 원색 대신 틴트) ──
  rise-soft: "#D91C1C14"    # rise 8%
  fall-soft: "#1B5FD014"    # fall 8%
  caution-soft: "#9A5B0814" # caution 8%

  # ── 차트 팔레트 ──
  # 방향(등락)은 rise/fall, 방향 무관(종가선·이평선)은 무채색, 범주(투자주체)는 무채색 계조.
  chart-price: "#17181C"    # 종가선 = ink (방향 무관)
  chart-sma5: "#D91C1C"     # 5일 이평선 = rise 계열 (단기)
  chart-sma20: "#9A5B08"    # 20일 이평선 = caution 계열 (중기)
  chart-rise: "#D91C1C"     # 골든크로스·상승 거래량
  chart-fall: "#1B5FD0"     # 데드크로스·하락 거래량
  chart-individual: "#85878D"  # 개인 = faint (범주, 무채색)
  chart-foreign: "#17181C"     # 외국인 = ink
  chart-institution: "#6E7076" # 기관 = muted

typography:
  display:
    fontFamily: Pretendard
    fontSize: 2.25rem        # 36px — 히어로 수치
    fontWeight: 800
    lineHeight: 1.1
  h1:
    fontFamily: Pretendard
    fontSize: 1.5rem         # 24px
    fontWeight: 700
    lineHeight: 1.3
  h2:
    fontFamily: Pretendard
    fontSize: 1.125rem       # 18px
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: Pretendard
    fontSize: 0.875rem       # 14px
    fontWeight: 400
    lineHeight: 1.6
  sm:
    fontFamily: Pretendard
    fontSize: 0.75rem        # 12px — 최소
    fontWeight: 400
    lineHeight: 1.5
  numeric:
    # 모든 금융 수치는 tabular figures. 표·목록에서 자릿수가 세로로 맞아야 한다.
    fontFeatureSettings: "'tnum'"
    fontVariantNumeric: tabular-nums

rounded:
  sm: 6px                    # 뱃지
  md: 10px                   # 기본 카드
  lg: 14px                   # 모달·강조

spacing:
  tight: 12px
  base: 16px
  emphasis: 24px

components:
  card-primary:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line-strong}"
    shadow: sm
    rounded: "{rounded.md}"
    padding: "{spacing.emphasis}"
  card-secondary:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.md}"
    padding: "{spacing.base}"
  card-tertiary:
    backgroundColor: "{colors.inset}"
    borderColor: none
    rounded: "{rounded.sm}"
    padding: "{spacing.tight}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    minHeight: 44px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-strong}"
    rounded: "{rounded.md}"
    minHeight: 44px
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    minHeight: 44px
  badge-rise:
    backgroundColor: "{colors.rise-soft}"
    textColor: "{colors.rise}"
    rounded: "{rounded.sm}"
  badge-fall:
    backgroundColor: "{colors.fall-soft}"
    textColor: "{colors.fall}"
    rounded: "{rounded.sm}"
  badge-caution:
    backgroundColor: "{colors.caution-soft}"
    textColor: "{colors.caution}"
    rounded: "{rounded.sm}"
  badge-neutral:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.muted}"
    borderColor: "{colors.line}"
    rounded: "{rounded.sm}"
---

## Overview

Stock Analyzer는 주식 지식이 없는 초보자가 "그래서 무엇을 해야 하는가"를 바로
알 수 있도록 돕는 의사결정 지원 도구다. 3.13차에서 다크(slate+blue) 테마를
**라이트 테마 + 한국 증시 색 관습**으로 전환했다.

핵심 원칙:
1. **사용자의 세계에 맞춘다** — 타깃은 토스증권·네이버금융·삼성증권을 쓰는 한국
   초보 투자자다. 이들 앱은 전부 라이트이고, 상승은 빨강·하락은 파랑이다.
2. **색은 의미가 있을 때만** — 빨강/파랑은 가격 방향에 예약한다. 그 외 요소는 무채색.
3. **위계는 크기와 면으로** — 다크에서 명도로만 위계를 표현하던 방식을 버리고,
   라이트에서는 카드의 면·그림자·타이포 크기로 위계를 만든다.

## Why Light

기존 다크 slate+blue는 "AI가 만든 대시보드"의 기본값이지 사용자의 세계가 아니다.
한국 개인 투자자가 매일 보는 화면(토스증권·네이버금융)은 전부 흰 바탕이고,
빨강/파랑 호가는 흰 배경에서만 선명하게 대비된다. 라이트 전환은 취향이 아니라
사용자가 이미 학습한 시각 문법에 맞추는 것이다.

## Korean Market Colors (핵심)

**상승·수익·긍정 = 빨강(rise), 하락·손실·부정 = 파랑(fall).**

기존 코드는 emerald(초록)=상승 / red=하락의 **미국 관습**을 썼다. 그 결과 한 화면에서
빨강이 "올랐다"(시장 온도 게이지)이자 "잃었다"(손익 숫자)로 모순되게 쓰였다.
한국 사용자에게 빨간 -40%는 순간 "올랐네"로 오독된다.

- **rise (#D91C1C):** 상승·수익·플러스 수익률·market_opinion 긍정·매수 방향.
- **fall (#1B5FD0):** 하락·손실·마이너스 수익률·market_opinion 부정·매도 방향·관망은 아님.
- **caution (#9A5B08):** 관망·미검증 데이터·stale·집중도 경고 등 **방향이 없는** 경고.
- **무채색(ink/muted/faint):** 중립 의견·투자 주체 범주·방향 무관 요소.

## No Accent

인터랙션 전용 accent 색(파란 버튼)을 두지 않는다. 파랑은 이미 "하락"에 예약됐으므로
파란 버튼은 의미색과 충돌한다. **주요 버튼은 ink(near-black)** 를 쓴다 — 흰 바탕 위
검정 버튼은 의미색과 경쟁하지 않고, 액션임이 분명하다. 링크는 ink + underline 또는 muted.

## Typography

Pretendard 유지. **모든 금융 수치는 tabular-nums**(`font-variant-numeric: tabular-nums`) —
금융앱의 콘텐츠는 숫자이고 표·목록에서 자릿수가 세로로 맞아야 한다. 히어로 수치는
display(36px, 800). 최소 폰트는 sm(12px), 그보다 작은 임의값(10/11px) 금지 —
낮은 위계는 크기가 아니라 색(muted→faint)으로.

## Elevation (light)

라이트에서 위계는 명도가 아니라 **면과 그림자**로 표현한다.
- **primary:** surface(흰색) + line-strong 테두리 + shadow-sm. 히어로·결론 카드.
- **secondary:** surface + line 테두리. 차트·지표·신호. 기본값.
- **tertiary:** inset(paper와 동일면) + 테두리 없음. 통계 셀·함몰 영역 — 카드가 아니다.

## Icons & Emoji

- **이모지 전면 금지.** 섹션 제목의 📋🔍📊💡⚠️🎯✅ 등은 AI 생성물의 지문이다. 삭제하되
  아이콘으로 대체하지 않는다 — 제목 텍스트만 남긴다.
- **아이콘은 동작을 대신할 때만.** 삭제=휴지통, 외부링크=화살표, 뒤로=화살표, 검색=돋보기,
  알림=종, 아코디언=셰브런, 닫기=X, 새로고침=회전. 글자 옆 장식 아이콘(TrendingUp/Zap/
  ShieldCheck/Sparkles 등) 금지.
- **첫 글자 아바타 금지.** `유유제약 → (유)` 동그라미는 Slack/Notion 관습이다. 주식앱은
  그 자리에 **종목코드**를 둔다.
- **그라디언트 금지.** 단색으로.

## Cards

"실제로 묶여야 할 것만 카드." 목록은 구분선(divide-y divide-line), 표는 표 자체가 구조다.
카드로 유지: 히어로, 결론 카드, 신호 요약, 차트. 카드 해체: 뉴스 목록, 재무 테이블,
섹터 비교 테이블, 통계 셀(tertiary).

## Shapes

rounded sm(6)/md(10)/lg(14). 기존 8/12/16보다 한 단계씩 줄였다. rounded-3xl(24px) 금지 —
과도한 라운딩은 카드 점유 공간을 늘려 정보 밀도를 떨어뜨린다.

## Do's and Don'ts

- ✅ 상승/수익 = 빨강(rise), 하락/손실 = 파랑(fall) — 한국 증시 관습
- ✅ 방향 없는 경고 = caution, 중립·범주 = 무채색
- ✅ 주요 버튼 = ink (accent 없음)
- ✅ 금융 수치 = tabular-nums
- ✅ 위계는 크기·면·그림자로 (명도 밴드 금지)
- ✅ 카드는 묶일 것만, 목록/표는 구분선
- ❌ emerald(초록) 사용 금지 (미국 관습)
- ❌ 파란 버튼 금지 (fall과 충돌)
- ❌ 이모지·장식 아이콘·첫글자 아바타·그라디언트 금지
- ❌ text-[10/11px], rounded-3xl 금지
