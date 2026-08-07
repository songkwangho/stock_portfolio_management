// stock_history 적재 공용 모듈 (2A) — backfill-history.js 스크립트와 journal 승격(promote.js)이 공유.
// 네이버 fchart API 일봉 조회 + stock_history upsert. 동작은 backfill-history.js에서 추출(불변).
import axios from 'axios';
import { withTransaction } from '../../db/connection.js';
import { NAVER_FINANCE_URL } from '../../scrapers/naver.js';

function toYYYYMMDD(date) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}

// code, days → 네이버 fchart 일봉 매치 배열. 한 번에 수년치 조회 가능(종목당 1회 호출).
// match groups: [1]=date(YYYYMMDD), [2]=open, [3]=high, [4]=low, [5]=close, [6]=volume
export async function fetchHistory(code, days) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    const res = await axios.get(NAVER_FINANCE_URL, {
        params: { symbol: code, requestType: 1, startTime: toYYYYMMDD(start), endTime: toYYYYMMDD(new Date()), timeframe: 'day' },
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' },
        timeout: 30000,
    });
    const cleaned = res.data.trim().replace(/\s+/g, '');
    return [...cleaned.matchAll(/\["(\d+)","?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?(\d+)"?,"?([\d.]+)"?\]/g)];
}

// code, matches → stock_history 원자 upsert(종목 단위 withTransaction). 반환: upsert 행 수.
export async function upsertHistory(code, matches) {
    if (matches.length === 0) return 0;
    await withTransaction(async (client) => {
        for (const m of matches) {
            await client.query(`
                INSERT INTO stock_history (code, date, price, open, high, low, volume)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT(code, date) DO UPDATE SET
                    price = EXCLUDED.price, open = EXCLUDED.open,
                    high = EXCLUDED.high, low = EXCLUDED.low, volume = EXCLUDED.volume
            `, [code, m[1], parseInt(m[5]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[6])]);
        }
    });
    return matches.length;
}
