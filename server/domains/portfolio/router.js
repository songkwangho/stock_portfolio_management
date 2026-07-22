import express from 'express';
import pool, { query } from '../../db/connection.js';
import { requireDeviceIdMiddleware } from '../../helpers/deviceId.js';
import { calculateHoldingOpinion } from '../analysis/scoring.js';
import { computeSMA } from '../../helpers/sma.js';
import { buildSetClause } from '../../helpers/queryBuilder.js';
import { recalcWeights } from './service.js';
import { getStockData } from '../stock/service.js';

const router = express.Router();
router.use(requireDeviceIdMiddleware);

// 피어슨 상관계수 — 정렬된 두 수익률 배열(같은 날짜 인덱스). 분산 0이면 정의 불가 → null.
function pearson(x, y) {
    const n = x.length;
    if (n < 2) return null;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx, dy = y[i] - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx <= 0 || syy <= 0) return null;
    return sxy / Math.sqrt(sxx * syy);
}

// GET /api/holdings - list holdings with runtime holding_opinion
router.get('/', async (req, res) => {
    const deviceId = req.deviceId;
    try {
        const { rows: holdings } = await query(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = $1
        `, [deviceId]);

        const enriched = await Promise.all(holdings.map(async (h) => {
            const { sma5, sma20 } = await computeSMA(pool, h.code);
            // pg NUMERIC → string이므로 calculateHoldingOpinion에 전달 전 Number() 캐스팅 필수.
            // 캐스팅 누락 시 `(currentPrice - avgPrice) / avgPrice` 연산에서 문자열/숫자 혼합 발생.
            const avgPriceNum = h.avg_price !== null ? Number(h.avg_price) : null;
            const priceNum = h.price !== null ? Number(h.price) : null;
            return {
                ...h,
                avg_price: avgPriceNum,
                weight: h.weight !== null ? Number(h.weight) : null,
                quantity: Number(h.quantity || 0),
                price: priceNum,
                per: h.per !== null ? Number(h.per) : null,
                pbr: h.pbr !== null ? Number(h.pbr) : null,
                roe: h.roe !== null ? Number(h.roe) : null,
                market_opinion: h.market_opinion || '중립적',
                holding_opinion: calculateHoldingOpinion(avgPriceNum, priceNum, sma5, sma20),
                sma_available: sma5 !== null,
            };
        }));

        res.json(enriched);
    } catch (error) {
        console.error('Holdings GET Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch holdings' });
    }
});

// GET /api/holdings/sharpe - 포트폴리오 가중 평균 샤프 지수.
// 단순화 모델: 종목별 20일 일간 수익률 stddev로 변동성 산출 → 252거래일 환산.
// 가중치는 holding_stocks.weight (없으면 동일 가중 10).
// 보유 종목이 없거나 모든 종목의 히스토리가 < 5일이면 sharpe: null 반환.
router.get('/sharpe', async (req, res) => {
    const deviceId = req.deviceId;
    const RISK_FREE_RATE = 3.5; // 한국 기준금리 근사 (연 %).
    try {
        const { rows: holdings } = await query(
            'SELECT code, weight FROM holding_stocks WHERE device_id = $1',
            [deviceId]
        );
        if (holdings.length === 0) return res.json({ sharpe: null, stockCount: 0 });

        const results = [];
        for (const h of holdings) {
            const { rows: hist } = await query(
                'SELECT price FROM stock_history WHERE code = $1 ORDER BY date DESC LIMIT 21',
                [h.code]
            );
            if (hist.length < 5) continue;

            const prices = hist.map(r => Number(r.price)).reverse();
            const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i] * 100);
            const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / returns.length;
            const stdDev = Math.sqrt(variance);

            const annualReturn = avg * 252;
            const annualStd = stdDev * Math.sqrt(252);
            const sharpe = annualStd > 0 ? (annualReturn - RISK_FREE_RATE) / annualStd : 0;

            results.push({ code: h.code, sharpe, weight: h.weight !== null ? Number(h.weight) : 10 });
        }

        if (results.length === 0) return res.json({ sharpe: null, stockCount: 0 });

        const totalWeight = results.reduce((a, b) => a + b.weight, 0) || 1;
        const weighted = results.reduce((a, b) => a + b.sharpe * b.weight / totalWeight, 0);
        const sharpe = Math.round(weighted * 100) / 100;

        res.json({ sharpe, stockCount: results.length });
    } catch (error) {
        console.error('Sharpe Error:', error.message);
        res.json({ sharpe: null, stockCount: 0 });
    }
});

// GET /api/holdings/history - daily aggregated portfolio value
router.get('/history', async (req, res) => {
    const deviceId = req.deviceId;
    try {
        const { rows: result } = await query(`
            SELECT
                sh.date,
                SUM(sh.price * h.quantity)::bigint AS value,
                SUM(h.avg_price * h.quantity)::bigint AS cost
            FROM stock_history sh
            JOIN holding_stocks h ON sh.code = h.code
            WHERE h.device_id = $1 AND sh.date IN (
                SELECT DISTINCT date FROM stock_history
                ORDER BY date DESC LIMIT 20
            )
            GROUP BY sh.date
            ORDER BY sh.date
        `, [deviceId]);

        const mapped = result.map(d => {
            const value = Number(d.value);
            const cost = Number(d.cost);
            return {
                date: d.date,
                value,
                cost,
                profitRate: cost > 0
                    ? parseFloat(((value - cost) / cost * 100).toFixed(2))
                    : 0,
            };
        });

        res.json(mapped);
    } catch (error) {
        console.error('Holdings History Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch holdings history' });
    }
});

// GET /api/holdings/benchmark - KOSPI 대비 초과수익 + 정보비율(IR).
// 현재 보유 구성을 과거 시세로 역산한 일별 가치(= /holdings/history와 동일 시계열)로 포트폴리오
// 일별 수익률을 구하고, 같은 날짜의 KOSPI 종가 변화율과 비교한다. market_index_history에 KOSPI
// 히스토리가 없거나(스크립트 미실행) 정렬 가능한 날짜가 부족하면 available:false로 폴백.
router.get('/benchmark', async (req, res) => {
    const deviceId = req.deviceId;
    const BENCH = 'KOSPI';
    try {
        const { rows } = await query(`
            WITH last_dates AS (
                SELECT DISTINCT date FROM stock_history ORDER BY date DESC LIMIT 20
            ),
            port AS (
                SELECT sh.date, SUM(sh.price * h.quantity)::bigint AS value
                FROM stock_history sh
                JOIN holding_stocks h ON sh.code = h.code
                WHERE h.device_id = $1 AND sh.date IN (SELECT date FROM last_dates)
                GROUP BY sh.date
            )
            SELECT p.date, p.value, m.close
            FROM port p
            JOIN market_index_history m ON m.date = p.date AND m.symbol = $2
            ORDER BY p.date
        `, [deviceId, BENCH]);

        if (rows.length < 5) return res.json({ available: false });

        const values = rows.map(r => Number(r.value));
        const closes = rows.map(r => Number(r.close));

        // 일별 초과수익(%) 시계열 = 포트 일수익률 - KOSPI 일수익률.
        const excess = [];
        for (let i = 1; i < rows.length; i++) {
            if (values[i - 1] <= 0 || closes[i - 1] <= 0) continue;
            const pr = (values[i] - values[i - 1]) / values[i - 1] * 100;
            const br = (closes[i] - closes[i - 1]) / closes[i - 1] * 100;
            excess.push(pr - br);
        }
        if (excess.length < 4) return res.json({ available: false });

        const last = rows.length - 1;
        const portfolioReturn = values[0] > 0 ? (values[last] - values[0]) / values[0] * 100 : 0;
        const benchmarkReturn = closes[0] > 0 ? (closes[last] - closes[0]) / closes[0] * 100 : 0;
        const excessReturn = portfolioReturn - benchmarkReturn;

        const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
        const variance = excess.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / excess.length;
        const std = Math.sqrt(variance);
        const trackingError = std * Math.sqrt(252);           // 초과수익 표준편차(연환산)
        const informationRatio = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

        res.json({
            available: true,
            period: `${rows.length}d`,
            portfolioReturn: +portfolioReturn.toFixed(2),
            benchmarkReturn: +benchmarkReturn.toFixed(2),
            excessReturn: +excessReturn.toFixed(2),
            informationRatio: +informationRatio.toFixed(2),
            trackingError: +trackingError.toFixed(2),
        });
    } catch (error) {
        console.error('Benchmark Error:', error.message);
        res.json({ available: false });
    }
});

// GET /api/holdings/correlation - 보유 종목 간 상관관계(최근 60거래일 일별 수익률, 피어슨).
// "비중은 나눴어도 같이 움직이면 분산이 아니다"에 답하는 지표. 보유 2종목 이상만.
// 종목별 history는 한 쿼리로 묶어 조회(Neon 풀 max=5 고려). 20일 미만 데이터 종목은 제외.
// 상위 3쌍(상관 내림차순) + max/avg 반환. 상관계수는 방향이 아닌 관계 강도 → 프론트에서 방향색 미사용.
router.get('/correlation', async (req, res) => {
    const deviceId = req.deviceId;
    try {
        const { rows: holdings } = await query(
            `SELECT h.code, s.name FROM holding_stocks h JOIN stocks s ON s.code = h.code WHERE h.device_id = $1`,
            [deviceId]
        );
        if (holdings.length === 0) return res.json({ available: false, reason: 'empty' });
        if (holdings.length === 1) return res.json({ available: false, reason: 'single' });

        const codes = holdings.map(h => h.code);
        const nameByCode = Object.fromEntries(holdings.map(h => [h.code, h.name]));

        // 최근 61거래일(→ 60 수익률)을 전 보유 종목에 대해 한 번에 조회.
        const { rows: hist } = await query(`
            SELECT code, date, price
            FROM stock_history
            WHERE code = ANY($1) AND date IN (
                SELECT DISTINCT date FROM stock_history ORDER BY date DESC LIMIT 61
            )
            ORDER BY code, date
        `, [codes]);

        const pricesByCode = {};
        for (const r of hist) {
            (pricesByCode[r.code] ||= []).push({ date: r.date, price: Number(r.price) });
        }

        // code → { date: 일별수익률 }. 20일 미만이면 제외.
        const returnsByCode = {};
        for (const code of codes) {
            const arr = pricesByCode[code] || [];
            if (arr.length < 21) continue;
            const map = {};
            for (let i = 1; i < arr.length; i++) {
                if (arr[i - 1].price <= 0) continue;
                map[arr[i].date] = (arr[i].price - arr[i - 1].price) / arr[i - 1].price;
            }
            if (Object.keys(map).length >= 20) returnsByCode[code] = map;
        }

        const valid = Object.keys(returnsByCode);
        if (valid.length < 2) return res.json({ available: false, reason: 'insufficient' });

        const pairs = [];
        for (let i = 0; i < valid.length; i++) {
            for (let j = i + 1; j < valid.length; j++) {
                const a = returnsByCode[valid[i]], b = returnsByCode[valid[j]];
                const common = Object.keys(a).filter(d => d in b);
                if (common.length < 20) continue;
                const r = pearson(common.map(d => a[d]), common.map(d => b[d]));
                if (r === null) continue;
                pairs.push({
                    codeA: valid[i], nameA: nameByCode[valid[i]],
                    codeB: valid[j], nameB: nameByCode[valid[j]],
                    correlation: +r.toFixed(2),
                });
            }
        }
        if (pairs.length === 0) return res.json({ available: false, reason: 'insufficient' });

        pairs.sort((p, q) => q.correlation - p.correlation);
        const corrs = pairs.map(p => p.correlation);
        const maxCorrelation = Math.max(...corrs);
        const avgCorrelation = +(corrs.reduce((a, b) => a + b, 0) / corrs.length).toFixed(2);

        res.json({ available: true, pairs: pairs.slice(0, 3), maxCorrelation, avgCorrelation });
    } catch (error) {
        console.error('Correlation Error:', error.message);
        res.json({ available: false, reason: 'error' });
    }
});

// POST /api/holdings - upsert holding (creates master stock if needed)
router.post('/', async (req, res) => {
    const deviceId = req.deviceId;
    const { code, name, avgPrice, quantity } = req.body;
    try {
        await getStockData(code, name);

        await query(`
            INSERT INTO holding_stocks (device_id, code, avg_price, weight, quantity, last_updated)
            VALUES ($1, $2, $3, 0, $4, NOW())
            ON CONFLICT(device_id, code) DO UPDATE SET
                avg_price = EXCLUDED.avg_price,
                quantity = EXCLUDED.quantity,
                last_updated = NOW()
        `, [deviceId, code, avgPrice, quantity || 0]);

        await recalcWeights(pool, deviceId);

        const { rows: updatedRows } = await query(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = $1 AND s.code = $2
        `, [deviceId, code]);
        const updated = updatedRows[0];

        if (updated) {
            const { sma5, sma20 } = await computeSMA(pool, code);
            // pg NUMERIC → string. calculateHoldingOpinion 호출 전에 모두 Number() 캐스팅 필수 (버그-3 후속).
            updated.avg_price = updated.avg_price !== null ? Number(updated.avg_price) : null;
            updated.weight = updated.weight !== null ? Number(updated.weight) : null;
            updated.quantity = Number(updated.quantity || 0);
            updated.price = updated.price !== null ? Number(updated.price) : null;
            updated.per = updated.per !== null ? Number(updated.per) : null;
            updated.pbr = updated.pbr !== null ? Number(updated.pbr) : null;
            updated.roe = updated.roe !== null ? Number(updated.roe) : null;
            updated.holding_opinion = calculateHoldingOpinion(updated.avg_price, updated.price, sma5, sma20);
            updated.market_opinion = updated.market_opinion || '중립적';
            updated.sma_available = sma5 !== null;
        }
        res.json(updated);
    } catch (error) {
        console.error('Holdings POST Error:', error.message);
        res.status(500).json({ error: 'Failed to add/update holding' });
    }
});

// PUT /api/holdings/:code - partial update (avgPrice / quantity)
router.put('/:code', async (req, res) => {
    const deviceId = req.deviceId;
    const { code } = req.params;
    const { avgPrice, quantity } = req.body;
    try {
        const { rows: existingRows } = await query(
            'SELECT 1 FROM holding_stocks WHERE device_id = $1 AND code = $2',
            [deviceId, code]
        );
        if (existingRows.length === 0) return res.status(404).json({ error: 'Holding not found' });

        const { clause, params, nextIndex } = buildSetClause(
            { avg_price: avgPrice, quantity },
            1
        );
        if (!clause) return res.status(400).json({ error: 'No fields to update' });

        // last_updated = NOW() + WHERE device_id / code 뒤에 이어 붙임
        const sql = `UPDATE holding_stocks SET ${clause}, last_updated = NOW()
                     WHERE device_id = $${nextIndex} AND code = $${nextIndex + 1}`;
        await query(sql, [...params, deviceId, code]);

        await recalcWeights(pool, deviceId);

        const { rows: updatedRows } = await query(`
            SELECT s.*, h.avg_price, h.weight, h.quantity, a.opinion AS market_opinion
            FROM stocks s
            JOIN holding_stocks h ON s.code = h.code
            LEFT JOIN stock_analysis a ON s.code = a.code
            WHERE h.device_id = $1 AND s.code = $2
        `, [deviceId, code]);
        const updated = updatedRows[0];

        if (updated) {
            const { sma5, sma20 } = await computeSMA(pool, code);
            // pg NUMERIC → string. calculateHoldingOpinion 호출 전에 모두 Number() 캐스팅 필수 (버그-3 후속).
            updated.avg_price = updated.avg_price !== null ? Number(updated.avg_price) : null;
            updated.weight = updated.weight !== null ? Number(updated.weight) : null;
            updated.quantity = Number(updated.quantity || 0);
            updated.price = updated.price !== null ? Number(updated.price) : null;
            updated.per = updated.per !== null ? Number(updated.per) : null;
            updated.pbr = updated.pbr !== null ? Number(updated.pbr) : null;
            updated.roe = updated.roe !== null ? Number(updated.roe) : null;
            updated.holding_opinion = calculateHoldingOpinion(updated.avg_price, updated.price, sma5, sma20);
            updated.market_opinion = updated.market_opinion || '중립적';
            updated.sma_available = sma5 !== null;
        }
        res.json(updated);
    } catch (error) {
        console.error('Holdings PUT Error:', error.message);
        res.status(500).json({ error: 'Failed to update holding' });
    }
});

// DELETE /api/holdings/:code
router.delete('/:code', async (req, res) => {
    const deviceId = req.deviceId;
    const { code } = req.params;
    try {
        await query('DELETE FROM holding_stocks WHERE device_id = $1 AND code = $2', [deviceId, code]);
        await recalcWeights(pool, deviceId);
        res.json({ success: true });
    } catch (error) {
        console.error('Holdings DELETE Error:', error.message);
        res.status(500).json({ error: 'Failed to delete holding' });
    }
});

export default router;
