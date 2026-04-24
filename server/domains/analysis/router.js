import express from 'express';
import axios from 'axios';
import pool, { query } from '../../db/connection.js';
import { calculateIndicators } from './indicators.js';
import { median } from './scoring.js';
import { buildWhereClause } from '../../helpers/queryBuilder.js';
import { NAVER_FINANCE_URL } from '../../scrapers/naver.js';

const router = express.Router();

// GET /api/stock/:code/indicators
router.get('/stock/:code/indicators', async (req, res) => {
    try {
        const result = await calculateIndicators(pool, req.params.code);
        res.json(result);
    } catch (error) {
        console.error('Indicators Error:', error.message);
        res.status(500).json({ error: 'Failed to calculate indicators' });
    }
});

// GET /api/stock/:code/volatility - stddev of daily returns over recent N days
router.get('/stock/:code/volatility', async (req, res) => {
    const { code } = req.params;
    try {
        const { rows: history } = await query(
            'SELECT price FROM stock_history WHERE code = $1 ORDER BY date DESC LIMIT 6',
            [code]
        );

        if (history.length < 2) {
            return res.json({ volatility: null });
        }

        const prices = history.map(h => Number(h.price)).reverse();
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
        const volatility = parseFloat((Math.sqrt(variance) * 100).toFixed(2));

        res.json({ volatility });
    } catch (error) {
        console.error('Volatility Error:', error.message);
        res.status(500).json({ error: 'Failed to calculate volatility' });
    }
});

// GET /api/stock/:code/financials - scrape quarterly highlight table
router.get('/stock/:code/financials', async (req, res) => {
    const { code } = req.params;
    try {
        const response = await axios.get(`https://finance.naver.com/item/main.naver?code=${code}`, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = new TextDecoder('euc-kr').decode(response.data);

        const financials = [];

        const periodMatch = html.match(/id="highlight_D_Q"[\s\S]*?<tr[\s\S]*?<th[^>]*>구분<\/th>([\s\S]*?)<\/tr>/);
        const periods = [];
        if (periodMatch) {
            const thMatches = [...periodMatch[1].matchAll(/<th[^>]*>([\d.]+)<\/th>/g)];
            for (const m of thMatches) periods.push(m[1]);
        }

        const tableMatch = html.match(/id="highlight_D_Q"([\s\S]*?)<\/table>/);
        if (tableMatch) {
            const tableHtml = tableMatch[1];
            const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

            for (const row of rows) {
                const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c =>
                    c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
                );
                if (cells.length > 1) {
                    const label = cells[0];
                    if (['매출액', '영업이익', '당기순이익'].includes(label)) {
                        const values = cells.slice(1).map(v => {
                            const num = v.replace(/,/g, '');
                            return num === '' || isNaN(Number(num)) ? null : Number(num);
                        });
                        financials.push({ label, values });
                    }
                }
            }
        }

        res.json({ periods, financials });
    } catch (error) {
        console.error('Financials Error:', error.message);
        res.json({ periods: [], financials: [] });
    }
});

// GET /api/stock/:code/news - scrape recent news for a stock
router.get('/stock/:code/news', async (req, res) => {
    const { code } = req.params;
    try {
        const response = await axios.get(`https://finance.naver.com/item/news_news.naver?code=${code}&page=1`, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = new TextDecoder('euc-kr').decode(response.data);

        const news = [];
        const rows = [...html.matchAll(/<tr[\s\S]*?class="(?:first|last|)"[\s\S]*?>([\s\S]*?)<\/tr>/g)];

        for (const row of rows) {
            const titleMatch = row[1].match(/<a[^>]*href="([^"]*)"[^>]*class="tit"[^>]*>([\s\S]*?)<\/a>/);
            const dateMatch = row[1].match(/<td[^>]*class="date"[^>]*>([\s\S]*?)<\/td>/);
            const sourceMatch = row[1].match(/<td[^>]*class="info"[^>]*>([\s\S]*?)<\/td>/);

            if (titleMatch) {
                news.push({
                    title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
                    url: titleMatch[1].startsWith('http') ? titleMatch[1] : `https://finance.naver.com${titleMatch[1]}`,
                    date: dateMatch ? dateMatch[1].replace(/<[^>]+>/g, '').trim() : '',
                    source: sourceMatch ? sourceMatch[1].replace(/<[^>]+>/g, '').trim() : '',
                });
            }
            if (news.length >= 10) break;
        }

        res.json(news);
    } catch (error) {
        console.error('News Error:', error.message);
        res.json([]);
    }
});

// GET /api/stock/:code/chart/:timeframe - weekly/monthly chart data
router.get('/stock/:code/chart/:timeframe', async (req, res) => {
    const { code, timeframe } = req.params;
    try {
        const daysBack = timeframe === 'monthly' ? 400 : 200;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startTime = startDate.toISOString().slice(0, 10).replace(/-/g, '');
        const endTime = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const tf = timeframe === 'monthly' ? 'month' : 'week';
        const response = await axios.get(NAVER_FINANCE_URL, {
            params: { symbol: code, requestType: 1, startTime, endTime, timeframe: tf },
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' }
        });

        const rawData = response.data.trim().replace(/\s+/g, '');
        const matches = [...rawData.matchAll(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g)];

        const data = matches.map(m => ({
            date: m[1],
            open: parseInt(m[2]),
            high: parseInt(m[3]),
            low: parseInt(m[4]),
            price: parseInt(m[5]),
            volume: parseInt(m[6]),
        }));

        res.json(data);
    } catch (error) {
        console.error('Chart Timeframe Error:', error.message);
        res.json([]);
    }
});

// GET /api/screener - filter stocks by conditions (legacy) OR by dynamic preset.
//
// preset 파라미터가 있으면 히스토리/수급 기반 프리셋 쿼리로 분기:
//   - breakout_52w : 52주 신고가 돌파 (stock_history.high JOIN)
//   - foreign_buy  : 외국인 최근 5거래일 순매수 상위 (investor_history 집계)
//   - fund_buy     : 기관(연기금 포함) 최근 5거래일 순매수 상위
//   - neglected    : 30일 평균 대비 최근 5일 거래량 < 30% (소외 역발상 지표)
//
// 기존 필터(perMin/pbrMax/roeMin 등)는 preset 미지정 시 그대로 동작 (하위 호환).
router.get('/screener', async (req, res) => {
    try {
        const { preset } = req.query;

        if (preset === 'breakout_52w') {
            // 52주 신고가 돌파: 최근 1년치 high 중 최대값 대비 현재가가 98%+ 도달.
            // breakout_pct >= 0 이면 실제 돌파, -2~0 사이면 근접.
            const { rows } = await query(`
                SELECT s.code, s.name, s.category, s.price, s.change, s.change_rate,
                       s.per, s.pbr, s.roe, a.opinion AS market_opinion,
                       h52.high_52w,
                       ROUND(((s.price - h52.high_52w) / h52.high_52w::numeric * 100), 1) AS breakout_pct
                FROM stocks s
                LEFT JOIN stock_analysis a ON s.code = a.code
                LEFT JOIN LATERAL (
                    SELECT MAX(high) AS high_52w
                    FROM stock_history
                    WHERE code = s.code
                      AND date >= TO_CHAR(NOW() - INTERVAL '365 days', 'YYYYMMDD')
                      AND date <  TO_CHAR(NOW() - INTERVAL '1 day', 'YYYYMMDD')
                ) h52 ON true
                WHERE s.price IS NOT NULL AND s.price > 0
                  AND h52.high_52w IS NOT NULL
                  AND s.price >= h52.high_52w * 0.98
                ORDER BY breakout_pct DESC NULLS LAST
                LIMIT 20
            `);
            return res.json(rows.map(r => ({
                ...r,
                per: r.per !== null ? Number(r.per) : null,
                pbr: r.pbr !== null ? Number(r.pbr) : null,
                roe: r.roe !== null ? Number(r.roe) : null,
                high_52w: r.high_52w !== null ? Number(r.high_52w) : null,
                breakout_pct: r.breakout_pct !== null ? Number(r.breakout_pct) : null,
            })));
        }

        if (preset === 'foreign_buy') {
            const { rows } = await query(`
                SELECT s.code, s.name, s.category, s.price, s.change, s.change_rate,
                       s.per, s.pbr, s.roe, a.opinion AS market_opinion,
                       inv.foreign_sum
                FROM stocks s
                LEFT JOIN stock_analysis a ON s.code = a.code
                JOIN (
                    SELECT code, SUM(foreign_net)::bigint AS foreign_sum
                    FROM investor_history
                    WHERE date >= TO_CHAR(NOW() - INTERVAL '7 days', 'YYYYMMDD')
                    GROUP BY code
                    HAVING SUM(foreign_net) > 0
                ) inv ON s.code = inv.code
                ORDER BY inv.foreign_sum DESC
                LIMIT 20
            `);
            return res.json(rows.map(r => ({
                ...r,
                per: r.per !== null ? Number(r.per) : null,
                pbr: r.pbr !== null ? Number(r.pbr) : null,
                roe: r.roe !== null ? Number(r.roe) : null,
                foreign_sum: r.foreign_sum !== null ? Number(r.foreign_sum) : 0,
            })));
        }

        if (preset === 'fund_buy') {
            // investor_history.institution은 기관(연기금 + 금융투자 + 투신 등) 합산.
            // 연기금 단독 컬럼이 없는 현 스키마 상 '기관 순매수'로 표기하고 UI 레이블도 '기관/연기금'으로.
            const { rows } = await query(`
                SELECT s.code, s.name, s.category, s.price, s.change, s.change_rate,
                       s.per, s.pbr, s.roe, a.opinion AS market_opinion,
                       inv.fund_sum
                FROM stocks s
                LEFT JOIN stock_analysis a ON s.code = a.code
                JOIN (
                    SELECT code, SUM(institution)::bigint AS fund_sum
                    FROM investor_history
                    WHERE date >= TO_CHAR(NOW() - INTERVAL '7 days', 'YYYYMMDD')
                    GROUP BY code
                    HAVING SUM(institution) > 0
                ) inv ON s.code = inv.code
                ORDER BY inv.fund_sum DESC
                LIMIT 20
            `);
            return res.json(rows.map(r => ({
                ...r,
                per: r.per !== null ? Number(r.per) : null,
                pbr: r.pbr !== null ? Number(r.pbr) : null,
                roe: r.roe !== null ? Number(r.roe) : null,
                fund_sum: r.fund_sum !== null ? Number(r.fund_sum) : 0,
            })));
        }

        if (preset === 'neglected') {
            // 30일 평균 거래량 대비 최근 5일 평균 거래량이 30% 이하인 종목.
            // FILTER 절로 같은 from-to에 대해 두 집계를 한 번에 계산.
            const { rows } = await query(`
                SELECT s.code, s.name, s.category, s.price, s.change, s.change_rate,
                       s.per, s.pbr, s.roe, a.opinion AS market_opinion,
                       vol_stats.avg_vol_30d, vol_stats.recent_vol,
                       ROUND((vol_stats.recent_vol::numeric / NULLIF(vol_stats.avg_vol_30d, 0) * 100), 1) AS vol_ratio
                FROM stocks s
                LEFT JOIN stock_analysis a ON s.code = a.code
                JOIN (
                    SELECT code,
                           AVG(volume) FILTER (WHERE date >= TO_CHAR(NOW() - INTERVAL '30 days', 'YYYYMMDD'))::bigint AS avg_vol_30d,
                           AVG(volume) FILTER (WHERE date >= TO_CHAR(NOW() - INTERVAL '5 days', 'YYYYMMDD'))::bigint  AS recent_vol
                    FROM stock_history
                    WHERE date >= TO_CHAR(NOW() - INTERVAL '30 days', 'YYYYMMDD')
                    GROUP BY code
                ) vol_stats ON s.code = vol_stats.code
                WHERE vol_stats.avg_vol_30d IS NOT NULL
                  AND vol_stats.avg_vol_30d > 0
                  AND vol_stats.recent_vol IS NOT NULL
                  AND vol_stats.recent_vol < vol_stats.avg_vol_30d * 0.3
                ORDER BY (vol_stats.recent_vol::numeric / NULLIF(vol_stats.avg_vol_30d, 0)) ASC
                LIMIT 20
            `);
            return res.json(rows.map(r => ({
                ...r,
                per: r.per !== null ? Number(r.per) : null,
                pbr: r.pbr !== null ? Number(r.pbr) : null,
                roe: r.roe !== null ? Number(r.roe) : null,
                avg_vol_30d: r.avg_vol_30d !== null ? Number(r.avg_vol_30d) : 0,
                recent_vol: r.recent_vol !== null ? Number(r.recent_vol) : 0,
                vol_ratio: r.vol_ratio !== null ? Number(r.vol_ratio) : null,
            })));
        }

        // 기존 필터 기반 스크리너 (preset 미지정 시)
        const { perMax, perMin, pbrMax, pbrMin, roeMin, priceMin, priceMax, category } = req.query;

        // PER 음수(적자 기업) 제외는 perMin/perMax가 있을 때만 강제.
        const perFilterActive = perMin !== undefined || perMax !== undefined;

        const conditions = [];
        if (perFilterActive) conditions.push({ sql: 's.per > ', value: 0 });
        if (perMin !== undefined) conditions.push({ sql: 's.per >= ', value: Number(perMin) });
        if (perMax !== undefined) conditions.push({ sql: 's.per <= ', value: Number(perMax) });
        if (pbrMin !== undefined) conditions.push({ sql: 's.pbr >= ', value: Number(pbrMin) });
        if (pbrMax !== undefined) conditions.push({ sql: 's.pbr <= ', value: Number(pbrMax) });
        if (roeMin !== undefined) conditions.push({ sql: 's.roe >= ', value: Number(roeMin) });
        if (priceMin !== undefined) conditions.push({ sql: 's.price >= ', value: Number(priceMin) });
        if (priceMax !== undefined) conditions.push({ sql: 's.price <= ', value: Number(priceMax) });
        if (category) conditions.push({ sql: 's.category = ', value: category });

        const { clause, params } = buildWhereClause(conditions, 1);
        const whereExtra = clause ? ` AND ${clause}` : '';

        const sql = `
            SELECT s.*, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.price > 0${whereExtra}
            ORDER BY s.roe DESC NULLS LAST
            LIMIT 50
        `;
        const { rows: results } = await query(sql, params);
        const mapped = results.map(s => ({
            ...s,
            per: s.per !== null ? Number(s.per) : null,
            pbr: s.pbr !== null ? Number(s.pbr) : null,
            roe: s.roe !== null ? Number(s.roe) : null,
        }));
        res.json(mapped);
    } catch (error) {
        console.error('Screener Error:', error.message);
        res.status(500).json({ error: 'Screener failed' });
    }
});

// GET /api/sector/:category/compare - sector medians + per-stock comparison
router.get('/sector/:category/compare', async (req, res) => {
    const { category } = req.params;
    try {
        const { rows: rawStocks } = await query(`
            SELECT s.code, s.name, s.price, s.per, s.pbr, s.roe, s.target_price, a.opinion AS market_opinion
            FROM stocks s
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE s.category = $1 AND s.price > 0
            ORDER BY s.roe DESC NULLS LAST
        `, [category]);

        const stocks = rawStocks.map(s => ({
            ...s,
            per: s.per !== null ? Number(s.per) : null,
            pbr: s.pbr !== null ? Number(s.pbr) : null,
            roe: s.roe !== null ? Number(s.roe) : null,
        }));

        const perVals = stocks.filter(s => s.per && s.per > 0).map(s => s.per);
        const pbrVals = stocks.filter(s => s.pbr && s.pbr > 0).map(s => s.pbr);
        const roeVals = stocks.filter(s => s.roe).map(s => s.roe);

        const avgPer = perVals.length ? perVals.reduce((a, v) => a + v, 0) / perVals.length : 0;
        const avgPbr = pbrVals.length ? pbrVals.reduce((a, v) => a + v, 0) / pbrVals.length : 0;
        const avgRoe = roeVals.length ? roeVals.reduce((a, v) => a + v, 0) / roeVals.length : 0;

        const medPer = median(perVals) || 0;
        const medPbr = median(pbrVals) || 0;
        const medRoe = median(roeVals) || 0;

        res.json({
            category,
            averages: {
                per: parseFloat(avgPer.toFixed(2)),
                pbr: parseFloat(avgPbr.toFixed(2)),
                roe: parseFloat(avgRoe.toFixed(2)),
            },
            medians: {
                per: parseFloat(medPer.toFixed(2)),
                pbr: parseFloat(medPbr.toFixed(2)),
                roe: parseFloat(medRoe.toFixed(2)),
            },
            stocks: stocks.map(s => ({
                ...s,
                perVsAvg: s.per ? parseFloat(((s.per - avgPer) / avgPer * 100).toFixed(1)) : null,
                pbrVsAvg: s.pbr ? parseFloat(((s.pbr - avgPbr) / avgPbr * 100).toFixed(1)) : null,
                roeVsAvg: s.roe ? parseFloat(((s.roe - avgRoe) / avgRoe * 100).toFixed(1)) : null,
            })),
        });
    } catch (error) {
        console.error('Sector Compare Error:', error.message);
        res.status(500).json({ error: 'Sector comparison failed' });
    }
});

export default router;
