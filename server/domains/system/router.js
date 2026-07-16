import express from 'express';
import axios from 'axios';
import { query } from '../../db/connection.js';

const router = express.Router();

// GET /api/health - liveness + connectivity probe
// Render Health Check 용도로도 사용되므로 2~3초 이내 응답 유지가 중요.
// DB는 가벼운 ping(SELECT 1), 네이버 연결성 확인은 2초 타임아웃.
router.get('/health', async (req, res) => {
    const status = { api: false, database: false, lastSync: null };

    // DB ping (가벼움)
    try {
        await query('SELECT 1');
        status.database = true;
    } catch { /* database stays false */ }

    // 네이버 연결성 프로브 — 실패·지연 시 api=false만 되고 health는 계속 200 반환.
    try {
        const testResp = await axios.get('https://finance.naver.com/item/main.naver?code=005930', {
            timeout: 2000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        status.api = testResp.status === 200;
    } catch { /* api stays false */ }

    // lastSync는 96행 fullscan이라도 ms 단위. 실패해도 무시.
    try {
        const { rows } = await query('SELECT MAX(last_updated) AS ts FROM stocks WHERE last_updated IS NOT NULL');
        status.lastSync = rows[0]?.ts || null;
    } catch { /* ignore */ }

    res.json(status);
});

// GET /api/market/fear-greed - 간이 시장 온도 (0=공포, 100=탐욕)
//
// 3가지 컴포넌트의 가중 평균:
//   - RSI proxy (40%): 종목별 14일 SMA 대비 현재가 위치 (간이 RSI 대용).
//     실제 RSI 계산은 비싸므로 SMA 기준 60/40 분기로 근사.
//   - 외국인 매수 비율 (30%): 최근 5거래일 순매수 종목 / 전체 종목.
//   - 52주 고점 근접 비율 (30%): 현재가가 52주 고점의 95%+ 종목 비율.
//
// investor_history 비어 있으면 외국인 점수 50으로 폴백 (서버 에러 없이).
// 어떤 단계에서 에러가 나도 score:50/label:'중립' 반환.
router.get('/market/fear-greed', async (req, res) => {
    try {
        // 1. RSI proxy — 14일 단순이동평균 대비 현재가 위치
        const { rows: rsiRows } = await query(`
            WITH recent AS (
                SELECT code,
                       AVG(price) OVER (
                           PARTITION BY code
                           ORDER BY date
                           ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
                       ) AS avg14,
                       price,
                       date,
                       ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC) AS rn
                FROM stock_history
                WHERE date >= TO_CHAR(NOW() - INTERVAL '60 days', 'YYYYMMDD')
            )
            SELECT AVG(
                CASE
                    WHEN price > avg14 THEN 60
                    WHEN price < avg14 THEN 40
                    ELSE 50
                END
            )::numeric AS avg_rsi_proxy
            FROM recent
            WHERE rn = 1 AND avg14 IS NOT NULL
        `);
        const rsiScore = parseFloat(rsiRows[0]?.avg_rsi_proxy) || 50;

        // 2. 외국인 매수 비율 (최근 5거래일 순매수 합계 양수인 종목 / 전체)
        const { rows: foreignRows } = await query(`
            SELECT
                COUNT(CASE WHEN daily_sum > 0 THEN 1 END)::float
                / NULLIF(COUNT(*), 0) * 100 AS buy_ratio
            FROM (
                SELECT code, SUM(foreign_net) AS daily_sum
                FROM investor_history
                WHERE date >= TO_CHAR(NOW() - INTERVAL '7 days', 'YYYYMMDD')
                GROUP BY code
            ) t
        `);
        const foreignScore = parseFloat(foreignRows[0]?.buy_ratio);
        const foreignFinal = Number.isFinite(foreignScore) ? foreignScore : 50;

        // 3. 52주 고점 근접 종목 비율
        const { rows: highRows } = await query(`
            SELECT
                COUNT(CASE WHEN s.price >= h52.high_52w * 0.95 THEN 1 END)::float
                / NULLIF(COUNT(*), 0) * 100 AS near_high_ratio
            FROM stocks s
            LEFT JOIN LATERAL (
                SELECT MAX(high) AS high_52w
                FROM stock_history
                WHERE code = s.code
                  AND date >= TO_CHAR(NOW() - INTERVAL '365 days', 'YYYYMMDD')
            ) h52 ON true
            WHERE s.price IS NOT NULL AND h52.high_52w IS NOT NULL
        `);
        const highScore = parseFloat(highRows[0]?.near_high_ratio) || 50;

        const score = Math.round(rsiScore * 0.4 + foreignFinal * 0.3 + highScore * 0.3);
        const clamped = Math.max(0, Math.min(100, score));
        const label =
            clamped <= 20 ? '극단적 공포' :
            clamped <= 40 ? '공포' :
            clamped <= 60 ? '중립' :
            clamped <= 80 ? '탐욕' : '극단적 탐욕';

        res.json({
            score: clamped,
            label,
            components: {
                rsi: Math.round(rsiScore),
                foreign: Math.round(foreignFinal),
                high: Math.round(highScore),
            },
        });
    } catch (error) {
        console.error('Fear & Greed Error:', error.message);
        res.json({ score: 50, label: '중립', components: null });
    }
});

// GET /api/market/indices - KOSPI / KOSDAQ scrape
router.get('/market/indices', async (req, res) => {
    try {
        // 네이버 sise_index는 심볼(KOSPI/KOSDAQ)을 code로 받는다. 레거시 숫자코드(0001/1001)는
        // 둘 다 KOSPI 페이지로 폴백돼 KOSPI=KOSDAQ 동일값 버그를 유발했다 (3.13 BUG-1).
        const indices = [
            { symbol: 'KOSPI', code: 'KOSPI' },
            { symbol: 'KOSDAQ', code: 'KOSDAQ' }
        ];
        const results = await Promise.all(indices.map(async (idx) => {
            try {
                const r = await axios.get(`https://finance.naver.com/sise/sise_index.naver?code=${idx.code}`, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const html = new TextDecoder('euc-kr').decode(r.data);
                const priceMatch = html.match(/id="now_value"[^>]*>([\d,.]+)/);
                const changeMatch = html.match(/id="change_value_and_rate"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/);
                const value = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
                let change = '';
                let changeRate = '';
                if (changeMatch) {
                    const raw = changeMatch[1].replace(/<[^>]+>/g, '').trim();
                    const parts = raw.split(/\s+/);
                    change = parts[0] || '';
                    changeRate = parts[1] || '';
                }
                const isUp = html.includes('ico_up') || html.includes('plus');
                return { symbol: idx.symbol, value, change, changeRate, positive: isUp };
            } catch {
                return { symbol: idx.symbol, value: null, change: '', changeRate: '', positive: true };
            }
        }));
        res.json(results);
    } catch (error) {
        console.error('Market Index Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch indices' });
    }
});

export default router;
