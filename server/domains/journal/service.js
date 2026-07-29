// 4.5b차 — 거래일지 오케스트레이션: 파싱 → 정규화 → (종목코드 해석) → 적재 / 삭제.
// 안전: 원본 CSV는 저장하지 않는다(파싱 즉시 폐기). PII는 파서 화이트리스트에서 이미 제거됨.
// 종목 식별: 6자리 코드 우선, 없으면 종목명→stocks 매핑. 유니버스 밖은 skip + coverage로 투명 처리.
import { query } from '../../db/connection.js';
import { parseTrades } from './parsers/index.js';

// 종목명 정규화(공백 제거)로 매핑 견고화.
const norm = (s) => String(s || '').replace(/\s/g, '');

// deviceId, csvText, brokerHint → { broker, imported, skipped, dateRange, coverage }
export async function ingest(deviceId, csvText, brokerHint) {
    const { broker, trades } = parseTrades(csvText, brokerHint);
    if (trades.length === 0) {
        return { broker, imported: 0, skipped: 0, dateRange: null, coverage: { matched: 0, unmatched: 0 } };
    }

    // 우리 유니버스(stocks) 로드 — 코드셋 + 종목명→코드 맵.
    const { rows: universe } = await query('SELECT code, name FROM stocks');
    const codeSet = new Set(universe.map(r => r.code));
    const nameToCode = new Map();
    for (const r of universe) if (r.name) nameToCode.set(norm(r.name), r.code);

    // 코드 해석 — 유니버스 밖은 unmatched(skip).
    const resolved = [];
    let unmatched = 0;
    for (const t of trades) {
        let code = t.code && codeSet.has(t.code) ? t.code : null;
        if (!code && t.name) code = nameToCode.get(norm(t.name)) || null;
        if (!code) { unmatched++; continue; }
        resolved.push({ code, side: t.side, quantity: t.quantity, price: t.price, tradedAt: t.tradedAt, source: t.source || broker });
    }

    if (resolved.length > 0) await bulkInsert(deviceId, resolved);

    const dates = resolved.map(t => t.tradedAt).sort();
    return {
        broker,
        imported: resolved.length,
        skipped: unmatched,
        dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
        coverage: { matched: resolved.length, unmatched },
    };
}

// 다중행 INSERT (파라미터 상한 회피 위해 1000행 단위 청크).
async function bulkInsert(deviceId, trades) {
    const CHUNK = 1000;
    for (let i = 0; i < trades.length; i += CHUNK) {
        const slice = trades.slice(i, i + CHUNK);
        const values = [];
        const params = [];
        slice.forEach((t, idx) => {
            const b = idx * 7;
            values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
            params.push(deviceId, t.code, t.side, t.quantity, t.price, t.tradedAt, t.source);
        });
        await query(
            `INSERT INTO journal_trades (device_id, code, side, quantity, price, traded_at, source)
             VALUES ${values.join(',')}`,
            params
        );
    }
}

// 해당 device의 거래 전량 삭제.
export async function deleteAll(deviceId) {
    const { rowCount } = await query('DELETE FROM journal_trades WHERE device_id = $1', [deviceId]);
    return { deleted: rowCount };
}
