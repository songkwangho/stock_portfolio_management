// 4.5b차 — 거래일지 오케스트레이션: 파싱 → 정규화 → (종목코드 해석) → 적재 / 삭제.
// 안전: 원본 CSV는 저장하지 않는다(파싱 즉시 폐기). PII는 파서 화이트리스트에서 이미 제거됨.
// 종목 식별: 6자리 코드 우선, 없으면 종목명→stocks 매핑. 유니버스 밖은 skip + coverage로 투명 처리.
import { query, withTransaction } from '../../db/connection.js';
import { parseTrades } from './parsers/index.js';
import { computeRoundtrips, summarize, evaluateOpenLots } from './roundtrip.js';
import { computeBiases } from './biases/index.js';
import { norm, buildNameIndex } from './universe.js';
import { promoteCodes } from './promote.js';

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

    // 유니버스 확장(T2): 187 stocks가 아니라 전 상장목록(stocks_directory ~2,600)에 매핑.
    // 관측된 40% 사각(코스닥 중소형)의 직접 원인이 좁은 유니버스였음. codeSet=6자리 코드 직매핑,
    // nameToCode=종목명→코드(정확 일치·유일할 때만 — 동명 종목은 오매핑 대신 unmatched로 남김).
    const { rows: universe } = await query('SELECT code, name FROM stocks_directory');
    const { codeSet, nameToCode } = buildNameIndex(universe);

    // 코드 해석 — 유니버스 밖은 unmatched(skip). 제외 종목명은 distinct로 수집(C-1 지속 캐비엇용).
    const resolved = [];
    let unmatched = 0;
    const skippedNameSet = new Set();
    for (const t of trades) {
        let code = t.code && codeSet.has(t.code) ? t.code : null;
        if (!code && t.name) code = nameToCode.get(norm(t.name)) || null;
        if (!code) { unmatched++; if (t.name) skippedNameSet.add(t.name); continue; }
        resolved.push({ code, side: t.side, quantity: t.quantity, price: t.price, tradedAt: t.tradedAt, source: t.source || broker });
    }

    // 유효 신규 데이터가 있을 때만 원자적 교체 + 메타 upsert. 없으면 기존 거래·메타 모두 보존(가드).
    let replaced = false;
    if (resolved.length > 0) {
        await withTransaction(async (client) => {
            await client.query('DELETE FROM journal_trades WHERE device_id = $1', [deviceId]);
            await bulkInsert(client, deviceId, resolved);
            // C-1: 적재 메타(디바이스당 1행) upsert — analysis가 지속 캐비엇으로 읽음.
            await client.query(
                `INSERT INTO journal_imports (device_id, total, imported, skipped, skipped_names, uploaded_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (device_id) DO UPDATE
                   SET total = EXCLUDED.total, imported = EXCLUDED.imported,
                       skipped = EXCLUDED.skipped, skipped_names = EXCLUDED.skipped_names, uploaded_at = NOW()`,
                [deviceId, trades.length, resolved.length, unmatched, [...skippedNameSet]]
            );
        });
        replaced = true;

        // T3(2C): 새로 매핑됐지만 stocks에 없는 보유·거래 종목 승격 — 킬러 한 줄·추격 판정이 값을 얻도록.
        // 보유분 현재가는 동기(await), 이력 backfill은 promote 내부 fire-and-forget.
        // 승격 실패가 업로드를 깨지 않게 try/catch. unvaluedCount 캐비엇은 analyze에서 그대로 유지.
        try {
            await promoteCodes({ resolvedTrades: resolved });
        } catch (e) {
            console.error('[journal] promoteCodes failed (업로드는 정상):', e.message);
        }
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

    const { roundtrips, unmatched, openLots } = computeRoundtrips(trades);
    // C-2: 미청산 보유분(openLots)을 최근 종가로 평가 → 미실현 손실 종목수·보유일·asOfDate.
    const openEval = await valueOpenLots(openLots);
    const summary = { ...summarize(roundtrips), ...openEval };
    const priceReader = await buildPriceReader(trades);
    const biases = await computeBiases({ trades, roundtrips, priceReader });

    // C-3: avgdown 표시용 종목명 부착 (interpret은 프론트라 code→name 매핑이 없음).
    // T2: stocks_directory에서 조회 — 승격(T3) 전이라 stocks에 없는 코드도 이름이 나와야 함(디렉토리는 전 상장 superset).
    const avgBias = biases.find(b => b.key === 'avgdown');
    if (avgBias && Array.isArray(avgBias.codes) && avgBias.codes.length > 0) {
        const { rows: nameRows } = await query('SELECT code, name FROM stocks_directory WHERE code = ANY($1)', [avgBias.codes]);
        const nameByCode = Object.fromEntries(nameRows.map(r => [r.code, r.name]));
        avgBias.names = avgBias.codes.map(c => nameByCode[c] || c);
    }

    // C-1: 적재 메타(유니버스 제외 건수·종목) 병합 → 지속 캐비엇. 메타 없으면(구버전 적재) 필드 생략.
    const { rows: metaRows } = await query(
        'SELECT total, imported, skipped, skipped_names FROM journal_imports WHERE device_id = $1',
        [deviceId]
    );
    const meta = metaRows[0] || null;

    return {
        available: true,
        summary,
        biases,
        // F2: 매수기록 없는 매도(구간 이전 보유분) + C-1: 유니버스 제외 → 프론트 journalCoverageNotes.
        coverage: {
            trades: trades.length,
            roundtrips: roundtrips.length,
            unmatchedSellCount: unmatched.sellCount,
            ...(meta ? {
                total: meta.total,
                imported: meta.imported,
                skipped: meta.skipped,
                skippedNames: meta.skipped_names || [],
            } : {}),
        },
    };
}

// C-2 — 미청산 보유분(openLots)을 최근 종가로 평가. 실현손실이 없어도 처분효과의 반쪽을 사실로.
// DB 로드(stock_history 최신 종가+날짜 → stocks.price 폴백)만 여기서, 계산은 순수 evaluateOpenLots.
// 'YYYYMMDD' TEXT → 사전순 DESC = 최신. 보유일 클램프·per-code 날짜는 evaluateOpenLots가 담당(리뷰 수정).
async function valueOpenLots(openLots) {
    if (openLots.length === 0) return evaluateOpenLots(openLots, {});
    const codes = openLots.map(o => o.code);

    const { rows: histRows } = await query(
        `SELECT DISTINCT ON (code) code, date, price FROM stock_history WHERE code = ANY($1) ORDER BY code, date DESC`,
        [codes]
    );
    const priceByCode = {};
    for (const r of histRows) {
        const d = r.date;   // 'YYYYMMDD'
        priceByCode[r.code] = { close: Number(r.price), date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` };
    }
    // stocks.price 폴백 (히스토리 없는 종목만, 날짜 없음)
    const { rows: stkRows } = await query('SELECT code, price FROM stocks WHERE code = ANY($1)', [codes]);
    for (const r of stkRows) {
        if (!priceByCode[r.code] && r.price != null) priceByCode[r.code] = { close: Number(r.price), date: null };
    }
    return evaluateOpenLots(openLots, priceByCode);
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
