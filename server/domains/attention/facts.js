// A차(주목 레이어) — DB 행 → 원시 사실 계산. 순수 함수(DB·네트워크 의존 0) → 단위 테스트 대상.
//
// service.js는 로드만, 판정·계산은 여기와 score.js가 담당한다(C-2 evaluateOpenLots 선례).
// DART 적재 전에는 공시가 전부 0건이라 5거래일 수익률·거래량 배수가 사실상 유일한 현저성 동력 →
// 이 계산이 조용히 틀리면 블록 전체가 틀린다. 그래서 DB에서 떼어내 테스트한다.
import { ATTENTION_CONSTANTS } from './score.js';
import { categoryLabel } from '../../helpers/dartCategory.js';

const DAY_MS = 86400000;
const round = (v, n) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(n)));

// stock_history.date는 TEXT 'YYYYMMDD'(고정폭) → 사전순 = 시간순.
export const ymdOf = (iso) => iso.replace(/-/g, '');
export const isoFromYmd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
export const shiftIso = (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);

// KST 기준 오늘 'YYYY-MM-DD'. 공시 경과일수는 실제 달력 날짜라 서버 TZ에 의존하면 안 된다.
export const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 한 종목의 stock_history 행(날짜 오름차순) → { close, ret5d, volSurge }.
// 데이터가 모자라면 **추정하지 않고 null** — 없는 값을 만들어 현저성을 부풀리지 않는다.
export function computePriceStats(rows, C = ATTENTION_CONSTANTS) {
    const arr = rows || [];
    const closes = arr.filter(r => r.price != null && Number.isFinite(r.price) && r.price > 0);
    const last = closes.length ? closes[closes.length - 1] : null;

    // 5거래일 수익률 — 마지막 종가 vs W거래일 전 종가.
    let ret5d = null;
    const W = C.windowTradingDays;
    if (closes.length >= W + 1) {
        const base = closes[closes.length - 1 - W].price;
        if (base > 0) ret5d = round(((last.price - base) / base) * 100, 2);
    }

    // 거래량 배수 — 최신 거래량 ÷ 직전 20거래일 평균. 직전 표본 5일 미만이면 null.
    let volSurge = null;
    const vols = arr.filter(r => r.volume != null && Number.isFinite(r.volume) && r.volume > 0);
    if (vols.length >= 6) {
        const latest = vols[vols.length - 1].volume;
        const prior = vols.slice(-21, -1);
        if (prior.length >= 5) {
            const avg = prior.reduce((a, v) => a + v.volume, 0) / prior.length;
            if (avg > 0) volSurge = round(latest / avg, 2);
        }
    }

    return { close: last ? last.price : null, ret5d, volSurge };
}

// 한 종목의 dart_disclosures 행 → { count, latestDaysAgo, categories }.
// categories는 **중립 표시 라벨**(호재/악재 아님, dartCategory.js 공용 규칙)만 최대 3개.
export function summarizeDisclosures(rows, todayIso) {
    const arr = rows || [];
    if (arr.length === 0) return { count: 0, latestDaysAgo: null, categories: [] };

    let latestDaysAgo = null;
    const labels = new Set();
    for (const r of arr) {
        // 미래 날짜(시차·오적재)는 0일로 클램프 — 음수 경과일은 감쇠식을 뒤집는다.
        const daysAgo = Math.max(0, daysBetween(isoFromYmd(r.rcept_dt), todayIso));
        if (latestDaysAgo == null || daysAgo < latestDaysAgo) latestDaysAgo = daysAgo;
        labels.add(categoryLabel(r.category));
    }
    return { count: arr.length, latestDaysAgo, categories: [...labels].slice(0, 3) };
}
