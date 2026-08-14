/**
 * Phase 4 세션 3 · Step 0 — KRX 소스 역량 프로브 (빌드 게이트 계측기)
 *
 * 실행:
 *   node scripts/probe-krx-capability.mjs                  # MDC만 (키 불필요)
 *   KRX_API_KEY=... node scripts/probe-krx-capability.mjs  # + Open API 대조
 *
 * ⚠️ 이건 **어댑터가 아니다.** 지시문 §1이 "이 단계 없이 어댑터를 만들지 않는다"고 못박았고,
 *    그 게이트를 닫으려면 KRX가 실제로 무엇을 주는지 **실측**해야 한다. 이 스크립트는 그
 *    실측만 하고 DB에 아무것도 쓰지 않는다(연결조차 하지 않는다).
 *
 * 답해야 할 3가지(§1):
 *   Q1. 종목별 일별 투자자 순매수를 **3년치** 주는가?
 *   Q2. **수정주가**(분할·배당 조정) 일봉을 주는가?
 *   Q3. 무료/유료·호출 한도는?
 *
 * 게이트 판정: Q1이 아니면 수급축은 영구 불가 → 트랙 중단(§1).
 */

const MDC_URL = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';

// data.krx는 브라우저 XHR을 전제한다 — Referer/X-Requested-With가 없으면 조용히 빈 응답이 온다.
const MDC_HEADERS = {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'https://data.krx.co.kr/contents/MDC/MDI/outerLoader/index.cmd',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

// 프로브 대상. 대형주 1 + 액면분할 이력이 뚜렷한 종목 1(수정주가 판별용).
const PROBE_CODE = process.env.PROBE_CODE || '005930';   // 삼성전자 (2018-05 50:1 액면분할)
const TODAY = process.env.PROBE_END || ymd(new Date());

function ymd(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
function minusDays(yyyymmdd, days) {
    const d = new Date(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8));
    d.setDate(d.getDate() - days);
    return ymd(d);
}

// ── 세션 쿠키 ───────────────────────────────────────────────────
// MDC **통계 화면**(MDCSTAT*)은 세션이 없으면 HTTP 400 + 본문 "LOGOUT"을 뱉는다.
// (finder_stkisu는 세션 없이도 통과한다 — 그래서 finder만 보고 "된다"고 판단하면 틀린다.)
// 실측으로 확인된 거동이라, 어댑터도 세션 부트스트랩 + 만료 시 재발급이 필수다.
const jar = new Map();

function cookieHeader() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); }

function absorb(res) {
    for (const c of (res.headers.getSetCookie?.() ?? [])) {
        const [kv] = c.split(';');
        const idx = kv.indexOf('=');
        if (idx > 0) jar.set(kv.slice(0, idx).trim(), kv.slice(idx + 1).trim());
    }
}

async function bootstrapSession() {
    // 실제 브라우저가 통계 화면에 들어갈 때 거치는 두 요청. 여기서 JSESSIONID가 발급된다.
    for (const url of [
        'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020302',
        'https://data.krx.co.kr/contents/MDC/MDI/outerLoader/index.cmd?screenId=MDCSTAT023',
    ]) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': MDC_HEADERS['User-Agent'], Cookie: cookieHeader() } });
            absorb(res);
            await res.text();
        } catch { /* 부트스트랩 실패는 아래 프로브에서 LOGOUT으로 드러난다 */ }
    }

    // 2026년 회원체계 변경 — 익명 JSESSIONID만으로는 MDCSTAT*가 전부 400 "LOGOUT"이다(실측).
    // 계정이 있으면 로그인까지 해야 통계 화면이 열린다.
    if (process.env.KRX_ID && process.env.KRX_PW) {
        try {
            await fetch('https://data.krx.co.kr/contents/MDC/COMS/client/view/login.jsp?site=mdc', {
                headers: { 'User-Agent': MDC_HEADERS['User-Agent'], Cookie: cookieHeader() },
            }).then(r => { absorb(r); return r.text(); });
            const res = await fetch('https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001D1.cmd', {
                method: 'POST',
                headers: {
                    'User-Agent': MDC_HEADERS['User-Agent'],
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Referer': 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001.cmd',
                    Cookie: cookieHeader(),
                },
                body: new URLSearchParams({
                    mbrId: process.env.KRX_ID, pw: process.env.KRX_PW,
                    mbrNm: '', telNo: '', di: '', certType: '', skipDup: 'Y',
                }).toString(),
            });
            absorb(res);
            console.log(`[세션] KRX 로그인 시도 → HTTP ${res.status}`);
        } catch (e) { console.log(`[세션] KRX 로그인 실패: ${e.message}`); }
    }
    return [...jar.keys()];
}

// ── 대안 경로 — 네이버 frgn.naver 페이지네이션 ──────────────────
//
// 우리가 **이미 쓰고 있는** 소스다(server/scrapers/naver.js는 page 파라미터 없이 첫 20행만 읽는다).
// `&page=N`을 붙이면 과거로 내려간다 → 3년 backfill 경로가 이미 손에 있다는 뜻.
async function probeNaverDepth(code, pages) {
    const out = [];
    for (const p of pages) {
        const t0 = Date.now();
        try {
            const res = await fetch(`https://finance.naver.com/item/frgn.naver?code=${code}&page=${p}`, {
                headers: { 'User-Agent': MDC_HEADERS['User-Agent'] },
            });
            const html = new TextDecoder('euc-kr').decode(await res.arrayBuffer());
            const dates = [...new Set(html.match(/\d{4}\.\d{2}\.\d{2}/g) || [])].sort();
            out.push({ page: p, status: res.status, dates: dates.length, oldest: dates[0] || null, elapsedMs: Date.now() - t0 });
        } catch (e) { out.push({ page: p, error: e.message }); }
        await sleep(300);
    }
    return out;
}

async function mdc(params) {
    const t0 = Date.now();
    const res = await fetch(MDC_URL, {
        method: 'POST',
        headers: { ...MDC_HEADERS, Cookie: cookieHeader() },
        // 실제 화면이 함께 보내는 필드들. locale이 빠지면 일부 화면이 빈 블록을 준다.
        body: new URLSearchParams({ locale: 'ko_KR', csvxls_isNo: 'false', ...params }).toString(),
    });
    absorb(res);
    const elapsed = Date.now() - t0;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* HTML 에러 페이지일 수 있다 */ }
    // 응답 블록 이름이 화면마다 다르다(OutBlock_1 / output / block1) → 첫 배열 값을 집는다.
    const rows = json ? (Object.values(json).find(v => Array.isArray(v)) || []) : [];
    return { status: res.status, elapsed, rows, json, raw: text.slice(0, 300) };
}

// ── 0. code → ISIN ──────────────────────────────────────────────
// MDC 통계 화면은 6자리 단축코드가 아니라 **ISIN(isuCd)** 을 받는다. 어댑터를 만든다면
// 이 매핑 자체가 선행 과제다(stocks_directory에 ISIN 컬럼 없음).
async function resolveIsin(code) {
    const r = await mdc({ bld: 'dbms/comm/finder/finder_stkisu', mktsel: 'ALL', typeNo: '0', searchText: code });
    const hit = r.rows.find(x => (x.short_code || '').trim() === code) || r.rows[0];
    return { isin: hit?.full_code?.trim() || null, name: hit?.codeName?.trim() || null, status: r.status, count: r.rows.length, raw: r.raw };
}

async function main() {
    console.log('=== Phase 4 세션 3 · Step 0 — KRX 소스 역량 프로브 ===');
    console.log(`대상 종목: ${PROBE_CODE} · 기준일: ${TODAY}`);
    console.log('※ DB 미접속 · 쓰기 없음 · 어댑터 아님\n');

    const findings = { probeCode: PROBE_CODE, end: TODAY, ranAt: new Date().toISOString() };

    const cookies = await bootstrapSession();
    findings.sessionCookies = cookies;
    console.log(`[세션] 부트스트랩 쿠키: ${cookies.join(', ') || '(없음)'}\n`);

    // ── ISIN ────────────────────────────────────────────────────
    console.log('[0] code → ISIN 해석 (MDC finder_stkisu)');
    const isin = await resolveIsin(PROBE_CODE);
    findings.isin = isin;
    if (!isin.isin) {
        console.log(`  ✗ 실패 (HTTP ${isin.status}, 후보 ${isin.count}건) — 응답 앞부분: ${isin.raw}`);
        console.log('  → MDC 접근 자체가 막혔을 수 있습니다. 이후 프로브는 전부 실패할 것입니다.\n');
    } else {
        console.log(`  ✓ ${PROBE_CODE} → ${isin.isin} (${isin.name})`);
        console.log('  ⚠️ MDC 통계는 ISIN을 요구한다 → 어댑터는 code↔ISIN 매핑을 선행 확보해야 한다');
        console.log('     (stocks_directory에 ISIN 컬럼 없음. KRX Open API 종목기본정보 또는 이 finder로 1회 적재)\n');
    }

    // ── Q1. 투자자별 일별추이 — 조회 span 한계 ──────────────────
    console.log('[1] Q1 · 종목별 일별 투자자 순매수 (MDCSTAT02303, 상세 11구분)');
    findings.investor = {};
    for (const [label, days] of [['1개월', 30], ['1년', 365], ['3년', 1095]]) {
        const strtDd = minusDays(TODAY, days);
        try {
            const r = await mdc({
                bld: 'dbms/MDC/STAT/standard/MDCSTAT02303',
                isuCd: isin.isin || '', strtDd, endDd: TODAY,
                trdVolVal: '1',   // 1=거래량(주). 기존 investor_history 단위와 맞춘다 — 아래 §단위 주의
                askBid: '3',      // 3=순매수
            });
            const first = r.rows[r.rows.length - 1]?.TRD_DD;
            const last = r.rows[0]?.TRD_DD;
            findings.investor[label] = { requestedFrom: strtDd, rows: r.rows.length, first, last, elapsedMs: r.elapsed, status: r.status };
            console.log(`  ${label.padEnd(5)} 요청 ${strtDd}~${TODAY} → ${String(r.rows.length).padStart(4)}행  범위 ${first || '—'} ~ ${last || '—'}  (${r.elapsed}ms)`);
            if (r.rows.length === 0) console.log(`     응답 앞부분: ${r.raw}`);
        } catch (e) {
            findings.investor[label] = { error: e.message };
            console.log(`  ${label.padEnd(5)} ✗ ${e.message}`);
        }
        await sleep(400);
    }
    const y3 = findings.investor['3년'];
    console.log(`  → 3년 요청이 ${y3?.rows ?? 0}행. 서버가 span을 자르면 first가 요청 시작일보다 훨씬 뒤에 찍힌다.`);
    console.log('  → 잘린다면 어댑터는 연도별 청크로 나눠 호출해야 한다(pykrx도 청크를 안 해서 그대로 노출됨).\n');

    // 컬럼 구조 — 우리 institution/foreign_net/individual로 접을 수 있는지
    if (y3?.rows) {
        const sample = (await mdc({
            bld: 'dbms/MDC/STAT/standard/MDCSTAT02303',
            isuCd: isin.isin, strtDd: minusDays(TODAY, 10), endDd: TODAY, trdVolVal: '1', askBid: '3',
        })).rows[0];
        findings.investorColumns = sample ? Object.keys(sample) : [];
        console.log('  [컬럼] ', JSON.stringify(sample, null, 0).slice(0, 400));
        console.log('  ※ TRDVAL1..11 = 금융투자/보험/투신/사모/은행/기타금융/연기금/기타법인/개인/외국인/기타외국인');
        console.log('     우리 스키마 접기: institution = 1..7 합 · foreign_net = 10+11 · individual = 9\n');
        await sleep(400);
    }

    // ── Q2. 수정주가 ────────────────────────────────────────────
    console.log('[2] Q2 · 수정주가 (MDCSTAT01701, adjStkPrc 1=단순 / 2=수정)');
    findings.adjusted = {};
    if (isin.isin) {
        // 삼성전자 2018-05-04 50:1 액면분할 구간 — 단순/수정이 반드시 갈려야 한다.
        const span = { strtDd: '20180425', endDd: '20180510' };
        for (const [label, adj] of [['단순종가', '1'], ['수정종가', '2']]) {
            const r = await mdc({ bld: 'dbms/MDC/STAT/standard/MDCSTAT01701', isuCd: isin.isin, ...span, adjStkPrc: adj });
            const closes = r.rows.map(x => `${x.TRD_DD}:${x.TDD_CLSPRC}`).slice(0, 3);
            findings.adjusted[label] = { rows: r.rows.length, sample: closes, status: r.status };
            console.log(`  ${label} → ${r.rows.length}행  샘플 ${closes.join(' ') || '—'}`);
            await sleep(400);
        }
        const a = findings.adjusted['단순종가']?.sample?.join('|');
        const b = findings.adjusted['수정종가']?.sample?.join('|');
        findings.adjustedDiffers = Boolean(a && b && a !== b);
        console.log(`  → 두 값이 ${findings.adjustedDiffers ? '**다름** — 수정주가 실제 제공 확인' : '같음 — 이 구간에선 판별 불가(다른 분할 종목으로 재확인 필요)'}\n`);
    }

    // ── Q3. 호출 한도 ───────────────────────────────────────────
    console.log('[3] Q3 · 연속 호출 거동 (한도·차단 관찰)');
    const timings = [];
    for (let k = 0; k < 10; k++) {
        const r = await mdc({
            bld: 'dbms/MDC/STAT/standard/MDCSTAT02303',
            isuCd: isin.isin || '', strtDd: minusDays(TODAY, 30), endDd: TODAY, trdVolVal: '1', askBid: '3',
        });
        timings.push({ k, status: r.status, rows: r.rows.length, ms: r.elapsed });
        if (r.rows.length === 0) { console.log(`  #${k} 빈 응답 — 차단 의심. 앞부분: ${r.raw}`); break; }
    }
    findings.rateProbe = timings;
    const ok = timings.filter(t => t.rows > 0).length;
    console.log(`  ${ok}/${timings.length} 성공 · 평균 ${Math.round(timings.reduce((a, t) => a + t.ms, 0) / timings.length)}ms`);
    console.log('  ※ KRX는 한도를 문서화하지 않는다. 무차단이어도 backfill은 보수적 간격(≥300ms)으로.\n');

    // ── Open API 대조 (키 있을 때만) ────────────────────────────
    console.log('[4] KRX Open API 대조 (openapi.krx.co.kr)');
    if (!process.env.KRX_API_KEY) {
        console.log('  KRX_API_KEY 미설정 — 생략.');
        console.log('  ※ 문서상 Open API 서비스 40여 종에 **투자자별 거래실적이 없다**(지수/주식/증권상품/채권/파생/일반상품/ESG).');
        console.log('     즉 키를 받아도 수급 데이터는 Open API로는 못 받는다 — MDC가 유일 경로.\n');
        findings.openApi = { probed: false, note: '서비스 목록에 투자자별 없음(문서 근거)' };
    } else {
        const url = `https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=${TODAY}`;
        try {
            const res = await fetch(url, { headers: { AUTH_KEY: process.env.KRX_API_KEY } });
            const j = await res.json().catch(() => null);
            const rows = j ? (Object.values(j).find(v => Array.isArray(v)) || []) : [];
            findings.openApi = { probed: true, status: res.status, rows: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] };
            console.log(`  일별매매정보 HTTP ${res.status} · ${rows.length}행`);
            if (rows[0]) {
                console.log(`  컬럼: ${Object.keys(rows[0]).join(', ')}`);
                const hasInvestor = Object.keys(rows[0]).some(c => /FORN|INSTT|INVST/i.test(c));
                console.log(`  → 투자자별 컬럼 ${hasInvestor ? '있음(!)' : '없음 — 문서와 일치'}`);
            }
        } catch (e) {
            findings.openApi = { probed: true, error: e.message };
            console.log(`  ✗ ${e.message}`);
        }
        console.log('');
    }

    // ── 대안 경로 실측 ──────────────────────────────────────────
    console.log('[5] 대안 · 네이버 frgn.naver 페이지네이션 (이미 쓰는 소스, 인증 0)');
    const naver = await probeNaverDepth(PROBE_CODE, [1, 37, 60, 80]);
    findings.naver = naver;
    for (const n of naver) {
        console.log(`  page=${String(n.page).padStart(3)}  HTTP ${n.status ?? '—'}  날짜 ${n.dates ?? 0}건  최고(過去) ${n.oldest || '—'}  (${n.elapsedMs ?? '—'}ms)`);
    }
    const p37 = naver.find(n => n.page === 37);
    const naverOk = Boolean(p37?.oldest && p37.oldest <= '2023.12.31');
    console.log(`  → page당 ~20거래일. 3년(≈730행) ≈ 37페이지 · 178종목 ≈ 6,600요청 (300ms 간격 ≈ 33분)`);
    console.log(`  → 3년 도달: ${naverOk ? '**확인**' : '미확인'}\n`);

    // ── 게이트 판정 ─────────────────────────────────────────────
    const krxOk = Boolean(y3?.rows && y3.rows > 400);
    const gate = krxOk || naverOk;
    console.log('=== 게이트 판정 (§1) ===');
    console.log(`  Q1 3년 종목별 일별 투자자 순매수`);
    console.log(`     · KRX Open API : **데이터 없음** — 서비스 40여 종에 투자자별 항목 자체가 없다(문서)`);
    console.log(`     · KRX MDC      : 데이터는 있으나 ${krxOk ? '접근 성공' : '**로그인 필요**(2026 회원체계 변경) — 익명은 400 "LOGOUT"'}`);
    console.log(`     · 네이버 페이징 : ${naverOk ? '**가능**(실측)' : '미확인'} ← 인증·신규 의존성 0`);
    console.log(`     ⇒ ${gate ? '통과' : '미통과'}`);
    console.log(`  Q2 수정주가        : KRX MDC adjStkPrc=2 문서상 존재 · ${findings.adjustedDiffers ? '실측 확인' : '로그인 게이트로 **미확인**'} (네이버는 무수정)`);
    console.log(`  Q3 호출 한도       : KRX·네이버 모두 문서 없음. KRX는 계정 게이트가 사실상의 한도`);
    console.log(`\n  → ${gate ? '수급축 검증 진행 가능' : '수급축 영구 불가 — 트랙 중단하고 §6(밸류)·②③으로 재편'}`);
    if (gate && !krxOk) {
        console.log('  ⚠️ 단, 이 경로는 **네이버**다 — 지시문 §0의 "네이버 단일소스 리스크 해소"는 달성되지 않는다.');
        console.log('     그 목표는 KRX 회원계정 도입이라는 별개 결정에 달렸다(ADR 참조).');
    }
    findings.gatePassed = gate;
    findings.gateVia = krxOk ? 'krx-mdc' : naverOk ? 'naver-pagination' : null;

    console.log('\n--- JSON (phase4-krx-source-capability.md에 붙여넣기) ---');
    console.log(JSON.stringify(findings, null, 2));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
