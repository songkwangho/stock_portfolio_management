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

// 진단용 임시 — GET /api/stocks/directory/debug : 연결 DB·쓰기 커밋 가시성 확인.
// sync가 upsert하는데도 디렉토리가 비어 보이는 원인(연결 DB 불일치 vs 커밋 미가시)을 판별.
// GET이지만 센티넬 쓰기(999999)를 포함(운영자 요청, 토큰 보호). 진단 종료 후 라우트·센티넬 제거 예정.
router.get('/stocks/directory/debug', async (req, res) => {
    const provided = req.get('x-admin-token') || req.query.token || '';
    if (!safeTokenEqual(String(provided), process.env.ADMIN_SYNC_TOKEN || '')) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    try {
        const who = (await query('SELECT current_database() AS db, current_user AS usr')).rows[0];
        await query(
            `INSERT INTO stocks_directory (code, name, market) VALUES ('999999', '__DEBUG__', 'KOSPI')
             ON CONFLICT (code) DO UPDATE SET name = '__DEBUG__', updated_at = NOW()`
        );
        const counts = (await query(
            `SELECT count(*)::int AS total,
                    (SELECT count(*)::int FROM stocks_directory WHERE code = '999999') AS sentinel
             FROM stocks_directory`
        )).rows[0];
        const sample = (await query(
            `SELECT code, name, market FROM stocks_directory ORDER BY code LIMIT 5`
        )).rows;
        res.json({ who, total: counts.total, sentinel: counts.sentinel, sample });
    } catch (e) {
        res.status(500).json({ error: e.message });
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

// GET /api/recommendations - manual + analysis-based recommendations, excluding holdings
router.get('/recommendations', async (req, res) => {
    try {
        const { rows: manualRecs } = await query(`
            SELECT r.*, s.name, s.category
            FROM recommended_stocks r
            JOIN stocks s ON r.code = s.code
        `);

        const { rows: analysisRecs } = await query(`
            SELECT a.code, s.name, s.category, a.analysis AS reason, 50 AS score
            FROM stock_analysis a
            JOIN stocks s ON a.code = s.code
            WHERE a.opinion = '긍정적'
        `);

        const combined = [...manualRecs.map(r => ({ ...r, source: r.source || 'manual' }))];
        for (const ar of analysisRecs) {
            if (!combined.some(c => c.code === ar.code)) {
                combined.push({
                    code: ar.code,
                    reason: ar.reason,
                    fair_price: ar.fair_price || 0,
                    score: ar.score,
                    name: ar.name,
                    category: ar.category,
                    source: 'algorithm'
                });
            }
        }

        const deviceId = getDeviceId(req);
        let holdingCodes = [];
        if (deviceId) {
            const { rows: hrows } = await query('SELECT code FROM holding_stocks WHERE device_id = $1', [deviceId]);
            holdingCodes = hrows.map(h => h.code);
        }
        const nonHoldings = combined.filter(c => !holdingCodes.includes(c.code));

        // 배치 처리 (Neon 풀 max=5 + getStockData 내부 withTransaction connection 점유 고려).
        // Promise.all로 97종목 동시 호출 시 캐시 미스 구간에서 풀 경합 발생 → BATCH=3으로 직렬화.
        const RECOMMEND_BATCH_SIZE = 3;
        const results = [];
        for (let i = 0; i < nonHoldings.length; i += RECOMMEND_BATCH_SIZE) {
            const chunk = nonHoldings.slice(i, i + RECOMMEND_BATCH_SIZE);
            const chunkResults = await Promise.all(chunk.map(async (rec) => {
                const stockData = await getStockData(rec.code, rec.name);
                if (!stockData) return null;

                const currentPrice = stockData.price;
                // Prioritize: 1. Manual fair_price, 2. Analyst target_price, 3. Calculated 1.1x
                const fairPrice = rec.fair_price || stockData.targetPrice || Math.round(currentPrice * 1.1);

                if (currentPrice >= fairPrice) return null;

                return {
                    code: rec.code,
                    name: rec.name,
                    category: rec.category,
                    reason: rec.reason,
                    score: rec.score,
                    fairPrice: fairPrice,
                    currentPrice: currentPrice,
                    per: stockData.per,
                    pbr: stockData.pbr,
                    roe: stockData.roe,
                    targetPrice: stockData.targetPrice,
                    probability: Math.min(100, Math.round((fairPrice / currentPrice) * 50 + (rec.score / 2))),
                    analysis: stockData.analysis,
                    advice: stockData.advice,
                    market_opinion: stockData.market_opinion,
                    source: rec.source || 'manual',
                    tossUrl: stockData.tossUrl,
                };
            }));
            results.push(...chunkResults);
        }

        // 정렬 분리: manual 추천은 의미 있는 score(78~95)로 우선 정렬, algorithm 추천은 score=50 placeholder라
        // 정렬 기준이 의미 없음 → market_opinion 점수만 만족하면 manual 뒤에 그대로 추가 (버그-B 후속).
        const filtered = results.filter(r => r !== null && r.market_opinion === '긍정적');
        const manualSorted = filtered.filter(r => r.source === 'manual').sort((a, b) => b.score - a.score);
        const algorithmTail = filtered.filter(r => r.source !== 'manual');
        res.json([...manualSorted, ...algorithmTail]);
    } catch (error) {
        console.error('Recommendations API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

export default router;
