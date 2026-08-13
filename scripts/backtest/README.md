# Phase 4 세션 1 — 백테스팅 하네스

## 무엇인가 / 무엇이 아닌가

- **이다**: MarketOpinion 채점 축이 forward return과 관계가 있는지 재는 **내부 임계값 보정 도구**.
- **아니다**: 사용자에게 보여줄 "오르는 확률". 결과는 내부 문서에만 남긴다. UI·R2 원칙은 불변이고,
  `computeProbability`는 폐기된 상태 그대로다(부활 없음).

## 실행

```bash
DATABASE_URL='postgres://...' node scripts/backtest/run.mjs
```

설정은 전부 `config.mjs` 상단에 고정돼 있다. **커맨드라인 플래그가 없다** — 값을 바꾸려면 파일을
고치고 그 diff를 리포트에 남긴다(플래그로 슬쩍 바꾸면 어떤 설정으로 만든 숫자인지 추적이 끊긴다).

산출물은 `scripts/backtest/out/`(gitignore):

| 파일 | 내용 |
|---|---|
| `ic.csv` / `ic.json` | 축 × 호라이즌 × 구간별 Rank IC·t·p·ICIR |
| `buckets.csv` | 점수 버킷별 forward return 분포(평균·중앙·IQR·승률) |
| `observations.csv` | 원시 표본 (종목·신호일·축점수·forward return) |
| `meta.json` | 설정·표본수·제외 사유·캐비엇·재현 커맨드 |

## 세션 1이 재는 것 — 10점 중 5점뿐

| 축 | 점수 | point-in-time 재구성 | 이유 |
|---|---|---|---|
| 기술 | 0~3 | ✅ | `stock_history`만 쓴다 |
| 추세 | 0~2 | ✅ | sma5·sma20 = `stock_history` |
| 수급 | 0~2 | ❌ **미검증** | `investor_history`가 2026-03-18부터 ~5개월. 과거 시점 t에 데이터가 없다 |
| 밸류 | 0~3 | ❌ **미검증** | `calculateValuationScore`가 `stocks` **현재 스냅샷** PER/PBR/ROE + peer 현재 중앙값 → look-ahead |

**두 축을 더해 하나의 IC로 보고하지 않는다.** 축별 독립 IC가 1차 산출물이다.
`partialSum`(기술+추세, 0~5)은 참고로만 내고 출력에 `*` 표시가 붙는다 —
**MarketOpinion 7/4 컷 검증이 아니다**(합의 절반만 재구성됐다).

## 프로덕션과 같은 계산을 쓰는가

쓴다. `server/domains/analysis/scoring.js`에서 계산부를 순수 함수로 떼어냈다:

- `computeTechnicalFromHistory(historyAsc)` — `calculateTechnicalScore`가 DB 조회 후 이 함수에 위임.
- `calculateTrendScore(price, sma5, sma20)` — 원래부터 순수.
- SMA는 `server/domains/stock/service.js`의 `getSMA`와 동일 정의(최근 N개 종가 평균을 `Math.round`).

동치 테스트(`tests/backtest/scoringEquivalence.test.ts`)가 두 경로의 반환값이 **완전히 같은지**
고정한다. 이건 리팩터링 안전망이 아니라 **하네스의 전제 조건**이다 — 다른 걸 재면 IC가 무의미하다.

> ⚠️ `computeTechnicalFromHistory`는 배열 **길이 전체**에 의존한다(MACD 루프가
> `prices.length - 20`에서 시작). 그래서 하네스는 `history[0..i]` 접두를 **통째로** 넘긴다.
> 최근 46봉만 잘라 넣으면 값이 달라진다(테스트로 고정).

## 누수 차단

| 항목 | 처리 |
|---|---|
| 신호 | `series[0..i]`(포함)만 본다. `signalsAt` 밖에서 미래 인덱스를 만지지 않는다 |
| 워밍업 | `i >= MIN_WARMUP`(60) — MACD 26봉·볼린저 20봉 |
| forward return | 엄격히 `price[i+N] / price[i] - 1`. `i+N`이 끝을 넘거나 종가 결측이면 **표본 제외**(억지 채움 금지 — 폐지·정지 종목 손실이 0으로 둔갑한다) |
| 초과수익 | 같은 **캘린더 구간** KOSPI 변화율. 벤치 결측이면 초과수익 IC에서만 제외 |
| sacred holdout | 신호일 마지막 20%는 봉인. 상수 조정은 학습 구간에서만 |
| 중첩 | 신호일 그리드 `STEP_DAYS`(5) + Newey-West 보정 t(`overlapLag` 열에 lag 표기) |
| 다중검정 | 축 2 × 호라이즌 3 = 6검정 → BH 보정 p를 **원 p와 함께** 보고 |

누수 가드는 테스트로 직접 검사한다 — `signalsAt(series, i)`가 `series[i+1..]`를 통째로 조작해도
값이 변하지 않는지(`tests/backtest/pipeline.test.ts`).

## 측정 정의

- **Rank IC**: 날짜별 **횡단면** Spearman을 먼저 구하고 그 시계열을 평균(표준 정의).
  한 덩어리로 넣으면 종목 수 많은 날이 가중되고 시장 공통 움직임이 상관으로 샌다.
- **ICIR(연)** = `(평균IC / 표준편차) × √(252 / N)`. 연환산은 **독립 기간 수** 기준.
- **t(NW)**: Bartlett 커널 Newey-West. `lag = floor((N-1)/STEP)`.
- **p값**: 표본 날짜 수가 커 **정규 근사**(t분포 아님).
- **버킷**: 점수 구간별 forward return 분포. 단조성은 "이 축이 forward 신호를 갖는가"의
  **필요조건 점검**이지 컷 판정이 아니다.

## 캐비엇 (리포트에 반드시)

- **수정주가 아님** — `stock_history.price`는 액면분할·배당 미조정(INTEGER). 대형주 위주라 영향이
  제한적이나 개별 종목 forward return 왜곡 가능.
- 중첩된 forward 창 → 순진한 t는 부풀려진다. NW 보정 t를 함께 본다.
- 표본은 유니버스 178종목·특정 기간 — 일반화 한계.
- 밸류·수급 **미검증**. 10점 중 5점만 재구성됐다.

## 후속 (이 세션 범위 밖)

1. **KRX 투자자 어댑터** → `investor_history` 3년 backfill → 수급축 활성화(로드맵 Phase 6).
2. **밸류 역산 스파이크**: `dart_financials` → 과거 EPS/BPS × 과거 가격 → point-in-time PER/PBR.
   발행주식수 이력·과거 peer 중앙값 해결 필요.
3. 둘 다 확보되면 **전체 10점 7/4 컷을 그때 검증**. 이 하네스 골격을 그대로 재사용한다.
