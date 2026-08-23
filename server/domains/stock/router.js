import express from 'express';
import { timingSafeEqual } from 'crypto';
import { query, withTransaction } from '../../db/connection.js';
import { getDeviceId } from '../../helpers/deviceId.js';
import { invalidateCache } from '../../helpers/cache.js';
import { getStockData } from './service.js';
import { syncDirectory } from './directory.js';

const router = express.Router();

// D3 — 관리 토큰 상수시간 비교. 길이 다르면 즉시 false(timingSafeEqual는 동일 길이 요구).
// 토큰은 Render 환경변수(ADMIN_SYNC_TOKEN)로만 주입 — 코드/로그/커밋 노출 금지.
function safeTokenEqual(provided, expected) {
    if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

// GET /api/stock/:code - fetch and store stock data
router.get('/stock/:code', async (req, res) => {
    const { code } = req.params;
    const data = await getStockData(code);
    if (data) {
        res.json(data);
    } else {
        res.status(404).json({ error: 'Stock not found' });
    }
});

// POST /api/stock/:code/refresh - invalidate cache and re-fetch.
// Puppeteer 제거: 차트 캡처 경로가 사라졌으므로 단순히 getStockData만 재호출.
router.post('/stock/:code/refresh', async (req, res) => {
    const { code } = req.params;
    invalidateCache(code);
    try {
        const stockData = await getStockData(code);
        if (stockData) {
            res.json(stockData);
        } else {
            res.status(404).json({ error: 'Stock not found' });
        }
    } catch (error) {
        console.error('Refresh Error:', error.message);
        res.status(500).json({ error: 'Refresh failed' });
    }
});

// GET /api/stocks/directory/search?q=
// stocks_directory(전 상장 종목) 대상 name/code ILIKE 검색. 시작 일치 우선 정렬.
// delisted_at IS NULL 조건으로 상장폐지 제외. 앱 등록 여부(stocks 테이블)와 무관.
// /api/search와의 차이:
//   - /search: stocks 테이블 (앱에 등록·시세 수집된 종목 ~100개)
//   - /directory/search: stocks_directory (전 상장 종목 ~2,600개, 시세 데이터 없음)
//
// 라우트 순서 주의: /stocks GET 및 POST보다 반드시 위에 선언해야 한다.
// Express 5는 정적 경로 매칭이 우선이라 현재 구조에선 순서 무관하지만, 향후 누군가가
// `router.get('/stocks/:something')` 같은 와일드카드 경로를 추가해도 디렉토리 경로가
// 섀도잉당하지 않도록 방어적으로 선언 순서를 고정해둔다.
router.get('/stocks/directory/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    try {
        const like = `%${q}%`;
        const startsWith = `${q}%`;
        const { rows } = await query(`
            SELECT code, name, market
            FROM stocks_directory
            WHERE (name ILIKE $1 OR code ILIKE $1)
              AND delisted_at IS NULL
            ORDER BY
                CASE WHEN name ILIKE $2 THEN 1
                     WHEN name ILIKE $1 THEN 2
                     ELSE 3 END,
                name
            LIMIT 10
        `, [like, startsWith]);
        res.json(rows);
    } catch (error) {
        console.error('Directory Search Error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

// D3 — POST /api/stocks/directory/sync : 디렉토리 강제 재동기화(IfEmpty 가드 우회).
// 무료 Render(Shell 불가)에서 재배포 없이 Render IP로 재적재하는 수동 레버.
//   curl -X POST ".../api/stocks/directory/sync" -H "x-admin-token: <secret>"
// 인가: x-admin-token 헤더 또는 ?token= 를 ADMIN_SYNC_TOKEN과 상수시간 비교. 불일치·미설정 시 401.
router.post('/stocks/directory/sync', async (req, res) => {
    const provided = req.get('x-admin-token') || req.query.token || '';
    if (!safeTokenEqual(String(provided), process.env.ADMIN_SYNC_TOKEN || '')) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    try {
        // syncDirectory는 마켓별 실패를 내부에서 삼키고 카운트를 반환(throw 없음) — 운영자가 HTTP로 상태 확인.
        const result = await syncDirectory();
        res.json({ ok: true, ...result });
    } catch (e) {
        res.json({ ok: false, kospi: 0, kosdaq: 0, error: e.message });
    }
});

// GET /api/stocks - list all stocks; prices kept fresh by background sync
router.get('/stocks', async (req, res) => {
    try {
        const { rows: stocks } = await query(`
            SELECT s.*, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            ORDER BY s.category, s.name
        `);

        const results = stocks.map(s => ({
            ...s,
            price: s.price || 0,
            per: s.per !== null ? Number(s.per) : null,
            pbr: s.pbr !== null ? Number(s.pbr) : null,
            roe: s.roe !== null ? Number(s.roe) : null,
            market_opinion: s.market_opinion || '중립적'
        }));
        res.json(results);
    } catch (error) {
        console.error('Stocks GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch stocks' });
    }
});

// GET /api/search?q=...
// 인덱스: stocks.code, stock_analysis.code 모두 PRIMARY KEY (자동 인덱스).
// LEFT JOIN은 PK 기준이므로 효율적. name/code LIKE 검색은 풀스캔이지만
// 97종목 규모에서 무시 가능. 종목 수가 1,000개 이상으로 늘어나면 tsvector/trigram 인덱스 검토.
router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const like = `%${q}%`;
        const startsWith = `${q}%`;
        // ORDER BY: 1순위 이름이 q로 시작 (정확도 높음), 2순위 q를 포함, 그 외 이름순.
        // "삼성" 입력 시 "삼성SDI"·"삼성전자"가 모두 노출되도록 부분 일치 정렬 강화.
        const { rows: results } = await query(`
            SELECT s.code, s.name, s.category, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.name ILIKE $1 OR s.code ILIKE $1
            ORDER BY
                CASE
                    WHEN s.name ILIKE $2 THEN 1
                    WHEN s.name ILIKE $1 THEN 2
                    ELSE 3
                END,
                s.name
            LIMIT 10
        `, [like, startsWith]);
        res.json(results);
    } catch (error) {
        console.error('Search Error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/stocks - manually add a stock by code
router.post('/stocks', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    try {
        const data = await getStockData(code);
        if (data) {
            res.json(data);
        } else {
            res.status(404).json({ error: 'Failed to fetch stock data or invalid code' });
        }
    } catch (error) {
        console.error('Manual Add Error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/stocks/:code - remove a stock and all related rows.
// FK ON DELETE CASCADE는 holding_stocks / watchlist / recommended_stocks / stock_analysis를 자동 삭제한다.
// stock_history / investor_history는 FK가 없어 수동 삭제.
router.delete('/stocks/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const { changes } = await withTransaction(async (client) => {
            await client.query('DELETE FROM stock_history WHERE code = $1', [code]);
            await client.query('DELETE FROM investor_history WHERE code = $1', [code]);
            const result = await client.query('DELETE FROM stocks WHERE code = $1', [code]);
            return { changes: result.rowCount };
        });
        if (changes > 0) {
            res.json({ success: true, message: `Stock ${code} and all related data removed successfully.` });
        } else {
            res.status(404).json({ error: 'Stock not found' });
        }
    } catch (error) {
        console.error('Delete Error:', error.message);
        res.status(500).json({ error: 'Failed to delete stock due to database error' });
    }
});

// ============================================================================
// 3.7차 — 테마 API
// ============================================================================

// GET /api/themes - 전체 테마 목록 + 각 테마의 종목 수 (stocks 테이블 존재 기준)
router.get('/themes', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT st.theme_id, st.theme_name, COUNT(st.code)::int AS stock_count
            FROM stock_themes st
            JOIN stocks s ON st.code = s.code
            GROUP BY st.theme_id, st.theme_name
            ORDER BY stock_count DESC, st.theme_name
        `);
        res.json(rows);
    } catch (error) {
        console.error('Themes Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch themes' });
    }
});

// GET /api/themes/:themeId/stocks - 특정 테마에 속한 종목 목록
router.get('/themes/:themeId/stocks', async (req, res) => {
    const { themeId } = req.params;
    try {
        const { rows } = await query(`
            SELECT s.code, s.name, s.category, s.price, s.change, s.change_rate,
                   s.per, s.pbr, s.roe,
                   a.opinion AS market_opinion
            FROM stock_themes st
            JOIN stocks s ON st.code = s.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE st.theme_id = $1
            ORDER BY s.name
        `, [themeId]);
        const mapped = rows.map(r => ({
            ...r,
            per: r.per !== null ? Number(r.per) : null,
            pbr: r.pbr !== null ? Number(r.pbr) : null,
            roe: r.roe !== null ? Number(r.roe) : null,
            price: r.price !== null ? Number(r.price) : null,
        }));
        res.json(mapped);
    } catch (error) {
        console.error('Theme Stocks Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch theme stocks' });
    }
});

// GET /api/stock/:code/themes - 특정 종목이 속한 테마 목록
router.get('/stock/:code/themes', async (req, res) => {
    const { code } = req.params;
    try {
        const { rows } = await query(`
            SELECT DISTINCT theme_id, theme_name
            FROM stock_themes
            WHERE code = $1
            ORDER BY theme_name
        `, [code]);
        res.json(rows);
    } catch (error) {
        console.error('Stock Themes Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch stock themes' });
    }
});

// GET /api/recommendations — 에디터 큐레이션 목록(보유 종목 제외). 경로명은 딥링크 호환으로 유지.
//
// D1 — "유망 종목 추천" → "종목 탐색" 재구성. 세 개의 매수 엔진을 걷어냈다:
//   ① 알고리즘 긍정-필터 소스: `stock_analysis WHERE opinion='긍정적'`로 "좋은 것만" 자동 선별하던
//      두 번째 소스 제거. 최종 `filter(market_opinion==='긍정적')` 게이트도 함께.
//      → 남는 소스는 **수동 큐레이션(recommended_stocks)만**. 알고리즘 발견은 스크리너 렌즈가 담당한다.
//   ② 적정가 폴백 `fair_price || targetPrice || price*1.1`: 목표가가 이 경로로 재유입되고 있었다.
//      `currentPrice >= fairPrice → null` 상승여력 게이트, `probability`(fairPrice 파생 매수 점수)도 제거.
//   ③ 응답에서 판정·매수 소재 제거: market_opinion / targetPrice / analysis / advice.
// market_opinion 내부 계산은 유지된다(다른 소비처) — 이 응답에서 **노출만** 끊는다.
router.get('/recommendations', async (req, res) => {
    try {
        // ⚠️ 이 응답은 `stocks` 스냅샷만으로 완성된다 — 쓰는 필드가 전부 그 테이블에 있다.
        //
        // 예전엔 큐레이션 종목마다 `getStockData`를 호출했다. 그건 **풀 분석**이라
        // (stock_history 조회 + MarketOpinion 4축 채점 + 캐시 미스 시 네이버 스크래핑)
        // 콜드 캐시에서 20종목 ÷ 배치3 × ~15초 ≈ **110초**가 걸렸다. 클라 axios 타임아웃은
        // 30초(M-1)라 **첫 사용자·캐시 만료 후 사용자는 빈 화면**을 봤다. 목록에 필요한 건
        // 큐레이션 텍스트 + 시세·밸류 스냅샷뿐이라 분석·스크래핑이 아예 필요 없다.
        //
        // 판정 필드(market_opinion·targetPrice·analysis·advice)는 **넣지 않는다** — D1에서
        // 걷어낸 것이라 여기로 되돌아오면 목록이 다시 매수 신호처럼 읽힌다.
        const { rows } = await query(`
            SELECT r.code, s.name, s.category, r.reason, r.score, r.source,
                   s.price AS "currentPrice", s.per, s.pbr, s.roe
            FROM recommended_stocks r
            JOIN stocks s ON r.code = s.code
        `);

        const deviceId = getDeviceId(req);
        let holdingCodes = [];
        if (deviceId) {
            const { rows: hrows } = await query('SELECT code FROM holding_stocks WHERE device_id = $1', [deviceId]);
            holdingCodes = hrows.map(h => h.code);
        }

        // per/pbr/roe는 NUMERIC(10,4) → pg가 **문자열**로 준다("7.7100"). 기존 응답은 숫자였으므로
        // 캐스팅해서 형태를 유지한다(service.js buildFallback의 num()과 동일 동작 — null은 null).
        const num = (v) => {
            if (v === null || v === undefined) return null;
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
        };

        const available = rows
            .filter(r => !holdingCodes.includes(r.code))
            .map(r => ({
                code: r.code,
                name: r.name,
                category: r.category,
                reason: r.reason,
                score: r.score,          // 큐레이션 순서용(정렬). 화면에는 노출하지 않는다.
                currentPrice: r.currentPrice,
                per: num(r.per),
                pbr: num(r.pbr),
                roe: num(r.roe),
                source: r.source || 'manual',
                // 예전엔 stock_analysis.toss_url을 읽었는데 값이 이 형식으로 저장돼 있었다 → 즉석 생성.
                tossUrl: `https://tossinvest.com/stocks/${r.code}/order`,
            }));

        // 큐레이션 순서만 남는다 — 판정 게이트(market_opinion==='긍정적') 제거(D1).
        // 정렬은 SQL ORDER BY로 옮기지 않는다 — Postgres는 DESC에서 NULL을 먼저 놓는데
        // 기존 JS 비교자는 다르게 처리한다(순서가 조용히 바뀌면 안 된다).
        //
        // 동률은 **코드 오름차순으로 고정**한다. 이전엔 `ORDER BY` 없는 SELECT의 행 순서가
        // 그대로 타이브레이크였다(Array.sort는 안정 정렬) → 같은 점수 종목의 앞뒤가 방문마다
        // 흔들렸다(실측: score 83에서 하이브 ↔ POSCO홀딩스 교체). 큐레이션 목록은 사용자가
        // 다시 찾아오는 화면이라 순서가 고정돼야 한다(D차 기여 분해의 동률 규칙과 동일).
        // score가 null이면 차가 NaN(falsy)이라 자연히 코드 순으로 떨어진다.
        available.sort((a, b) => (b.score - a.score) || a.code.localeCompare(b.code));
        res.json(available);
    } catch (error) {
        console.error('Recommendations API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

export default router;
