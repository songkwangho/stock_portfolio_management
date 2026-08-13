// Phase 4 — stock_history 로드 + 유니버스 필터. DB 읽기 전용.
import pool from '../../server/db/connection.js';
import { CONFIG } from './config.mjs';

// 유니버스: stock_history 행수 ≥ MIN_HISTORY.
// 제외되는 종목은 신규상장·최근 확대적재분이라 전진 누적만 있다 — 과거 시점 t가 없어
// point-in-time 재구성이 불가능하다(억지로 넣으면 표본이 최근으로 쏠린다).
export async function loadUniverse() {
    const { rows } = await pool.query(
        `SELECT h.code, s.name, COUNT(*)::int AS rows
         FROM stock_history h LEFT JOIN stocks s ON s.code = h.code
         GROUP BY h.code, s.name
         ORDER BY h.code`
    );
    const all = rows.map(r => ({ code: r.code, name: r.name || r.code, rows: r.rows }));
    return {
        universe: all.filter(r => r.rows >= CONFIG.MIN_HISTORY),
        excluded: all.filter(r => r.rows < CONFIG.MIN_HISTORY),
    };
}

// 종목별 오름차순 시계열. date는 TEXT 'YYYYMMDD'(고정폭) → 사전식 = 시간순.
// 0·결측 가격 행은 제외하고 카운트한다(수익률 분모가 되면 Infinity가 새어 나간다).
export async function loadSeries(codes) {
    const params = [codes];
    let where = 'code = ANY($1)';
    if (CONFIG.PERIOD.start) { params.push(CONFIG.PERIOD.start); where += ` AND date >= $${params.length}`; }
    if (CONFIG.PERIOD.end) { params.push(CONFIG.PERIOD.end); where += ` AND date <= $${params.length}`; }

    const { rows } = await pool.query(
        `SELECT code, date, price, open, high, low, volume
         FROM stock_history WHERE ${where} ORDER BY code, date ASC`,
        params
    );

    const byCode = new Map();
    let dropped = 0;
    for (const r of rows) {
        const price = Number(r.price);
        if (!Number.isFinite(price) || price <= 0) { dropped++; continue; }
        if (!byCode.has(r.code)) byCode.set(r.code, []);
        byCode.get(r.code).push({
            date: r.date,
            price,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            volume: Number(r.volume),
        });
    }
    return { byCode, dropped, totalRows: rows.length };
}

// 벤치마크(KOSPI) 종가 — 초과수익용. 테이블이 비어 있으면 null을 돌려 호출부가 skip한다.
// (sync-index-history.js는 운영자 수동 실행이라 미적재 상태가 정상 경로다.)
export async function loadBenchmark(symbol) {
    try {
        const { rows } = await pool.query(
            'SELECT date, close FROM market_index_history WHERE symbol = $1 ORDER BY date ASC',
            [symbol]
        );
        if (rows.length === 0) return null;
        const m = new Map();
        for (const r of rows) {
            const c = Number(r.close);
            // market_index_history.date는 DATE 타입일 수 있다 → 'YYYYMMDD'로 정규화해
            // stock_history의 TEXT 키와 맞춘다(안 맞추면 전 표본이 조용히 bench_missing이 된다).
            const key = String(r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date).replace(/-/g, '').slice(0, 8);
            if (Number.isFinite(c) && c > 0) m.set(key, c);
        }
        return m;
    } catch (e) {
        console.warn(`  [benchmark] 로드 실패 — 초과수익 IC는 건너뜁니다: ${e.message}`);
        return null;
    }
}

export async function closePool() {
    try { await pool.end(); } catch { /* ignore */ }
}
