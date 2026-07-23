// 4.5a차 — 금융감독원 DART OpenAPI 클라이언트.
//
// 원칙:
// - API 키는 process.env.DART_API_KEY로만 참조. 키 값을 로그·에러 메시지에 절대 남기지 않는다.
// - 키가 없으면 기능 비활성(에러 아님) — 모든 함수가 조용히 null/[]을 반환한다.
// - 관대한 파싱(fail-soft): 필드 누락·타입 불일치·개별 항목 파싱 실패가 전체 실패로 번지지 않게.
//   어떤 함수도 예외를 던지지 않는다(호출부가 try 없이 써도 안전).
// - status 코드: 000 정상 / 013 데이터 없음(정상, null·[]) / 020 한도초과(경고+null) / 그 외(에러+null).
//
// 성공 응답의 실제 데이터 구조는 로컬 키 부재로 라이브 미검증 — DART 공식 문서 기준으로 구현했다.
// scripts/sync-dart-financials.js --dry-run --save-sample 로 운영자가 원본을 확보해 대조·보정한다.
import axios from 'axios';
import AdmZip from 'adm-zip';

const BASE = 'https://opendart.fss.or.kr/api';
const TIMEOUT = 10000;

// 호출 간 최소 간격(ms) — rate limit 소프트 방어. 스크립트는 별도 배치 딜레이도 둔다.
const MIN_INTERVAL = 60;
let lastCall = 0;
async function throttle() {
    const wait = Math.max(0, lastCall + MIN_INTERVAL - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
}

export function dartEnabled() {
    return !!process.env.DART_API_KEY;
}

// 공통 GET. params에 crtfc_key를 주입하되, 로그에는 키를 포함한 params를 절대 찍지 않는다.
async function dartGet(path, params, responseType = 'json') {
    const key = process.env.DART_API_KEY;
    if (!key) return { ok: false, reason: 'no_key' };
    await throttle();
    try {
        const res = await axios.get(`${BASE}/${path}`, {
            params: { crtfc_key: key, ...params },
            responseType: responseType === 'arraybuffer' ? 'arraybuffer' : 'text',
            timeout: TIMEOUT,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        return { ok: true, data: res.data };
    } catch (e) {
        // e.message에 키가 들어갈 수 있는 유일한 경로는 없음(axios는 URL을 message에 넣지 않음).
        // 그래도 방어적으로 status/코드만 남긴다.
        console.error(`[dart] ${path} request failed: ${e.code || e.message?.split('\n')[0] || 'error'}`);
        return { ok: false, reason: 'request_failed' };
    }
}

// JSON 응답 status 코드 해석. 반환: 'ok' | 'no_data' | 'rate_limited' | 'error'
function interpretStatus(status, path) {
    if (status === '000') return 'ok';
    if (status === '013') return 'no_data';
    if (status === '020') { console.warn(`[dart] ${path} rate limit (020) — 한도 초과, 나중에 재시도`); return 'rate_limited'; }
    console.error(`[dart] ${path} status=${status}`);
    return 'error';
}

function parseJsonSafe(text) {
    try { return JSON.parse(text); } catch { return null; }
}

// 금액 문자열 → NUMERIC 정수 또는 null. 콤마 제거, '-'·''·null·비수치 → null.
export function parseAmount(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(/,/g, '');
    if (s === '' || s === '-') return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : null;
}

// ─────────────────────────────────────────────────────────────
// 1. corp_code 전체 매핑 (corpCode.xml → ZIP → CORPCODE.xml)
//    성공 시 ZIP 바이너리, 무효 키/에러 시 XML(<result><status>...). 첫 바이트로 분기.
//    반환: [{ corp_code, corp_name, stock_code, modify_date }] | null
// ─────────────────────────────────────────────────────────────
export async function fetchCorpCodes() {
    const r = await dartGet('corpCode.xml', {}, 'arraybuffer');
    if (!r.ok) return null;
    const buf = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
    // ZIP magic 'PK' (0x50 0x4B) → 정상. 아니면 XML 에러 응답.
    if (buf.length < 2 || buf[0] !== 0x50 || buf[1] !== 0x4B) {
        const xml = buf.toString('utf-8');
        const status = xml.match(/<status>([^<]*)<\/status>/)?.[1] || '?';
        console.error(`[dart] corpCode.xml non-ZIP response status=${status}`);
        return null;
    }
    let xml;
    try {
        const zip = new AdmZip(buf);
        const entry = zip.getEntries().find(e => /CORPCODE\.xml$/i.test(e.entryName)) || zip.getEntries()[0];
        if (!entry) return null;
        xml = entry.getData().toString('utf-8');
    } catch (e) {
        console.error(`[dart] corpCode ZIP extract failed: ${e.message?.split('\n')[0]}`);
        return null;
    }
    // <list> 반복 구조 — 10만 건이라 xml2js 대신 정규식(메모리·속도).
    const out = [];
    const blocks = xml.match(/<list>[\s\S]*?<\/list>/g) || [];
    for (const b of blocks) {
        const pick = (tag) => b.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? null;
        const corp_code = pick('corp_code');
        if (!corp_code) continue;
        let stock_code = pick('stock_code');
        if (stock_code === '' || stock_code === ' ' || /^\s*$/.test(stock_code || '')) stock_code = null;
        out.push({
            corp_code,
            corp_name: pick('corp_name') || '',
            stock_code,
            modify_date: pick('modify_date'),
        });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// 2. 단일회사 전체 재무제표 (fnlttSinglAcntAll.json)
//    reprtCode: 11011(사업)·11012(반기)·11013(1분기)·11014(3분기). fsDiv: 'CFS'|'OFS'.
//    반환: { status, message, list:[...원본 계정...] } | null  (fail-soft: list는 항상 배열)
//    원본 list를 그대로 반환 → 스크립트가 스키마 매핑 + --save-sample 로 원본 확인.
// ─────────────────────────────────────────────────────────────
export async function fetchFinancials(corpCode, year, reprtCode, fsDiv) {
    const r = await dartGet('fnlttSinglAcntAll.json', {
        corp_code: corpCode, bsns_year: String(year), reprt_code: reprtCode, fs_div: fsDiv,
    });
    if (!r.ok) return null;
    const data = parseJsonSafe(r.data);
    if (!data || typeof data.status !== 'string') { console.error('[dart] financials: unparseable response'); return null; }
    const state = interpretStatus(data.status, 'fnlttSinglAcntAll');
    if (state !== 'ok') return null;
    return {
        status: data.status,
        message: data.message,
        list: Array.isArray(data.list) ? data.list : [],
    };
}

// ─────────────────────────────────────────────────────────────
// 3. 공시 검색 (list.json) — 기간 내 전체 페이지 수집(최대 상한).
//    반환: [{ rcept_no, report_nm, rcept_dt, flr_nm, corp_name, stock_code, ... }] | null
//    013(공시 없음)은 정상 → [] 반환. 에러/무키 → null.
// ─────────────────────────────────────────────────────────────
export async function fetchDisclosures(corpCode, bgnDe, endDe) {
    const PAGE_COUNT = 100;
    const MAX_PAGES = 5; // 3개월 단일사 공시 상한 방어(최대 500건)
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await dartGet('list.json', {
            corp_code: corpCode, bgn_de: bgnDe, end_de: endDe,
            page_no: String(page), page_count: String(PAGE_COUNT),
        });
        if (!r.ok) return page === 1 ? null : items;
        const data = parseJsonSafe(r.data);
        if (!data || typeof data.status !== 'string') return page === 1 ? null : items;
        const state = interpretStatus(data.status, 'list');
        if (state === 'no_data') return items;              // 공시 없음 = 정상 빈 배열
        if (state !== 'ok') return page === 1 ? null : items;
        const list = Array.isArray(data.list) ? data.list : [];
        for (const it of list) if (it && it.rcept_no) items.push(it);
        const totalPage = Number(data.total_page) || 1;
        if (page >= totalPage) break;
    }
    return items;
}
