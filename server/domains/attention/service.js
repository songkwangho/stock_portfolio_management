// A차(주목 레이어 / 트리아지) — 보유+관심 종목을 현저성으로 정렬해 상위 몇 개만 돌려준다.
//
// 신규 수집 0 — 기존 테이블(holding_stocks · watchlist · stock_history · dart_disclosures · stocks)
// 조립만 한다. 이 파일은 **DB 로드**만 담당하고, 사실 계산은 facts.js, 순위 판정은 score.js(둘 다 순수).
// 응답은 **원시 사실(숫자)**만 — 해석 문구는 프론트(lib/attention/interpret.ts)에서 만든다(R2).
//
// 데이터 없으면 available:false (500 금지 — journal/dart 폴백 패턴).
import { query } from '../../db/connection.js';
import { rankAttention, ATTENTION_CONSTANTS } from './score.js';
import { computePriceStats, summarizeDisclosures, todayKst, ymdOf, isoFromYmd, shiftIso } from './facts.js';

const HISTORY_LOOKBACK_DAYS = 120;   // 5거래일 수익률 + 20거래일 평균 거래량에 넉넉한 캘린더 범위

const round = (v, n) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(n)));

// deviceId → { available, items, asOfDate, constants }
export async function getAttention(deviceId) {
    const [{ rows: holdRows }, { rows: watchRows }] = await Promise.all([
        query(
            `SELECT h.code, s.name, h.avg_price, h.quantity, h.weight, s.price
             FROM holding_stocks h LEFT JOIN stocks s ON s.code = h.code
             WHERE h.device_id = $1`,
            [deviceId]
        ),
        query(
            `SELECT w.code, s.name, s.price
             FROM watchlist w LEFT JOIN stocks s ON s.code = w.code
             WHERE w.device_id = $1`,
            [deviceId]
        ),
    ]);

    // 후보 자체가 없으면 블록을 띄울 이유가 없다(대시보드 빈 상태 CTA가 이미 그 자리를 쓴다).
    if (holdRows.length === 0 && watchRows.length === 0) {
        return { available: false, reason: 'empty' };
    }

    const codes = [...new Set([...holdRows, ...watchRows].map(r => r.code))];
    const today = todayKst();

    const [priceStats, disclosures, nameByCode] = await Promise.all([
        loadPriceStats(codes, today),
        loadDisclosures(codes, today),
        loadMissingNames([...holdRows, ...watchRows]),
    ]);

    const candidates = [];
    for (const h of holdRows) {
        const st = priceStats.byCode[h.code] || {};
        const avg = h.avg_price == null ? null : Number(h.avg_price);
        const cur = st.close ?? (h.price == null ? null : Number(h.price));
        candidates.push({
            code: h.code,
            name: h.name || nameByCode[h.code] || h.code,
            held: true,
            weightPct: h.weight == null ? null : Number(h.weight),
            unrealizedPct: (avg != null && avg > 0 && cur != null) ? round(((cur - avg) / avg) * 100, 2) : null,
            ...factsFor(st, cur, disclosures[h.code]),
        });
    }
    for (const w of watchRows) {
        const st = priceStats.byCode[w.code] || {};
        const cur = st.close ?? (w.price == null ? null : Number(w.price));
        candidates.push({
            code: w.code,
            name: w.name || nameByCode[w.code] || w.code,
            held: false,
            weightPct: null,
            unrealizedPct: null,   // 포지션 없음 — 미실현 개념 자체가 없다(배지도 미표시)
            ...factsFor(st, cur, disclosures[w.code]),
        });
    }

    const items = rankAttention(candidates);
    return {
        available: true,
        items,
        asOfDate: priceStats.asOfDate,
        // 프론트가 문구·뱃지에 쓰는 표시용 상수(창 길이 등).
        constants: {
            windowTradingDays: ATTENTION_CONSTANTS.windowTradingDays,
            discLookbackDays: ATTENTION_CONSTANTS.discLookbackDays,
        },
    };
}

// 종목별 원시 사실(가격·거래량·공시) — 보유/관심 공통 부분.
function factsFor(st, currentPrice, disc) {
    return {
        priced: currentPrice != null,
        ret5d: st.ret5d ?? null,
        volSurge: st.volSurge ?? null,
        discCount: disc ? disc.count : 0,
        discLatestDaysAgo: disc ? disc.latestDaysAgo : null,
        discCategories: disc ? disc.categories : [],
        // 카테고리 가중용 건별 (category, 경과일). 응답에도 그대로 실린다 — 원시 사실이라
        // R1/R2에 저촉되지 않고, 정렬 근거를 되짚을 수 있다(화면은 쓰지 않는다).
        discEvents: disc ? disc.events : [],
    };
}

// stock_history 벌크 로드(종목당 쿼리 금지 — Neon 풀 max=5) → 종목별 stats + 전체 asOfDate.
async function loadPriceStats(codes, today) {
    const lb = ymdOf(shiftIso(today, -HISTORY_LOOKBACK_DAYS));
    const { rows } = await query(
        `SELECT code, date, price, volume FROM stock_history
         WHERE code = ANY($1) AND date >= $2 ORDER BY code, date ASC`,
        [codes, lb]
    );

    const byCodeRows = {};
    let maxDate = null;
    for (const r of rows) {
        (byCodeRows[r.code] ||= []).push({
            date: r.date,
            price: r.price == null ? null : Number(r.price),
            volume: r.volume == null ? null : Number(r.volume),
        });
        if (maxDate == null || r.date > maxDate) maxDate = r.date;
    }

    const byCode = {};
    for (const [code, arr] of Object.entries(byCodeRows)) byCode[code] = computePriceStats(arr);
    return { byCode, asOfDate: maxDate ? isoFromYmd(maxDate) : null };
}

// dart_disclosures 룩백 집계 → 종목별 { count, latestDaysAgo, categories }.
// DART 적재 전이면 전부 0건 — 정상 경로(에러 아님).
async function loadDisclosures(codes, today) {
    const from = ymdOf(shiftIso(today, -ATTENTION_CONSTANTS.discLookbackDays));
    const { rows } = await query(
        `SELECT code, rcept_dt, category FROM dart_disclosures
         WHERE code = ANY($1) AND rcept_dt >= $2`,
        [codes, from]
    );

    const byCode = {};
    for (const r of rows) (byCode[r.code] ||= []).push(r);

    const out = {};
    for (const [code, arr] of Object.entries(byCode)) out[code] = summarizeDisclosures(arr, today);
    return out;
}

// stocks에 이름이 없는 코드(승격 전 등)만 stocks_directory로 보강. 없으면 쿼리 자체를 생략.
async function loadMissingNames(rows) {
    const missing = [...new Set(rows.filter(r => !r.name).map(r => r.code))];
    if (missing.length === 0) return {};
    const { rows: dirRows } = await query('SELECT code, name FROM stocks_directory WHERE code = ANY($1)', [missing]);
    return Object.fromEntries(dirRows.map(r => [r.code, r.name]));
}
