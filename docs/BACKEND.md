# Backend Documentation

## 개요

- **상태**: 재개발 대상 아님 — 기존 코드 그대로 유지
- **진입점**: `server/server.js` (~80줄 컴포지션 루트)
- **포트**: 3001
- **DB**: PostgreSQL (`pg` Pool) — Neon 무료 플랜, `DATABASE_URL` 환경변수 필수
- **보안**: CORS 화이트리스트 + express-rate-limit (120req/min)

### 재개발 시 변경 사항

```
FRONTEND_URL 환경변수: Vercel 배포 URL로 업데이트 (CORS 허용)
API_BASE_URL: 프론트 Server Component에서 사용하는 서버 전용 환경변수 추가
```

### 디렉토리 구조

```
server/
├── server.js             # 컴포지션 루트 (~80줄)
├── index.js              # 진입점 래퍼
├── db/
│   ├── connection.js     # pg.Pool + query()/withTransaction()
│   ├── schema.js         # 18개 테이블 PG DDL
│   └── migrate.js        # information_schema 기반 컬럼 검증
├── helpers/
│   ├── cache.js          # getCached/setCache/invalidateCache (10분 TTL)
│   ├── deviceId.js       # getDeviceId/requireDeviceId
│   ├── sma.js            # async computeSMA(pool, code)
│   └── queryBuilder.js   # buildSetClause/buildWhereClause
├── scrapers/
│   └── naver.js          # 네이버 증권 스크래핑 (EUC-KR)
├── domains/
│   ├── analysis/
│   │   ├── scoring.js    # MarketOpinion 10점 스코어링
│   │   ├── indicators.js # RSI/MACD/볼린저 + *_available 플래그
│   │   ├── signals.js    # 3.11차 — 7종 관찰 신호 + detectCrossHistory (markers)
│   │   └── router.js     # 8 endpoints
│   ├── alert/
│   │   ├── service.js    # generateAlerts + ALERT_COOLDOWNS
│   │   └── router.js     # 4 endpoints
│   ├── portfolio/
│   │   ├── service.js    # recalcWeights (withTransaction)
│   │   └── router.js     # 8 endpoints (history·sharpe·benchmark·correlation 포함)
│   ├── watchlist/
│   │   └── router.js     # 3 endpoints
│   ├── stock/
│   │   ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│   │   ├── data.js       # registerInitialData (97종목 + 20개 추천 + 10테마 시드)
│   │   ├── directory.js  # 3.6차 — KRX stocks_directory 동기화 + self-heal 하드닝(D1~D4)
│   │   ├── history.js    # 2A — fetchHistory/upsertHistory 공용(backfill·journal 승격 공유)
│   │   └── router.js     # 12 endpoints (directory/search·directory/sync·themes 포함)
│   ├── dart/             # 4.5a차 — DART OpenAPI (재무제표·공시, DB 읽기 전용)
│   │   └── router.js     # 2 endpoints
│   ├── journal/          # 4.5b·C·T2·T3 — 거래일지·행동편향 + 유니버스 확장·승격 (CBD 분해)
│   │   ├── parsers/      # Port&Adapter: detectBroker + parseKiwoom/Toss/Samsung + normalize + index
│   │   ├── biases/       # disposition/overtrading/chasing/anchoring/avgdown (순수, metrics·flag만)
│   │   ├── universe.js   # T2 — 종목명→코드 인덱스(정확·유일 매핑만, 순수·단위테스트)
│   │   ├── roundtrip.js  # FIFO 매칭 + summarize + openLots·evaluateOpenLots (C-2)
│   │   ├── promote.js    # T3 — 보유·거래 종목 stocks 승격(동기 현재가 + 비동기 12개월 backfill)
│   │   ├── service.js    # ingest(F1 교체 + T2 디렉토리 매핑 + T3 promoteCodes) + analyze
│   │   └── router.js     # 3 endpoints
│   ├── attention/        # A차 — 주목 레이어(보유+관심 현저성 트리아지). 신규 수집 0, 조립만
│   │   ├── score.js      # 순수 — 현저성 정규화·곱 결합·바닥 컷·상위 K·dedupe (단위테스트)
│   │   ├── facts.js      # 순수 — 5거래일 수익률·거래량 배수·공시 집계·날짜 헬퍼 (단위테스트)
│   │   ├── service.js    # DB 로드만 (holdings ∪ watchlist × history × disclosures)
│   │   └── router.js     # 1 endpoint
│   └── system/
│       └── router.js     # health, market/indices, fear-greed
└── scheduler.js          # setupScheduler + setupCleanup
```

### 라우터 마운트 순서 (server.js)

```javascript
app.use('/api/alerts',    alertRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/holdings',  portfolioRouter);
app.use('/api/journal',   journalRouter);   // 4.5b — 거래일지 (prefix 전용, 충돌 없음)
app.use('/api/attention', attentionRouter); // A차 — 주목 레이어 (prefix 전용, 충돌 없음)
app.use('/api', systemRouter);    // /health, /market/indices, /market/fear-greed
app.use('/api', analysisRouter);  // /stock/:code/indicators 등
app.use('/api', dartRouter);      // /stock/:code/dart/* — stockRouter의 /stock/:code보다 먼저
app.use('/api', stockRouter);     // /stock/:code, /stocks 등
```

> `dartRouter`는 `stockRouter`보다 **먼저** 마운트돼야 `/stock/:code/dart/*`가 `/stock/:code`에 가로채이지 않음. 같은 이유로 `analysisRouter`도 `stockRouter`보다 먼저.

---

## DB 스키마 (18개 테이블)

| 테이블 | PK | 주요 컬럼 | 비고 |
|--------|-----|----------|------|
| stocks | code | name, category, price, change, change_rate, per, pbr, roe, target_price, eps_current, eps_previous | change/change_rate는 최근 2거래일 종가로 계산 |
| holding_stocks | device_id+code | avg_price (NUMERIC 14,2), weight, quantity | avg_price 소수점 보존 |
| stock_history | code+date | price, open, high, low, volume (BIGINT) | FK 없음 (대량 데이터 cascade 회피) |
| stock_analysis | code | analysis, advice, opinion (MarketOpinion), toss_url, **ai_report, ai_report_date** | ai_report* 는 Phase 5 Claude Haiku용 선행 컬럼 (3.7차). ON DELETE CASCADE |
| recommended_stocks | code | reason, fair_price, score, source (manual/algorithm) | ON DELETE CASCADE |
| investor_history | code+date | institution, foreign_net, individual (모두 BIGINT) | FK 없음 |
| **market_index_history** | symbol+date | close (NUMERIC 12,2) | 3.14차 신설. KOSPI/KOSDAQ 지수 일봉(벤치마크 초과수익 계산용). `stocks`와 FK 없음. stock_history 오염 회피 위해 전용 테이블 + close NUMERIC(지수 소수점 보존). 적재는 `scripts/sync-index-history.js`(운영자 수동). 자동 스케줄링 Phase 6 이월 |
| alerts | id (BIGSERIAL) | device_id, code, type, source (holding/watchlist), message, read | |
| watchlist | device_id+code | added_at | ON DELETE CASCADE |
| **stocks_directory** | code | name, market (KOSPI/KOSDAQ/KONEX), **type** (common/preferred/etf/etn/reit/spac, 기본 common — T1), listed_at, delisted_at, updated_at | 3.6차 신설(~2,650행). KRX 상장법인목록 파싱으로 동기화. `stocks`와 FK 없음 (디렉토리는 전 상장 종목, `stocks`는 앱 등록 종목만). 인덱스: name, market. **T1**: type 컬럼 — KIND 적재분은 전부 common, Phase 2(KRX issue 소스)에서 우선주/ETF 태깅. **D1**: 서버 시작 시 `MIN_DIRECTORY_TOTAL`(1000) 미만이면 자동 재동기화(실패로 남은 소수 행이 auto-sync를 영구 skip시키던 고착 해소). KRX 응답 가드: HTTP 200 / 본문 1,000B+ / **파싱된 종목 행 수 임계값**(E1 — 머리글 sniff 제거, 행 수가 유일 게이트) |
| **stock_themes** | (theme_id, code) | theme_name | 3.7차β 신설. 다대다 테마 매핑. code는 `stocks` FK (ON DELETE CASCADE). 10개 핵심 테마 + 대표 15종목 수동 + category 폴백 자동 시드. 인덱스: code, theme_id |
| **users** | id (BIGSERIAL) | provider, provider_id, email, nickname, legacy_device_id, created_at | Phase 5 선행. 현재 미사용 (라우트 미연결). `UNIQUE(provider, provider_id)`. 인덱스: legacy_device_id |
| **user_subscriptions** | id (BIGSERIAL) | user_id FK, status, plan, expires_at, payment_id UNIQUE, created_at | Phase 5 선행. Toss Payments 웹훅 멱등성은 payment_id UNIQUE로 확보 |
| **dart_corp_codes** | corp_code | stock_code, corp_name, modify_date | 4.5a차 신설. DART 8자리 고유번호 ↔ 종목 6자리 매핑(재무·공시 조회 선행). `stocks`와 FK 없음. 인덱스: stock_code |
| **dart_financials** | code+year+quarter+fs_div+account_id | account_nm, amount (NUMERIC 20,0), prev_amount | 4.5a차 신설. DART 재무제표. fs_div CFS(연결)/OFS(별도). account_id는 canonical(revenue/operating_income/…)로 저장(표준코드 미사용 PK 충돌 회피). 인덱스: (code, year DESC) |
| **dart_disclosures** | rcept_no | code, corp_name, report_nm, rcept_dt, flr_nm, category, rm, corp_cls | 4.5a차 신설. DART 공시. category 규칙 분류(표시용). rm=비고(정=정정/철=철회/유·코=시장). 인덱스: (code, rcept_dt DESC) |
| **journal_trades** | id (BIGSERIAL) | device_id, code, side('buy'/'sell' CHECK), quantity, price (NUMERIC 14,2), traded_at (DATE), source | 4.5b차 신설. 거래일지(행동편향 진단). **원본 CSV·PII(계좌·예수금·성명) 미저장** — 화이트리스트 컬럼만. price NUMERIC→Number() 캐스팅. 인덱스: (device_id, code, traded_at) |
| **journal_imports** | device_id | total, imported, skipped, skipped_names (TEXT[]), uploaded_at | C-1차 신설. 거래일지 적재 메타(디바이스당 1행, F1 교체 트랜잭션 안 upsert). 지속 커버리지 캐비엇용 — 제외 **건수(skipped)와 distinct 종목명(skipped_names) 분리**. resolved>0일 때만 upsert(가드) |

### stocks_directory 동기화 파이프라인

- **소스**: `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType={stockMkt|kosdaqMkt}`
  - 확장자는 `.xls`지만 실제 응답은 EUC-KR HTML(MS Office 래퍼라 `<html>`로 시작 가능 — E1로 머리글 판정 폐기)
  - 컬럼 순서(현행): 회사명(0)·**시장구분(1)**·종목코드(2)·업종(3)·주요제품(4)·상장일(5)…
  - `TextDecoder('euc-kr')` + 정규식 `<tr>/<td>` 파싱. **parseRow(1A)**: code는 stripped[2] 우선 + 끝자리 영문 허용(`/^[0-9A-Z]{6}$/` — 우선주/스팩 `00088K`류), listedAt은 날짜 패턴 셀 스캔(인덱스 고정 대신) → 컬럼 순서 재변경(시장구분 삽입처럼)에 견고
- **구현**: `server/domains/stock/directory.js`
  - `syncDirectory()` — KOSPI + KOSDAQ 연속 fetch(`fetchMarketWithRetry` — **D2**: 3회 선형 백오프 6/12s + `Referer`), UPSERT (마켓별 실패 격리)
  - `syncDirectoryIfEmpty()` — **D1**: COUNT < 1000이면 재동기화(함수명 유지, 시맨틱은 under-threshold)
- **트리거**:
  - 서버 시작 후 10초 — under-threshold면 자동 (D1)
  - **D4**: 매일 07:30 강제 재동기화(상장/상폐 반영, 08:00 `syncAllStocks` 앞)
  - **D3**: `POST /api/stocks/directory/sync`(토큰 보호) — 무료 Render(Shell 불가)에서 재적재 수동 레버
  - 수동 CLI: `DATABASE_URL=... node scripts/sync-directory.js`

**용도**: `/settings` 수동 추가에서 종목명 → 코드 매핑. 네이버 금융 URL이 `?code=` 필수라 사용자 입력 종목명을 code로 해석하는 조회 레이어. 가격·지표 데이터는 여전히 네이버 크롤링(`stocks` 테이블).

### ON CONFLICT 정책 (data.js 시드)

- `stocks`: name만 upsert
- `recommended_stocks`:
  - reason, score: 코드 값으로 덮어씀
  - fair_price: 최초 등록 후 고정
  - source: COALESCE로 기존 값 우선

### ON CONFLICT 정책 (directory.js 동기화)

- `stocks_directory`:
  - name, market: KRX 최신 값으로 덮어씀
  - listed_at: `COALESCE(EXCLUDED.listed_at, stocks_directory.listed_at)` — KRX에서 상장일이 비어 오는 종목 보존
  - updated_at: 매 동기화마다 `NOW()`로 갱신

---

## API 엔드포인트 (44개)

### 종목 (stock — 12개)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code` | 종목 상세 |
| POST | `/api/stock/:code/refresh` | 캐시 무효화 + 재수집 |
| GET | `/api/stocks` | 전체 종목 (`market_opinion` JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 (body: `{ code }` → `getStockData(code)` 네이버 크롤링 + upsert) |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade) |
| GET | `/api/search?q=` | 검색 (`stocks` 테이블, 시작 일치 우선 정렬, 최대 10건) |
| **GET** | **`/api/stocks/directory/search?q=`** | 3.6차 신설. `stocks_directory`(전 상장 종목) 대상 name/code ILIKE 검색. 시작 일치 우선 정렬, `delisted_at IS NULL`, 최대 10건. 앱 등록 여부와 무관 (`stocks` 테이블에 없어도 검색됨) |
| **POST** | **`/api/stocks/directory/sync`** | D3 — 디렉토리 강제 재동기화(IfEmpty 가드 우회). `x-admin-token`(또는 `?token=`)을 `ADMIN_SYNC_TOKEN`과 상수시간 비교, 불일치·미설정 401. `{ok, kospi, kosdaq}` 반환. 무료 Render(Shell 불가) 재적재 레버 |
| **GET** | **`/api/themes`** | 3.7차β 신설. 테마 목록 + 종목 수 (`{theme_id, theme_name, stock_count}[]`) |
| **GET** | **`/api/themes/:themeId/stocks`** | 3.7차β 신설. 특정 테마에 속한 종목 목록 |
| **GET** | **`/api/stock/:code/themes`** | 3.7차β 신설. 종목이 속한 테마 태그 |
| GET | `/api/recommendations` | 추천 종목 |

**미이관 항목(DIR-5)**: `POST /api/stocks` body에 `q`(name 또는 code) 필드 허용 — Phase 6 본작업으로 이월. 현재는 프론트(`/settings`)가 디렉토리에서 선택된 `code`를 직접 보내므로 백엔드는 code 경로만 유지.

### 포트폴리오 (portfolio — 8개, `router.use(requireDeviceIdMiddleware)` 적용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holdings` | 보유종목 (`holding_opinion` + `sma_available` 포함) |
| POST | `/api/holdings` | 신규 추가 (UPSERT) |
| PUT | `/api/holdings/:code` | 부분 수정 |
| DELETE | `/api/holdings/:code` | 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (20일) |
| **GET** | **`/api/holdings/sharpe`** | 3.8차 — 가중 평균 샤프 지수. 종목별 20일 일간 수익률 stddev → 252일 환산. 무위험금리 3.5%. 5일 미만 히스토리 제외 |
| **GET** | **`/api/holdings/benchmark`** | 3.14차 — KOSPI 대비 초과수익 + 정보비율(IR). 보유 구성 역산 일별 가치(= `/history`) vs `market_index_history` KOSPI 종가. `{available, period, portfolioReturn, benchmarkReturn, excessReturn, informationRatio, trackingError}`. KOSPI 히스토리 없거나 정렬 날짜 부족 시 `{available:false}` |
| **GET** | **`/api/holdings/correlation`** | 3.14차 — 보유 종목 간 상관관계(60거래일 일별 수익률, 피어슨). 2종목 이상만, 20일 미만 제외, 상위 3쌍 + max/avg. `{available, reason?, pairs, maxCorrelation, avgCorrelation}`. history는 한 쿼리로 묶어 조회(풀 max=5) |

> **`sma_available` 규칙**: false이면 `holding_opinion`은 항상 '보유'로 반환되지만 신뢰 불가.
> 프론트는 `sma_available=false`일 때 반드시 "분석 중" 뱃지를 표시해야 한다.

### 분석 (analysis — 8개)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code/indicators` | RSI, MACD, 볼린저 + `*_available` 플래그 |
| GET | `/api/stock/:code/signals` | 3.11차 신설. 7종 관찰 신호(크로스/스퀴즈/RSI/MACD/OBV/거래량/수급) + 합의 요약 `{positive, caution, total, summary}` + `asOf` + **`markers[]`**(3.12차 S5, 차트용 최근 20일 골든/데드크로스 `{date,type}`). 관찰형 서술만(명령형 금지). 10분 캐시. **stale 데이터(최신 history 10일 초과)** 시 신호 중단 + `stale:true` + 빈 `signals`. 실패 시 빈 배열 200 |
| GET | `/api/stock/:code/volatility` | 변동성 |
| GET | `/api/stock/:code/financials` | 분기 재무제표 |
| GET | `/api/stock/:code/news` | 뉴스 10건 |
| GET | `/api/stock/:code/chart/:tf` | 주봉/월봉 OHLCV |
| GET | `/api/screener` | 조건 필터 (perMin/perMax/roeMin 등) OR `?preset=` 분기 (3.7차β: `breakout_52w`/`foreign_buy`/`fund_buy`/`neglected`, 3.8차: `graham`/`momentum_3m`) |
| GET | `/api/sector/:cat/compare` | 섹터 비교 (averages + medians) |

### DART (dart — 2개, DB 읽기 전용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| **GET** | **`/api/stock/:code/dart/financials`** | 4.5a차 — `dart_financials` 조회. `{available, fsDiv(CFS>OFS), periods:['2025 3Q',…최근4], statements:{income,balance,cashflow}[]}`. 데이터 없으면 `available:false`(프론트는 네이버 폴백). 캐시 10분 |
| **GET** | **`/api/stock/:code/dart/disclosures?months=3`** | 4.5a차 — `dart_disclosures` 조회. `{available, items:[{rceptNo,reportNm,rceptDt,category,categoryLabel,rm,isRevised,isWithdrawn,url}]}`. 공시 없음도 `available:true`+`items:[]`(에러 아님). 원문 url=`dart.fss.or.kr/dsaf001/main.do?rcpNo=`. 캐시 10분 |

> DART 라우터는 stockRouter(`/stock/:code`)보다 먼저 마운트 — `/stock/:code/dart/*` 선점.
> 라이브 DART 호출은 sync 스크립트에서만. 엔드포인트는 적재된 DB만 읽는다.

### 거래일지 (journal — 3개, `requireDeviceIdMiddleware`)

`server/domains/journal/` — CBD 분해. `parsers/`(Port&Adapter: detectBroker + parseKiwoom/Toss/Samsung + normalize + index 레지스트리), `universe.js`(**T2** — 종목명→코드 인덱스, 정확·유일 매핑만·순수·단위테스트), `roundtrip.js`(FIFO 매칭 + summarize + **openLots·evaluateOpenLots** — 미청산분 최근 종가 평가, C-2), `biases/`(disposition/overtrading/chasing/anchoring/**avgdown**[평단 하향 추가매수, C-3] — metrics·flag만), `promote.js`(**T3** — 보유·거래 종목 stocks 승격: 동기 현재가[동시성3·예산8s] + 비동기 12개월 backfill, upsert-only·실패 격리), `service.js`(ingest[F1 교체 + T2 디렉토리 매핑 + T3 promoteCodes] + analyze[valueOpenLots DB 로드]), `router.js`.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| **POST** | **`/api/journal/upload`** | 4.5b차 — body `{csvText, broker?}`(csvText는 프론트 EUC-KR 디코드). 파싱→정규화→종목코드 해석(**T2**: 6자리 코드 우선 / 종목명→`stocks_directory`(~2,650) 매핑, 동명은 오매핑 대신 skip)→적재→**T3 승격**(`promoteCodes`: 보유분 현재가 동기 + 미등록 코드 12개월 이력 비동기 backfill). `{broker, imported, skipped, dateRange, coverage}`. 유니버스 밖은 skip. **원본 CSV·PII 미저장** |
| **GET** | **`/api/journal/analysis`** | 4.5b차 — FIFO 라운드트립→요약(승률·손익비·평균보유·MDD, 실현손익 기준) + 편향(수치·flag, provisional). **C-2**: 미청산 openLots를 최근 종가로 평가 → summary에 `openLossCount/openLossAvgHoldDays/asOfDate/unvaluedCount/realizedLossCount`(가격=stock_history 최신 종가→stocks.price 폴백, **asOfDate 필수·"지금" 아님**). **C-1**: coverage에 적재 메타(`total/imported/skipped/skippedNames`) 병합. **C-3**: biases에 `avgdown`(평단 하향 추가매수) 추가 + code→name 부착. `{available, summary, biases[], coverage}`, 데이터 없으면 `available:false` |
| **DELETE** | **`/api/journal`** | 4.5b차 — 해당 device 거래 전량 삭제 `{deleted}`. 재업로드는 append라 재분석 전 리셋용 |

> 편향 텍스트(한국어 관찰형 풀이)는 백엔드에 없음 — 서버는 수치·flag만, 풀이는 프론트 `lib/journal/interpret.ts`(4.5c와 동일 구조 + 금지어 테스트 재사용).
> 추격매수는 `stock_history` 가격조회 포트 주입 — 히스토리 없으면 coverage로 skip. `express.json` limit 4mb(CSV 텍스트).
> **키움 실헤더 확정(✅ 2026-07-31 실파일 대조)**: 프리앰블 1행(`[키움증권]주식 거래내역`) + 실헤더 22컬럼. 종목코드 컬럼 없음(종목명→코드 매핑), 매매구분='거래구분'(bare '구분'은 '매체구분'에 greedy 매칭돼 제거), 단가='거래단가', 수량='거래수량', 일자='거래일자'(YYYY.MM.DD). `detectBroker`는 프리앰블 마커 + 실토큰(거래수량/거래단가/매체구분/정산금액/거래세) 시그니처로 판별. **토스·삼성 헤더는 여전히 추정 — 실파일 대조 대기.**

### 주목 레이어 (attention — 1개, `requireDeviceIdMiddleware`)

`server/domains/attention/` — 신규 수집 0(기존 테이블 조립). DB 로드는 `service.js`, 판정은 순수 모듈 2종:
`score.js`(현저성 정규화·곱 결합·바닥 컷·상위 K·dedupe), `facts.js`(5거래일 수익률·거래량 배수·공시 집계).

| 메서드 | 경로 | 설명 |
|--------|------|------|
| **GET** | **`/api/attention`** | A차 — 보유(`holding_stocks`) ∪ 관심(`watchlist`)을 **현저성**으로 정렬해 상위 5개. 컴포넌트 4종을 각 0~1로 정규화 후 `Π(0.1 + 0.9·c)`: 공시 최신성×건수(`exp(-d/7)` 블렌드, 14일 룩백) · \|5거래일 수익률\|(15% 캡) · \|미실현\|(30% 캡) · 비중(30% 캡). 관심은 미실현·비중이 없어 baseline 0.3. 응답은 **원시 사실만** `{available, items:[{code,name,source,held,weightPct,unrealizedPct,ret5d,volSurge,priced,discCount,discLatestDaysAgo,discCategories,score}], asOfDate, constants}`. 보유·관심 0이면 `available:false`, 전부 바닥 미만이면 `items:[]` |

> **R1(현저성만)**: 방향(상승/하락)은 점수에 넣지 않는다 — 크기만. 절대 임계 라벨(위험/기회/우량) 없음.
> **R2(배지 O·해석 X)**: 서버는 숫자만 주고 문구는 프론트 `lib/attention/interpret.ts`(금지어 전수 스윕 `FORBIDDEN_ATTENTION`). 인과 서술 금지.
> 임계·캡 상수는 전부 **provisional**. 특히 `scoreFloor`는 지시문 예시 0.12에서 **0.006으로 조정** — 곱 형태에서 공시 없는 종목의 이론 최대가 보유 0.1 / 관심 0.0137이라 0.12는 사실상 '공시 필수' 필터가 된다(DART 적재 대기 중이면 블록이 상시 빈 상태). 실데이터 튜닝 1순위.
> 가격은 `stock_history` 최신 종가 → `stocks.price` 폴백. 승격 전 종목은 `priced:false`로 투명 처리("시세 정보 없음").

### 알림/관심종목/시스템

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/DELETE | `/api/alerts`, `/api/alerts/:id` | 알림 CRUD (`requireDeviceIdMiddleware` 라우터 단위 적용) |
| GET | `/api/alerts/unread-count` | 미읽은 수 |
| POST | `/api/alerts/read` | 전체 읽음 |
| GET/POST/DELETE | `/api/watchlist` | 관심종목 (`requireDeviceIdMiddleware` 라우터 단위 적용) |
| GET | `/api/market/indices` | KOSPI/KOSDAQ |
| **GET** | **`/api/market/fear-greed`** | 3.8차 — 간이 시장 온도 (RSI proxy 40% + 외국인 매수 비율 30% + 52주 고점 근접 30%). 폴백 50/중립 |
| GET | `/api/health` | 서버 상태 (`{ api, database, lastSync }`) |

### device_id 가드 패턴 (3.7차 REFACTOR)

- `helpers/deviceId.js`:
  - `getDeviceId(req)` — 헤더 조회 (null 가능). stock/router.js 추천처럼 **선택적** 컨텍스트에서 사용
  - `requireDeviceIdMiddleware(req, res, next)` — 누락 시 400 응답 + `req.deviceId` 주입. portfolio/alert/watchlist 라우터는 `router.use(requireDeviceIdMiddleware)` 한 줄로 일괄 적용
  - `requireDeviceId(req, res)` — 레거시, 하위 호환용으로만 유지

---

## 분석 알고리즘

### HoldingOpinion (런타임, DB 미저장)

```javascript
// domains/analysis/scoring.js — calculateHoldingOpinion(avgPrice, currentPrice, sma5, sma20)
1. lossRate <= -0.07 → '매도' (손절, SMA 불필요)
2. sma5 == null → '보유' (판단 불가)
3. price < sma5 && price < sma20 → '매도' (이중 이탈)
4. price < sma5 && price >= sma20 → '관망' (단기이탈+중기지지)
5. sma20 == null:
   - price < sma5 → '관망'
   - price <= sma5 * 1.01 → '추가매수'
   - else → '보유'
6. price >= sma5 && price <= sma5 * 1.01 → '추가매수' (5일선 근접)
7. price > sma5 && sma5 > sma20 → '보유' (정배열)
```

### MarketOpinion (10점, DB 저장)

| 영역 | 범위 | 계산 기준 |
|------|------|----------|
| 밸류에이션 | 0~3 | PER/PBR 섹터 중앙값 비교 + PEG (PEG 무효 시 재정규화) |
| 기술지표 | 0~3 | RSI 30% + MACD 25% + 볼린저 20% + 거래량 25% |
| 수급 | 0~2 | 외국인(max 1.2) + 기관(max 0.8), 10일 감쇠 decay=0.8 |
| 추세 | 0~2 | 정배열 2.0 / 5일선위+역배열 1.0 / 20일선위 0.5 / 아래 0.0 |

임계값: ≥7 긍정적, ≥4 중립적, <4 부정적 **(임시값 — Phase 4 백테스팅 후 최적화)**

### 알림 쿨다운 + 빈도 제어

| type | 쿨다운 | 메시지 톤 |
|------|--------|----------|
| sell_signal | 48h | 중립·서술형 |
| sma5_break | 24h | 중립·서술형 |
| sma5_touch | 24h | 중립·서술형 |

**M4(a)** — 목표가 파생 2종(`target_near` 12h / `undervalued` 24h)은 트리거를 삭제했다.
애널리스트 목표가 괴리를 근거로 푸시하던 것이라 근거 확인이 불가능한 매매 신호에 해당(R2).
이 블록이 `watchlist`를 훑던 유일한 경로였으므로 **남은 3종은 보유 종목 전용**이다.
기존 DB 행은 서버가 지우지 않는다 → `DELETE FROM alerts WHERE type IN ('target_near','undervalued');` (운영자 수동)

일일 한도: `DAILY_ALERT_LIMIT_PER_STOCK = 2` (KST 기준)

```sql
-- KST 빈도 가드 (PostgreSQL)
SELECT COUNT(*)::int AS cnt FROM alerts
WHERE device_id = $1 AND code = $2
  AND (created_at AT TIME ZONE 'Asia/Seoul')::date
      = (NOW() AT TIME ZONE 'Asia/Seoul')::date
```

**금지 표현**: "매도를 검토해 주세요", "매수 타이밍", "추가매수 권장" 등 명령조/거래 권유.

---

## 스케줄링

| 작업 | 주기 |
|------|------|
| syncAllStocks() | 서버 시작 후 5초(실패 시 30초 backoff 1회) + 매일 08:00 |
| syncDirectoryIfEmpty() | 서버 시작 후 10초 — **D1**: `stocks_directory` < 1000행이면 재동기화 |
| syncDirectory() (일 1회) | **D4**: 매일 07:30 강제 재동기화(상장/상폐 반영, 08:00 `syncAllStocks` 앞) |
| cleanupOldData() | 서버 시작 + 24시간마다 |

**cleanupOldData 범위**: `stock_analysis`, `recommended_stocks` 20일+ 삭제.
`stock_history`, `investor_history`는 삭제 안 함 (차트/지표 계산에 필요).
`recommended_stocks`: `source != 'manual'` 조건으로만 삭제 (시드 보존).

---

## PostgreSQL 레이어

### Connection 패턴

```javascript
import pool, { query, withTransaction } from './db/connection.js';

// 단일 쿼리
const { rows } = await query('SELECT * FROM stocks WHERE code = $1', [code]);

// 트랜잭션
await withTransaction(async (client) => {
    await client.query('INSERT INTO stock_history ...', [...]);
    await client.query('UPDATE stocks SET ...', [...]);
});
```

### 주요 설계 결정

- 풀 크기 `max: 5` (Neon 무료 플랜 제한)
- `BATCH_SIZE = 3` (syncAllStocks 동시성 제한)
- NUMERIC(14,2) — pg 드라이버가 string으로 반환 → `Number()` 캐스팅 필수
- `ORDER BY ... NULLS LAST` 명시 (PostgreSQL 기본값 보장)

### 초기화 순서 (server.js)

```javascript
await initSchema(pool);
await runMigrations(pool);
await registerInitialData(pool);
setupCleanup(pool);
setupScheduler();
app.listen(PORT);
```

---

## 데이터 현황

- 등록 종목: 97개 (초기 시드) → `scripts/expand-stocks.js` 실행 시 ~180개 (8개 섹터)
- 수동 추천: 20개 (source='manual', fair_price 최초 등록 후 고정)
- 알고리즘 추천: market_opinion='긍정적' 종목 자동 필터링 (매일 갱신)

---

## 운영자 스크립트

| 스크립트 | 용도 |
|---------|------|
| `scripts/backfill-history.js` | 등록 종목의 3년치 일봉 히스토리 적재 (배치 3, ~6시간). 2A — 조회/적재는 `server/domains/stock/history.js` 공용 함수 사용 |
| `scripts/sync-directory.js` | KRX 상장법인목록 → `stocks_directory` 수동 동기화 |
| `scripts/cleanup-directory-junk.js` | 1C — `stocks_directory`의 `000000`(파서 붕괴 잔재)·`999999`(진단 센티넬) 삭제. `--dry-run` 지원 |
| `scripts/expand-stocks.js` | 3.7차 감마 — TARGET_CODES(~86) 중 미등록 코드만 네이버 크롤링으로 `stocks`에 추가 (배치 3 × 3초 간격). 테마 매핑은 다음 서버 재시작 시 `CATEGORY_TO_THEMES` 폴백으로 자동 처리 |
| `scripts/sync-index-history.js` | 3.14차 — KOSPI/KOSDAQ 지수 일봉 → `market_index_history` 적재 (네이버 siseJson, ON CONFLICT 멱등). 벤치마크(초과수익·IR) 데이터 공급. 미실행 시 `/holdings/benchmark`는 `available:false` |
| `scripts/sync-dart-corpcodes.js` | 4.5a차 — DART 전 상장사 corp_code↔stock_code 매핑 적재(~10만 건, 월 1회). `DART_API_KEY` 필요. `--dry-run` 지원. 재무·공시 선행 |
| `scripts/sync-dart-financials.js` | 4.5a차 — 186종목 재무제표(최근 N개년×4보고서, CFS→OFS 폴백) → `dart_financials`. `--dry-run`/`--save-sample`(원본 구조 확인). canonical 계정만 저장, PK first-wins 디둡 |
| `scripts/sync-dart-disclosures.js` | 4.5a차 — 186종목 최근 공시 → `dart_disclosures`. **적응형 페이징**(비노이즈가 target(20) 도달까지, maxPages 3) + 노이즈 블랙리스트(소유상황·대량보유·의결권권유 제외). 첫 종목 종목혼입 사전점검. `--dry-run`/`--months`/`--target`/`--max-pages` |

실행 공통: `DATABASE_URL=postgres://... node scripts/<name>.js`
