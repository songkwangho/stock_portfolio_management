/**
 * sync-index-history.js — KOSPI/KOSDAQ 지수 일봉을 market_index_history에 적재 (3.14차 벤치마크용).
 *
 * 벤치마크(초과수익·정보비율) 계산은 포트폴리오 일별 수익률을 같은 기간 KOSPI 수익률과
 * 비교한다. 그러려면 KOSPI 지수의 과거 시계열이 DB에 있어야 하는데, 기존에는 어디에도
 * 저장하지 않았다(/market/indices는 현재값만 실시간 스크래핑). 이 스크립트가 그 공백을 채운다.
 *
 * 사용:
 *   DATABASE_URL=postgres://... node scripts/sync-index-history.js             # 3년치
 *   DATABASE_URL=postgres://... node scripts/sync-index-history.js --days 400  # 기간 지정
 *
 * 설계 메모:
 * - 네이버 siseJson은 symbol=KOSPI / KOSDAQ 로 지수 OHLC를 종목과 동일 포맷으로 반환한다.
 *   backfill-history.js와 같은 파싱 패턴을 재사용한다.
 * - ON CONFLICT UPSERT라 재실행 안전(멱등). 매일 다시 돌리면 최신 종가까지 갱신된다.
 * - 일 1회 자동 스케줄링(장마감 후)은 Phase 6 setupScheduler 편입으로 이월.
 *
 * 주의: DATABASE_URL 환경변수 필수.
 */
import axios from 'axios';
import pool, { withTransaction } from '../server/db/connection.js';
import { NAVER_FINANCE_URL } from '../server/scrapers/naver.js';

// symbol: DB 저장 심볼 / naver: 네이버 siseJson 조회 심볼 (현재는 동일하지만 분리해 둠).
const SYMBOLS = [
    { symbol: 'KOSPI', naver: 'KOSPI' },
    { symbol: 'KOSDAQ', naver: 'KOSDAQ' },
];

function parseDays() {
    const i = process.argv.indexOf('--days');
    return i >= 0 ? parseInt(process.argv[i + 1], 10) : 365 * 3;
}

function toYYYYMMDD(d) {
    return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchIndex(naverSymbol, days) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    const res = await axios.get(NAVER_FINANCE_URL, {
        params: {
            symbol: naverSymbol,
            requestType: 1,
            startTime: toYYYYMMDD(start),
            endTime: toYYYYMMDD(new Date()),
            timeframe: 'day',
        },
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' },
        responseType: 'text',
        timeout: 30000,
    });
    // 응답은 작은따옴표 섞인 JSON 유사 포맷 → naver.js fetchPriceHistory와 동일하게 치환 후 파싱.
    const raw = res.data.replace(/'/g, '"').trim();
    const rows = JSON.parse(raw);
    // header: [날짜, 시가, 고가, 저가, 종가, 거래량, 외국인소진율]
    return rows.slice(1)
        .map(r => ({ date: String(r[0]).trim(), close: parseFloat(r[4]) }))
        .filter(r => /^\d{8}$/.test(r.date) && Number.isFinite(r.close));
}

async function upsert(symbol, records) {
    if (records.length === 0) return 0;
    await withTransaction(async (client) => {
        for (const rec of records) {
            await client.query(`
                INSERT INTO market_index_history (symbol, date, close)
                VALUES ($1, $2, $3)
                ON CONFLICT (symbol, date) DO UPDATE SET close = EXCLUDED.close
            `, [symbol, rec.date, rec.close]);
        }
    });
    return records.length;
}

async function main() {
    const days = parseDays();
    console.log(`Index history sync: ${SYMBOLS.map(s => s.symbol).join(', ')} (${days} days each)`);
    let total = 0;
    for (const s of SYMBOLS) {
        try {
            const recs = await fetchIndex(s.naver, days);
            const n = await upsert(s.symbol, recs);
            total += n;
            console.log(`  ${s.symbol}: ${n} rows`);
        } catch (e) {
            console.error(`  ${s.symbol} FAILED:`, e.message);
        }
        await new Promise(r => setTimeout(r, 1000)); // rate limit
    }
    console.log(`Done. Total index rows upserted: ${total}`);
    await pool.end();
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
