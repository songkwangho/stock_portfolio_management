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
│   ├── schema.js         # 8개 테이블 PG DDL
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
│   │   └── router.js     # 7 endpoints
│   ├── alert/
│   │   ├── service.js    # generateAlerts + ALERT_COOLDOWNS
│   │   └── router.js     # 4 endpoints
│   ├── portfolio/
│   │   ├── service.js    # recalcWeights (withTransaction)
│   │   └── router.js     # 5 endpoints
│   ├── watchlist/
│   │   └── router.js     # 3 endpoints
│   ├── stock/
│   │   ├── service.js    # getStockData + syncAllStocks + scheduleDaily8AM
│   │   ├── data.js       # registerInitialData (97종목 + 20개 추천)
│   │   ├── directory.js  # 3.6차 — KRX stocks_directory 동기화 (syncDirectory/syncDirectoryIfEmpty)
│   │   └── router.js     # 8 endpoints (directory/search 포함)
│   └── system/
│       └── router.js     # health, market/indices
└── scheduler.js          # setupScheduler + setupCleanup
```

### 라우터 마운트 순서 (server.js)

```javascript
app.use('/api/alerts',    alertRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/holdings',  portfolioRouter);
app.use('/api', systemRouter);    // /health, /market/indices
app.use('/api', analysisRouter);  // /stock/:code/indicators 등
app.use('/api', stockRouter);     // /stock/:code, /stocks 등
```

---

## DB 스키마 (12개 테이블)

| 테이블 | PK | 주요 컬럼 | 비고 |
|--------|-----|----------|------|
| stocks | code | name, category, price, change, change_rate, per, pbr, roe, target_price, eps_current, eps_previous | change/change_rate는 최근 2거래일 종가로 계산 |
| holding_stocks | device_id+code | avg_price (NUMERIC 14,2), weight, quantity | avg_price 소수점 보존 |
| stock_history | code+date | price, open, high, low, volume (BIGINT) | FK 없음 (대량 데이터 cascade 회피) |
| stock_analysis | code | analysis, advice, opinion (MarketOpinion), toss_url, **ai_report, ai_report_date** | ai_report* 는 Phase 5 Claude Haiku용 선행 컬럼 (3.7차). ON DELETE CASCADE |
| recommended_stocks | code | reason, fair_price, score, source (manual/algorithm) | ON DELETE CASCADE |
| investor_history | code+date | institution, foreign_net, individual (모두 BIGINT) | FK 없음 |
| alerts | id (BIGSERIAL) | device_id, code, type, source (holding/watchlist), message, read | |
| watchlist | device_id+code | added_at | ON DELETE CASCADE |
| **stocks_directory** | code | name, market (KOSPI/KOSDAQ/KONEX), listed_at, delisted_at, updated_at | 3.6차 신설. KRX 상장법인목록 파싱으로 동기화. `stocks` 테이블과 FK 없음 (디렉토리는 전 상장 종목, `stocks`는 앱 등록 종목만). 인덱스: name, market. 서버 시작 시 데이터 0건이면 1회 자동 동기화. KRX 응답 4중 가드(HTTP 200 / 본문 1,000B+ / HTML 에러 페이지 차단 / 최소 행 수) |
| **stock_themes** | (theme_id, code) | theme_name | 3.7차β 신설. 다대다 테마 매핑. code는 `stocks` FK (ON DELETE CASCADE). 10개 핵심 테마 + 대표 15종목 수동 + category 폴백 자동 시드. 인덱스: code, theme_id |
| **users** | id (BIGSERIAL) | provider, provider_id, email, nickname, legacy_device_id, created_at | Phase 5 선행. 현재 미사용 (라우트 미연결). `UNIQUE(provider, provider_id)`. 인덱스: legacy_device_id |
| **user_subscriptions** | id (BIGSERIAL) | user_id FK, status, plan, expires_at, payment_id UNIQUE, created_at | Phase 5 선행. Toss Payments 웹훅 멱등성은 payment_id UNIQUE로 확보 |

### stocks_directory 동기화 파이프라인

- **소스**: `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType={stockMkt|kosdaqMkt}`
  - 확장자는 `.xls`지만 실제 응답은 EUC-KR HTML `<table>`
  - 컬럼 순서: 회사명, 종목코드, 업종, 주요제품, 상장일, 결산월, ...
  - `TextDecoder('euc-kr')` + 정규식 `<tr>/<td>` 파싱 (`naver.js`와 동일 패턴, iconv-lite 불필요)
- **구현**: `server/domains/stock/directory.js`
  - `syncDirectory()` — KOSPI + KOSDAQ 연속 fetch, UPSERT (code PK 기준 name/market/listed_at 덮어쓰기)
  - `syncDirectoryIfEmpty()` — COUNT 체크해서 0건일 때만 실행
- **트리거**:
  - 서버 시작 후 10초 지연으로 1회 (`setupScheduler` 내, 비어 있을 때만) — 3.6차
  - 수동: `DATABASE_URL=... node scripts/sync-directory.js` — 3.6차
  - 일 1회 cron 편입은 Phase 6 본작업으로 이월

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

## API 엔드포인트 (29개)

### 종목 (stock — 8개)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code` | 종목 상세 |
| POST | `/api/stock/:code/refresh` | 캐시 무효화 + 재수집 |
| GET | `/api/stocks` | 전체 종목 (`market_opinion` JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 (body: `{ code }` → `getStockData(code)` 네이버 크롤링 + upsert) |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade) |
| GET | `/api/search?q=` | 검색 (`stocks` 테이블, 시작 일치 우선 정렬, 최대 10건) |
| **GET** | **`/api/stocks/directory/search?q=`** | 3.6차 신설. `stocks_directory`(전 상장 종목) 대상 name/code ILIKE 검색. 시작 일치 우선 정렬, `delisted_at IS NULL`, 최대 10건. 앱 등록 여부와 무관 (`stocks` 테이블에 없어도 검색됨) |
| **GET** | **`/api/themes`** | 3.7차β 신설. 테마 목록 + 종목 수 (`{theme_id, theme_name, stock_count}[]`) |
| **GET** | **`/api/themes/:themeId/stocks`** | 3.7차β 신설. 특정 테마에 속한 종목 목록 |
| **GET** | **`/api/stock/:code/themes`** | 3.7차β 신설. 종목이 속한 테마 태그 |
| GET | `/api/recommendations` | 추천 종목 |

**미이관 항목(DIR-5)**: `POST /api/stocks` body에 `q`(name 또는 code) 필드 허용 — Phase 6 본작업으로 이월. 현재는 프론트(`/settings`)가 디렉토리에서 선택된 `code`를 직접 보내므로 백엔드는 code 경로만 유지.

### 포트폴리오 (portfolio — 5개, `router.use(requireDeviceIdMiddleware)` 적용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/holdings` | 보유종목 (`holding_opinion` + `sma_available` 포함) |
| POST | `/api/holdings` | 신규 추가 (UPSERT) |
| PUT | `/api/holdings/:code` | 부분 수정 |
| DELETE | `/api/holdings/:code` | 삭제 |
| GET | `/api/holdings/history` | 포트폴리오 가치 히스토리 (20일) |

> **`sma_available` 규칙**: false이면 `holding_opinion`은 항상 '보유'로 반환되지만 신뢰 불가.
> 프론트는 `sma_available=false`일 때 반드시 "분석 중" 뱃지를 표시해야 한다.

### 분석 (analysis — 7개)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code/indicators` | RSI, MACD, 볼린저 + `*_available` 플래그 |
| GET | `/api/stock/:code/volatility` | 변동성 |
| GET | `/api/stock/:code/financials` | 분기 재무제표 |
| GET | `/api/stock/:code/news` | 뉴스 10건 |
| GET | `/api/stock/:code/chart/:tf` | 주봉/월봉 OHLCV |
| GET | `/api/screener` | 조건 필터 (perMin/perMax/roeMin 등) OR `?preset=` 분기 (3.7차β: `breakout_52w`/`foreign_buy`/`fund_buy`/`neglected`) |
| GET | `/api/sector/:cat/compare` | 섹터 비교 (averages + medians) |

### 알림/관심종목/시스템

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/DELETE | `/api/alerts`, `/api/alerts/:id` | 알림 CRUD (`requireDeviceIdMiddleware` 라우터 단위 적용) |
| GET | `/api/alerts/unread-count` | 미읽은 수 |
| POST | `/api/alerts/read` | 전체 읽음 |
| GET/POST/DELETE | `/api/watchlist` | 관심종목 (`requireDeviceIdMiddleware` 라우터 단위 적용) |
| GET | `/api/market/indices` | KOSPI/KOSDAQ |
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
| target_near | 12h | 중립·서술형 |
| undervalued | 24h | 중립·서술형 |

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
| syncDirectoryIfEmpty() | 서버 시작 후 10초 (3.6차, `stocks_directory` 비어 있을 때만 1회). Phase 6에서 일 1회 cron으로 승격 예정 |
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

- 등록 종목: 97개 (8개 섹터)
- 수동 추천: 20개 (source='manual', fair_price 최초 등록 후 고정)
- 알고리즘 추천: market_opinion='긍정적' 종목 자동 필터링 (매일 갱신)
