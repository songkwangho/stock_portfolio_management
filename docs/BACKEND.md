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
│   │   └── router.js     # 7 endpoints
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

## DB 스키마 (8개 테이블)

| 테이블 | PK | 주요 컬럼 | 비고 |
|--------|-----|----------|------|
| stocks | code | name, category, price, change, change_rate, per, pbr, roe, target_price, eps_current, eps_previous | change/change_rate는 최근 2거래일 종가로 계산 |
| holding_stocks | device_id+code | avg_price (NUMERIC 14,2), weight, quantity | avg_price 소수점 보존 |
| stock_history | code+date | price, open, high, low, volume (BIGINT) | FK 없음 (대량 데이터 cascade 회피) |
| stock_analysis | code | analysis, advice, opinion (MarketOpinion), toss_url | ON DELETE CASCADE |
| recommended_stocks | code | reason, fair_price, score, source (manual/algorithm) | ON DELETE CASCADE |
| investor_history | code+date | institution, foreign_net, individual (모두 BIGINT) | FK 없음 |
| alerts | id (BIGSERIAL) | device_id, code, type, source (holding/watchlist), message, read | |
| watchlist | device_id+code | added_at | ON DELETE CASCADE |

### ON CONFLICT 정책 (data.js 시드)

- `stocks`: name만 upsert
- `recommended_stocks`:
  - reason, score: 코드 값으로 덮어씀
  - fair_price: 최초 등록 후 고정
  - source: COALESCE로 기존 값 우선

---

## API 엔드포인트 (28개)

### 종목 (stock — 7개)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stock/:code` | 종목 상세 |
| POST | `/api/stock/:code/refresh` | 캐시 무효화 + 재수집 |
| GET | `/api/stocks` | 전체 종목 (`market_opinion` JOIN) |
| POST | `/api/stocks` | 종목 수동 등록 |
| DELETE | `/api/stocks/:code` | 종목 삭제 (cascade) |
| GET | `/api/search?q=` | 검색 (최대 10건) |
| GET | `/api/recommendations` | 추천 종목 |

### 포트폴리오 (portfolio — 5개, `requireDeviceId` 적용)

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
| GET | `/api/screener` | 조건 필터 |
| GET | `/api/sector/:cat/compare` | 섹터 비교 (averages + medians) |

### 알림/관심종목/시스템

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/DELETE | `/api/alerts`, `/api/alerts/:id` | 알림 CRUD |
| GET | `/api/alerts/unread-count` | 미읽은 수 |
| POST | `/api/alerts/read` | 전체 읽음 |
| GET/POST/DELETE | `/api/watchlist` | 관심종목 |
| GET | `/api/market/indices` | KOSPI/KOSDAQ |
| GET | `/api/health` | 서버 상태 (`{ api, database, lastSync }`) |

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
