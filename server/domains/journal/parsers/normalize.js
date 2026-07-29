// 4.5b차 — 거래내역 CSV 파싱 + canonical Trade 정규화 (순수, DB 접근 없음).
//
// 개인정보(PII) 보호: 각 브로커 파서(parseX)는 code/name/side/quantity/price/tradedAt
// 화이트리스트 컬럼만 뽑아 RawTrade로 넘긴다. 계좌번호·예수금·성명 등은 파서 단계에서 버려져
// 여기까지 오지 않는다. normalize는 값 정제(콤마 제거·날짜 표준화·side 라벨→enum)와 검증만 한다.
//
// canonical Trade = { code|null, name|null, side:'buy'|'sell', quantity:int>0, price:number>0, tradedAt:'YYYY-MM-DD' }
// 종목코드(6자리) 해석은 DB가 필요하므로 여기선 하지 않는다 → service.js가 name→code 매핑.

// ── CSV 파싱 ──────────────────────────────────────────────
// 구분자 자동 감지(콤마/탭/세미콜론) + 따옴표 필드 + 헤더 앞 프리앰블(제목행) 스킵.

const FIELD_KEYWORDS = ['종목', '수량', '단가', '매매', '구분', '가격', '일자', '일시', '거래일', '체결'];

function splitLine(line, delim) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = false;
            } else cur += ch;
        } else if (ch === '"') {
            inQ = true;
        } else if (ch === delim) {
            out.push(cur); cur = '';
        } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
}

function detectDelim(line) {
    const counts = { ',': 0, '\t': 0, ';': 0 };
    let inQ = false;
    for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (!inQ && counts[ch] !== undefined) counts[ch]++;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

// 헤더행 = 필드 키워드를 포함하고 컬럼 3개 이상인 첫 줄 (앞선 제목/공백행 스킵).
function findHeaderIndex(lines, delim) {
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const cols = splitLine(lines[i], delim);
        if (cols.length >= 3 && cols.some(c => FIELD_KEYWORDS.some(k => c.includes(k)))) return i;
    }
    return 0;
}

// text → { headers:[...], rows:[{header:value}, ...] }
export function parseCsv(text) {
    if (!text) return { headers: [], rows: [] };
    const clean = text.replace(/^﻿/, '');   // BOM 제거
    const lines = clean.split(/\r\n|\r|\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return { headers: [], rows: [] };
    const delim = detectDelim(lines[0].includes('\t') || lines[0].includes(';') ? lines[0] : (lines[1] || lines[0]));
    const hIdx = findHeaderIndex(lines, delim);
    const headers = splitLine(lines[hIdx], delim);
    const rows = [];
    for (let i = hIdx + 1; i < lines.length; i++) {
        const cols = splitLine(lines[i], delim);
        if (cols.every(c => c === '')) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
        rows.push(row);
    }
    return { headers, rows };
}

// 헤더 시노님 목록 중 하나라도 매칭되는 컬럼 값을 반환 (부분일치, 대소문자·공백 무시).
export function pick(row, synonyms) {
    const keys = Object.keys(row);
    for (const syn of synonyms) {
        const hit = keys.find(k => k.replace(/\s/g, '').includes(syn));
        if (hit && row[hit] != null && String(row[hit]).trim() !== '') return String(row[hit]).trim();
    }
    return '';
}

// ── 값 정제 ───────────────────────────────────────────────
export function cleanNumber(s) {
    if (s == null) return null;
    const n = Number(String(s).replace(/[^0-9.\-]/g, ''));   // 콤마·원·주 등 제거
    return Number.isFinite(n) ? n : null;
}

export function cleanInt(s) {
    const n = cleanNumber(s);
    return n == null ? null : Math.trunc(Math.abs(n));   // 수량은 양의 정수
}

// '매수'류→buy, '매도'류→sell. 현금/신용/장내 접두어 무관. 그 외 null.
export function parseSide(s) {
    if (!s) return null;
    const v = String(s).replace(/\s/g, '');
    if (v.includes('매도') || v.includes('매각') || /sell/i.test(v)) return 'sell';
    if (v.includes('매수') || v.includes('매입') || /buy/i.test(v)) return 'buy';
    return null;
}

// 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'YYYY.MM.DD' | 'YYYYMMDD' (+선택 시각) → 'YYYY-MM-DD'.
export function parseTradedAt(s) {
    if (!s) return null;
    const v = String(s).trim();
    let m = v.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!m) m = v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    const y = m[1];
    const mo = String(Number(m[2])).padStart(2, '0');
    const d = String(Number(m[3])).padStart(2, '0');
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}-${mo}-${d}`;
}

// 6자리 숫자 코드만 유효로 간주 (그 외는 null → service가 name으로 매핑).
export function cleanCode(s) {
    if (!s) return null;
    const m = String(s).match(/\d{6}/);
    return m ? m[0] : null;
}

// ── RawTrade[] → canonical Trade[] (검증 실패행은 드롭) ──────
// RawTrade = { code?, name?, side, quantity, price, tradedAt } (전부 원본 문자열)
export function normalizeTrades(rawRows, source) {
    const trades = [];
    for (const r of rawRows || []) {
        const side = parseSide(r.side);
        const quantity = cleanInt(r.quantity);
        const price = cleanNumber(r.price);
        const tradedAt = parseTradedAt(r.tradedAt);
        const code = cleanCode(r.code);
        const name = r.name ? String(r.name).trim() : null;
        // 필수: side/수량/가격/일자 유효 + (코드 또는 종목명) 존재
        if (!side || !quantity || quantity <= 0 || !price || price <= 0 || !tradedAt) continue;
        if (!code && !name) continue;
        trades.push({ code, name, side, quantity, price, tradedAt, source: source || null });
    }
    return trades;
}
