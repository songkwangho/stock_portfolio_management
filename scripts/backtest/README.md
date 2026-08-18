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

---

# 세션 2 — HoldingOpinion 백테스트

```bash
DATABASE_URL='postgres://...' node scripts/backtest/run_holding.mjs
```

산출물: `out/holding_states.csv` · `out/holding_policy.csv` · `out/holding_meta.json`.

## 왜 IC가 아닌가

HoldingOpinion은 연속 점수가 아니라 **범주 결정**('보유'/'추가매수'/'관망'/'매도')이고
`avgPrice`(사용자 진입가)에 의존한다 → 종목 랭킹이 아니라 **포지션별 결정**이다. 그래서:

| Part | 무엇 | 진입가 |
|---|---|---|
| A | MA-상태 → forward 분포 | 무관 |
| B | 실제 규칙을 exit 트리거로 돌린 정책 시뮬 vs 매수후보유 + θ 스윕 ★ | 의존 |
| C | `near5MA`('추가매수')가 baseline보다 오르는가 | 무관 |

## 프로덕션 규칙을 복제하지 않는다

- `production` 정책은 `calculateHoldingOpinion`을 **그대로 호출**한다.
- θ 스윕 변종만 별도 구현하고, **θ=−0.07 & 이중이탈 on 에서 프로덕션과 같은 결정을 내는지**
  테스트(`variantMatchesProduction`, 300+ 그리드)와 **런타임 대조** 둘로 고정한다.
  런너는 `production` vs `stop-0.07_dbd` 전 셀이 동일한지 출력한다.

## 해석 원칙 (미리 고정)

- **손절은 평균이 아니라 왼쪽 꼬리(p5·최소)로 판정한다.** 손절은 보통 평균을 낮추고 대신 큰
  손실을 자른다 — 평균만 보면 "손절이 수익을 깎는다"는 오독이 나온다. `polP5 − bhP5` 교환을 본다.
- θ 스윕이 −0.07을 변곡점으로 지지하지 않으면 **"임의값 → 재보정 후보"**로 기록한다.
  재보정 값은 **봉인 구간 밖에서만** 고른다.
- 이중이탈 매도는 세션 1의 추세축 역방향 관찰(정배열 1.34% < 양 이평선 아래 2.03%)과 대조해 읽는다.

## 구조적 성질 — 합성 스모크에서 미리 확인한 두 가지

실측 규모는 운영자 실행에서 확정되지만, 표 읽는 법이 달라지므로 미리 적는다.

1. **이중이탈이 켜져 있으면 손절보다 거의 항상 먼저 발동해 θ 스윕이 통째로 흡수된다.**
   합성 25종목에서 `production` 청산 1,118건 중 **손절 0 / 이중이탈 1,118**.
   → θ의 효과는 `*_only`(이중이탈 off) 계열에서만 보인다. `*_dbd` 계열이 전부 같은 값이면
   버그가 아니라 이 성질이다.
2. **진입 시점에 이미 `doubleBreakdown`인 표본**(합성 38%)은 다음날 바로 청산돼 "정책"이 사실상
   1일 보유가 된다 → 헤드라인 평균이 그 표본에 끌려간다.
   → Part B에 `entryFilter` 축(`all` / `notSellAtEntry`)을 둬 분리해서 본다.

## 정책 목록

| 이름 | θ | 이중이탈 | 비고 |
|---|---|---|---|
| `production` | −0.07 | on | `calculateHoldingOpinion` 직접 호출 |
| `stop-0.05_dbd` … `stop-0.15_dbd` | 스윕 | on | 프로덕션 형태의 θ 스윕 |
| `stop-0.05_only` … `stop-0.15_only` | 스윕 | **off** | 손절 단독 효과 분리 |
| `dbd_only` | 없음(−∞) | on | 이중이탈 단독 효과 분리 |

## 누수 차단 (세션 1 골격 계승)

- exit 판정은 j 오름차순으로 진행하고 **각 j에서 ≤ j만** 본다(`price[j]`·`sma5_j`·`sma20_j`).
  `i+1..i+N` 스캔은 미래를 보는 게 아니라 순차 진행이다.
- 테스트가 직접 검사한다: 트리거 이후 봉을 3배로 조작해도 결정·수익이 불변,
  청산 전 경로를 바꾸면 결정이 달라진다(가드 비공회전).
- `precomputeSmas`(런너 성능 최적화) 경로가 즉석 `smaAt` 경로와 **같은 결과**인지도 고정한다.

## 청산 실행 지연 — `EXIT_LAG_DAYS = [0, 1]`

지시문에 없던 축을 추가했다. `lag 0`(트리거 당일 종가 청산)은 **낙관적**이다 — 종가는 장이
끝나야 아는데 그 종가로 파는 셈이고, 게다가 프로덕션은 **어제 종가로 판정해 다음날 08:00에
알림**을 준다(alert 스케줄) → 실사용자는 최소 1일 지연으로 움직인다. 손절 효과가 지연에
얼마나 민감한지가 "−7%가 하방을 지킨다"는 결론의 강건성을 좌우하므로 **둘 다 낸다**.

## 수정주가 캐비엇 — Part B에 특히 치명적

`stock_history.price`는 수정주가가 아니다. **2:1 액면분할은 하루에 −50%로 보이고, 그러면
−7% 손절이 거짓 발동한다.** 두 겹으로 스크리닝한다:

- `dart_disclosures.report_nm` 직접 매칭 — 주식분할·액면분할·주식병합·액면병합·무상증자·주식배당.
  (파생 필드 `category`를 쓰지 않는 이유: dartCategory 규칙이 '주식분할결정'을 `merger`로 넣는데
  거긴 합병·영업양수도 섞여 있어 정밀하지 않다.)
- 일일 가격제한폭(±30%) **밖** 단일일 하락 → 기계적 변동 의심으로 별도 카운트.

`SPLIT_SCREEN='exclude'`면 의심 표본을 1차 표에서 빼고 건수를 따로 보고한다.
완전하지 않다 — 공시 미적재 종목·배당락은 여전히 남는다(`holding_meta.json` 캐비엇에 명시).

---

# 세션 3 — 수급(플로우) 축

```bash
# 1) 투자자 이력 backfill (운영자 수동, ≈35분)
DATABASE_URL='...' node scripts/backfill-investor-history.js --dry-run --limit 2   # 먼저 확인
DATABASE_URL='...' node scripts/backfill-investor-history.js                        # --resume 지원

# 2) 수급축 포함 재실행 (세션 1과 같은 러너)
DATABASE_URL='...' node scripts/backtest/run.mjs
```

## Step 0 게이트 — 소스가 지시문 전제와 다르다

`node scripts/probe-krx-capability.mjs` (DB·키 불필요)로 실측한 결과:

| 경로 | 투자자 3년 이력 |
|---|---|
| KRX Open API (openapi.krx.co.kr) | **데이터 없음** — 서비스 40여 종에 투자자별 항목 자체가 없다 |
| data.krx MDC (`MDCSTAT02303`) | 데이터는 있으나 **본인인증 회원 로그인 필수**(2026 회원체계 변경). 익명은 전 화면 HTTP 400 `LOGOUT` |
| **네이버 `frgn.naver` `&page=N`** | **가능** — page 37이 3년 전 도달. 인증·신규 의존성 0 ← 채택 |

⇒ `server/scrapers/krx.js`(KRX_API_KEY)는 **만들어도 동작할 수 없다.** 대신 이미 쓰는 네이버
소스에 페이지네이션을 붙인 `server/scrapers/naverInvestor.js`를 만들었다. 인터페이스는
`fetchInvestorHistory(code, opts)`로 고정 — 훗날 KRX 계정을 도입하면 같은 시그니처로 갈아끼운다.

⚠️ 이 경로는 네이버라 **단일소스 리스크는 해소되지 않는다**. 수정주가도 KRX 계정에 묶여 있다
(`docs/ADR-001-adjusted-prices.md`).

## 시점 t 슬라이스 — `supplyAt`

```
investorAsc → (date ≤ t 필터) → 최근 SUPPLY_LOOKBACK_ROWS(20)행 → reverse(DESC) → computeSupplyDemandFromRows
```

프로덕션(`calculateSupplyDemandScore`)은 `ORDER BY date DESC LIMIT 20`으로 최신 20행을 같은
순수 함수에 넘긴다. 하네스는 '최신'을 **시점 t 기준**으로 다시 정의할 뿐 계산은 동일하다
(`tests/backtest/supplyEquivalence.test.ts`가 DB 경로 == 순수 코어를 고정. pg가 BIGINT를
문자열로 돌려주는 것까지 재현해 `Number()` 캐스팅이 살아 있는지도 잰다).

## 창이 안 차면 **점수를 내지 않는다** — `SUPPLY_MIN_ROWS`

프로덕션은 3행만 있어도 점수를 내고, 3행 미만이면 `{total: 0}`을 돌려준다. 그 0은
**"순매수가 없었다"와 구분되지 않는다.** 백테스트에서 그대로 두면 backfill 경계 근처가
전부 0으로 채워져 IC를 통째로 오염시킨다.

→ 창(20행)이 안 차면 `supplyDemand: null` + `supplyReason`을 남기고 **그 표본은 수급 IC에서만
빠진다**(기술·추세는 그대로 쓰인다). `groupByDate`·`bucketStats`가 비유한값을 이미 거른다.
억지 채움 금지 — 세션 1 규율 그대로.

## 해석 경고 — 동시대(contemporaneous) 문제

수급은 플로우와 수익이 **같이 움직이는** 성질이 있다. forward는 엄격히 `t+1` 이후라
계산상 누수는 없지만, **IC가 양(+)이어도 "예측"인지 "동행의 잔향"인지 이 설계로는 구분되지
않는다.** 결과 해석에 반드시 함께 적는다(`meta.caveats`에 박아 뒀다).

## 축 정의 불변

`partialSum`은 세션 3에서도 **기술+추세(0~5)** 그대로다. 수급을 더하면 세션 1과 같은 이름의
다른 숫자가 되어 두 세션 결과를 나란히 못 놓는다. 수급은 **독립 축**으로만 보고한다.
밸류(0~3)는 여전히 공란이라 **10점 7/4 컷은 아직 판정하지 않는다** — 컷은 10점 합에 걸린 값이다.

---

# attention 사건성 프록시 (부수 검증)

```bash
DATABASE_URL='...' node scripts/backtest/run_attention.mjs
```

## ⚠️ 해석이 세션 1~3과 **반대**다

세션 1~3은 **방향 예측**(점수 vs 부호 있는 수익)을 쟀고 전부 무신호~역방향이었다.
attention 현저성의 목적은 다르다 — 조언·예측이 아니라 **"지금 볼 것"의 트리아지**다.

| | 세션 1~3 | 이 검증 |
|---|---|---|
| target | forward return (부호 有) | **\|forward return\|** (사건 크기) |
| 좋은 결과 | — (무신호로 확정) | **양(+) IC** |
| 질문 | 오를까? | 크게 움직일까? (방향 무관) |

**양(+)이면 트리아지 정상 작동**(현저성 상위가 실제로 크게 움직였다). 음(−)/무신호면
"현저성 랭킹이 사건성과 무관" → `scoreFloor`·가중치 재검토.

**동시대성(변동성 클러스터링)은 여기선 바람직하다** — 지금 크게 움직인 종목이 계속 크게
움직이는 걸 잡는 게 트리아지의 목적이다. 세션 3의 "동행 위양성" 우려가 여기선 **원하는 성질**.

## 부분 검증 — 시장 관찰분 2개만

| 컴포넌트 | 재구성 | 이유 |
|---|---|---|
| move (\|5거래일 수익률\|) | ✅ | `stock_history` |
| disc (공시 최신성×건수) | ⚠️ 조건부 | `dart_disclosures` 깊이에 의존 |
| unrl (\|미실현\|) · stake (비중) | ❌ 제외 | 사용자 포지션 의존 — "이 종목이 얼마나 사건적인가"가 아니라 **"나에게 얼마나 중요한가"** |

`held: false`로 넘기면 unrl·stake 컴포넌트가 0을 반환한다(프로덕션 함수 그대로).
→ **"현저성 전체"가 아니라 "시장 관찰 컴포넌트가 사건을 잡나"까지만** 답한다.

## DART 유무에 robust

`dart_disclosures`가 **없거나 비어 있어도 중단하지 않는다.** 러너가 스스로 깊이를 실측하고
(§Step 0 게이트) 세 갈래로 갈린다:

1. **미적재** → disc 축 미보고, `moveOnly`가 1차 산출물. salience는 disc=0이라 moveOnly와 동일.
2. **적재됐으나 얕음**(공시 붙은 시점 < `ATTENTION_MIN_DISC_POINTS`) → 동일. disc가 사실상 상수 0이라 Rank IC가 무의미하다.
3. **충분** → `salience`·`moveOnly`·`discOnly` 3축. disc·salience는 **공시 커버 구간**(`minDate` 이후)에서만 재고, **move는 전 구간 + 같은 커버 구간 둘 다** 낸다 — 구간이 다르면 대소를 견줄 수 없다.

## 누수 차단

- 가격: `series.slice(0, i+1)` 접두만. `computePriceStats`는 **뒤에서부터 고정 개수**만 보므로
  접두 길이에 의존하지 않는다(`computeTechnicalFromHistory`의 MACD 길이 의존과 다른 성질 — 테스트로 고정).
- 공시: `disclosuresAsOf`가 `[t − discLookbackDays, t]`로 자른다. **상한 `≤ t`가 이 축의 누수 차단 지점**이다
  (프로덕션은 today가 곧 상한이라 하한만 건다).
- 테스트가 직접 검사: t 이후 봉·공시를 조작해도 값 불변 / 창 안을 바꾸면 값 변동(비공회전).

## 관찰-only의 구조적 상한

noisy-OR에서 move 단독 최대는 `w_move = 0.45`, move+disc 최대는 `0.5875`다.
unrl(0.85)·stake(0.70)를 뺐으므로 **상위 버킷([0.50,1.00])이 비어 있는 게 정상**이다 — 결함이 아니다.

프로덕션 노출 문턱(`scoreFloor = 0.15`) 환산: 공시가 없으면 **\|5거래일 수익률\| ≥ 5%** 여야 블록에 뜬다.

## 측정 체인 양성 대조

"양(+)이 좋은 결과"라는 해석이 서려면 파이프라인이 실제 양(+)을 잡아내야 한다.
합성 패널 두 개로 감도를 고정한다 — 현저성이 \|move\|를 끌면 IC > 0.4, 독립이면 \|IC\| < 0.1.
(이게 없으면 라이브에서 0이 나왔을 때 "신호 없음"인지 "배선 오류"인지 못 가른다.)
