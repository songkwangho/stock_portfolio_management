// 4.5b차 — 거래일지 오케스트레이션: 파싱 → 정규화 → (종목코드 해석) → 적재 / 삭제.
// 안전: 원본 CSV는 저장하지 않는다(파싱 즉시 폐기). PII는 파서 화이트리스트에서 이미 제거됨.
// 종목 식별: 6자리 코드 우선, 없으면 종목명→stocks 매핑. 유니버스 밖은 skip + coverage로 투명 처리.
import { query, withTransaction } from '../../db/connection.js';
import { parseTrades } from './parsers/index.js';
import { computeRoundtrips, summarize } from './roundtrip.js';
import { computeBiases } from './biases/index.js';

// 종목명 정규화(공백 제거)로 매핑 견고화.
const norm = (s) => String(s || '').replace(/\s/g, '');

// deviceId, csvText, brokerHint → { broker, imported, skipped, dateRange, coverage, replaced }
//
// F1(리뷰): 재업로드 시맨틱은 append가 아니라 **해당 device 전량 교체(replace)**.
// journal_trades에 자연키 unique가 없어 append면 같은 CSV 재업로드가 거래를 2배로 만들어
// 전 지표를 오염시킴. 트랜잭션 안에서 DELETE→INSERT로 원자적 교체한다.
// **데이터 파괴 방지 가드**: 유효 신규 데이터(resolved.length>0)일 때만 교체.
// 파싱 0건 / 전건 unmatched(resolved 0)면 기존 데이터를 절대 지우지 않는다(나쁜 업로드로 파괴 금지).
export async function ingest(deviceId, csvText, brokerHint) {
    const { broker, trades } = parseTrades(csvText, brokerHint);
    if (trades.length === 0) {
        return { broker, imported: 0, skipped: 0, dateRange: null, coverage: { matched: 0, unmatched: 0 }, replaced: false };
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

    // 유효 신규 데이터가 있을 때만 원자적 교체. 없으면 기존 데이터 보존(가드).
    let replaced = false;
    if (resolved.length > 0) {
        await withTransaction(async (client) => {
            await client.query('DELETE FROM journal_trades WHERE device_id = $1', [deviceId]);
            await bulkInsert(client, deviceId, resolved);
        });
        replaced = true;
    }

    const dates = resolved.map(t => t.tradedAt).sort();
    return {
        broker,
        imported: resolved.length,
        skipped: unmatched,
        dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
        coverage: { matched: resolved.length, unmatched },
        replaced,
    };
}

// 다중행 INSERT (파라미터 상한 회피 위해 1000행 단위 청크). client(트랜잭션 핸들)로 실행.
async function bulkInsert(client, deviceId, trades) {
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
        await client.query(
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

// deviceId → { available, summary, biases, coverage }
// 데이터 없으면 available:false (500 금지, dart 패턴).
export async function analyze(deviceId) {
    // traded_at은 TO_CHAR로 문자열 고정(pg DATE 타입 파서의 TZ 변환 회피), price는 Number 캐스팅.
    const { rows } = await query(
        `SELECT code, side, quantity, TO_CHAR(traded_at,'YYYY-MM-DD') AS traded_at, price
         FROM journal_trades WHERE device_id = $1 ORDER BY traded_at ASC, id ASC`,
        [deviceId]
    );
    if (rows.length === 0) return { available: false };
    const trades = rows.map(r => ({
        code: r.code, side: r.side, quantity: Number(r.quantity), price: Number(r.price), tradedAt: r.traded_at,
    }));

    const { roundtrips, unmatched } = computeRoundtrips(trades);
    const summary = summarize(roundtrips);
    const priceReader = await buildPriceReader(trades);
    const biases = await computeBiases({ trades, roundtrips, priceReader });

    return {
        available: true,
        summary,
        biases,
        // F2: 매수기록 없는 매도(구간 이전 보유분)를 고지 → 프론트 journalCoverageNote.
        coverage: { trades: trades.length, roundtrips: roundtrips.length, unmatchedSellCount: unmatched.sellCount },
    };
}

// 추격매수 편향용 가격조회 포트 — 거래 종목의 stock_history를 한 번에 로드해 in-memory 조회
// (매수 건마다 쿼리하면 Neon 풀 5 제한에 부담 → 종목 단위 벌크 로드 후 메모리 계산).
// 반환: priceReader(code, tradedAt, days) → 직전 days 거래일 상승률(%) | null(히스토리 부족)
async function buildPriceReader(trades) {
    const codes = [...new Set(trades.filter(t => t.side === 'buy').map(t => t.code))];
    if (codes.length === 0) return () => null;
    // 조회 하한: 가장 이른 매수일 - 60일(YYYYMMDD). 히스토리 로드 범위를 좁힌다.
    const earliest = trades.map(t => t.tradedAt).sort()[0];
    const lb = new Date(Date.parse(earliest) - 60 * 86400000);
    const lbYmd = `${lb.getUTCFullYear()}${String(lb.getUTCMonth() + 1).padStart(2, '0')}${String(lb.getUTCDate()).padStart(2, '0')}`;
    const { rows } = await query(
        `SELECT code, date, price FROM stock_history WHERE code = ANY($1) AND date >= $2 ORDER BY code, date ASC`,
        [codes, lbYmd]
    );
    const byCode = {};
    for (const r of rows) (byCode[r.code] ||= []).push({ date: r.date, price: Number(r.price) });

    return (code, tradedAt, days) => {
        const arr = byCode[code];
        if (!arr || arr.length < 5) return null;
        const ymd = tradedAt.replace(/-/g, '');
        const before = arr.filter(r => r.date < ymd);   // 매수일 이전 종가 (date는 'YYYYMMDD', 고정폭 사전순=시간순)
        if (before.length < 5) return null;
        const window = before.slice(-days);
        const startClose = window[0].price;
        const endClose = window[window.length - 1].price;
        if (!startClose || startClose <= 0) return null;
        return ((endClose - startClose) / startClose) * 100;
    };
}
