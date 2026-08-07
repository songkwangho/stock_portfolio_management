// T3 (2B) — journal 승격: T2로 매핑됐지만 stocks/stock_history에 없는 보유·거래 종목을 stocks로
// 편입해 킬러 한 줄(미실현 평가)·추격매수 판정이 값을 얻게 한다. 스코프 = 실제 보유·거래 종목만(§4).
//
// 안전: upsert-only, 실패는 삼켜 로그만(업로드/지표 무손상). getStockData는 stocks + 최근 60일
// stock_history를 upsert하고 캐시하므로, 동기 파트가 처리한 보유분은 비동기 파트에서 캐시 히트로
// 재크롤하지 않는다. 과거 추격매수(60일 룩백) 판정에 필요한 장기 이력만 비동기 fetchHistory로 채운다.
import { query } from '../../db/connection.js';
import { getStockData } from '../stock/service.js';
import { fetchHistory, upsertHistory } from '../stock/history.js';
import { computeRoundtrips } from './roundtrip.js';

// provisional 임계값 — Phase 4 백테스팅 대상. 근거는 각 주석.
const SYNC_CONCURRENCY = 3;    // 동기 현재가 확보 동시성(Neon 풀 max=5 여유 + 네이버 부하 절제)
const SYNC_BUDGET_MS = 8000;   // 업로드 응답 지연 하드 예산(§4 A안). 초과분은 비동기로 이월
const BACKFILL_DAYS = 365;     // 추격매수 60일 룩백 + 여유(≈12개월). 비동기 이력 backfill 기간
const ASYNC_BATCH = 3;         // 비동기 backfill 배치 크기(expand-stocks 패턴)
const ASYNC_DELAY_MS = 3000;   // 배치 간 간격 — 네이버 rate-limit 보호

// { resolvedTrades: [{code, side, quantity, price, tradedAt}] } → { heldMissing, allMissing, syncedHeld }
export async function promoteCodes({ resolvedTrades }) {
    if (!resolvedTrades || resolvedTrades.length === 0) {
        return { heldMissing: 0, allMissing: 0, syncedHeld: 0 };
    }

    // 1) 현재 보유분(openLots) 코드셋. quantity/price는 방어적 Number 캐스팅(FIFO 정확성).
    const trades = resolvedTrades.map(t => ({
        code: t.code, side: t.side, quantity: Number(t.quantity), price: Number(t.price), tradedAt: t.tradedAt,
    }));
    const { openLots } = computeRoundtrips(trades);
    const heldCodes = new Set(openLots.map(o => o.code));
    const allCodes = [...new Set(trades.map(t => t.code))];

    // 2) 이미 stocks에 있는 코드 제외.
    const { rows: existing } = await query('SELECT code FROM stocks WHERE code = ANY($1)', [allCodes]);
    const have = new Set(existing.map(r => r.code));
    const missingAll = allCodes.filter(c => !have.has(c));
    if (missingAll.length === 0) return { heldMissing: 0, allMissing: 0, syncedHeld: 0 };
    const missingHeld = missingAll.filter(c => heldCodes.has(c));

    // fallbackName(네이버 실패 시 이름 보존): resolved엔 name이 없어 디렉토리에서 조회.
    const { rows: dirRows } = await query('SELECT code, name FROM stocks_directory WHERE code = ANY($1)', [missingAll]);
    const nameByCode = Object.fromEntries(dirRows.map(r => [r.code, r.name]));

    // 3) 동기(§4 A안): 보유분 현재가만 예산 내 즉시 확보 → 킬러 한 줄이 곧 최신 종가를 얻음.
    const syncedHeld = await syncHeldWithinBudget(missingHeld, nameByCode);

    // 4) 비동기(fire-and-forget): 전 미등록 코드에 현재가 + 12개월 이력 backfill. 응답을 막지 않음.
    //    예산 초과로 동기에서 빠진 보유분·과거 청산 종목까지 여기서 채워짐(그전엔 unvaluedCount 캐비엇).
    backfillMissingAsync(missingAll, nameByCode).catch(e => console.error('[promote] async backfill error:', e.message));

    console.log(`[promote] missingAll=${missingAll.length} missingHeld=${missingHeld.length} syncedHeld=${syncedHeld}`);
    return { heldMissing: missingHeld.length, allMissing: missingAll.length, syncedHeld };
}

// 보유 미등록분 현재가를 동시성 캡 + 하드 예산 안에서 확보. getStockData가 stocks + 최근 60일을 upsert.
async function syncHeldWithinBudget(codes, nameByCode) {
    if (codes.length === 0) return 0;
    const deadline = Date.now() + SYNC_BUDGET_MS;
    const queue = [...codes];
    let synced = 0;
    async function worker() {
        while (queue.length > 0 && Date.now() < deadline) {
            const code = queue.shift();
            try {
                const data = await getStockData(code, nameByCode[code] || null);
                if (data) synced++;
            } catch (e) {
                console.error(`[promote] sync ${code} failed:`, e.message);
            }
        }
    }
    const workers = Array.from({ length: Math.min(SYNC_CONCURRENCY, queue.length) }, () => worker());
    await Promise.all(workers);
    return synced;
}

// 전 미등록 코드에 현재가 + 12개월 이력 backfill. 배치·간격으로 네이버 rate-limit 보호. 실패 격리.
async function backfillMissingAsync(codes, nameByCode) {
    for (let i = 0; i < codes.length; i += ASYNC_BATCH) {
        const batch = codes.slice(i, i + ASYNC_BATCH);
        await Promise.allSettled(batch.map(async (code) => {
            // getStockData: stocks + 최근 60일(동기서 한 보유분은 캐시 히트). fetchHistory: 과거 12개월.
            try { await getStockData(code, nameByCode[code] || null); }
            catch (e) { console.error(`[promote] bg getStockData ${code}:`, e.message); }
            try {
                const rows = await upsertHistory(code, await fetchHistory(code, BACKFILL_DAYS));
                console.log(`[promote] bg backfill ${code}: ${rows} rows`);
            } catch (e) {
                console.error(`[promote] bg backfill ${code} failed:`, e.message);
            }
        }));
        if (i + ASYNC_BATCH < codes.length) await new Promise(r => setTimeout(r, ASYNC_DELAY_MS));
    }
}
