// [임시] DART 파서 검증용 부트 샘플 — 검증 완료 후 이 파일 + server.js의 호출부를 제거한다.
//
// CC(개발 에이전트)는 DART_API_KEY·DATABASE_URL이 없어 실제 응답 구조를 못 본다.
// Render에는 키가 있으므로, DART_SAMPLE_ON_BOOT=1일 때 서버 기동 후 1회 응답 "구조"만
// 로그로 남겨 파서(dartAccounts.matchAccount / parseAmount / categorize)를 실제와 대조한다.
//
// 안전장치:
// - 플래그(DART_SAMPLE_ON_BOOT=1) 없으면 절대 실행 안 됨(server.js에서 가드).
// - 키·URL·금액 실값을 로그에 남기지 않는다. 금액은 자릿수를 '9'로 마스킹해 포맷만 노출.
// - 어떤 실패도 throw하지 않는다(server.js에서 catch로 한 번 더 감쌈).
import axios from 'axios';
import { fetchFinancials } from './dart.js';
import { matchAccount } from '../helpers/dartAccounts.js';
import { categorizeDisclosure } from '../helpers/dartCategory.js';
import { query } from '../db/connection.js';

// 삼성전자 corp_code — 매핑 테이블이 비었을 때 폴백(운영자 PART 0 curl에서 확인된 공개값).
// 10만 건 corpCode 적재를 부트에서 하지 않기 위한 판단(Render 512MB 메모리 보호).
const FALLBACK_005930 = '00126380';

// 금액 마스킹: 자릿수를 9로 치환해 콤마/부호/소수점/길이 등 "포맷"만 드러낸다(실값 0 노출).
const maskAmt = (v) => (v === null || v === undefined) ? String(v) : String(v).replace(/\d/g, '9').slice(0, 25);

async function resolveCorpCode() {
    try {
        const { rows } = await query(`SELECT corp_code FROM dart_corp_codes WHERE stock_code = '005930' LIMIT 1`);
        if (rows[0]?.corp_code) return { corp: rows[0].corp_code, source: 'db' };
    } catch (e) {
        console.error('[dart-sample] corp_code DB lookup failed:', e.message);
    }
    return { corp: FALLBACK_005930, source: 'fallback' };
}

export async function sampleDartOnce() {
    console.log('[dart-sample] ===== DART 파서 검증 부트 샘플 시작 =====');
    const { corp, source } = await resolveCorpCode();
    console.log(`[dart-sample] 005930 corp_code source=${source}`);

    // ── 1. 재무제표 구조 (2025 3분기보고서, CFS → 없으면 OFS) ──
    let fin = await fetchFinancials(corp, 2025, '11014', 'CFS');
    let usedFs = 'CFS';
    if (!fin || fin.list.length === 0) { fin = await fetchFinancials(corp, 2025, '11014', 'OFS'); usedFs = 'OFS'; }

    if (!fin) {
        console.log('[dart-sample] financials: 응답 없음(013/에러/무키). status 로그는 위 [dart] 라인 참조');
    } else {
        const list = fin.list;
        console.log(`[dart-sample] financials status=${fin.status} fs=${usedFs} list.length=${list.length}`);
        console.log('[dart-sample] item keys:', Object.keys(list[0] || {}));
        console.log('[dart-sample] first 3 items (금액은 자릿수 마스킹):');
        list.slice(0, 3).forEach((it, i) => {
            console.log(`  [${i}]`, JSON.stringify({
                sj_div: it.sj_div, sj_nm: it.sj_nm,
                account_id: it.account_id, account_nm: it.account_nm,
                fs_div: it.fs_div,
                thstrm_amount_type: typeof it.thstrm_amount,
                thstrm_amount_mask: maskAmt(it.thstrm_amount),
                frmtrm_amount_type: typeof it.frmtrm_amount,
                frmtrm_amount_mask: maskAmt(it.frmtrm_amount),
            }));
        });
        // 우리 파서가 실제로 매칭하는 계정(오매칭 검증 포함)
        const matched = [];
        for (const it of list) {
            const m = matchAccount(it);
            if (m) {
                // 매칭 경로 확인(문제 3): account_id가 표준코드면 1차(id), 아니면 2차(nm).
                const via = (m.stdIds || []).includes(String(it.account_id || '').trim()) ? 'id' : 'nm';
                matched.push({ id: m.id, via, from: it.account_nm, sj: it.sj_div, amt_mask: maskAmt(it.thstrm_amount) });
            }
        }
        console.log(`[dart-sample] matched ${matched.length}건 (canonical id ↔ 실제 account_nm):`);
        matched.forEach(m => console.log('   ', JSON.stringify(m)));
        const uniqueIds = [...new Set(matched.map(m => m.id))];
        console.log('[dart-sample] unique canonical ids:', uniqueIds);
    }

    // ── 2. 공시 필터 진단(TASK 1) — corp_code가 실제로 필터링하는지 원인 규명 ──
    //    원시 axios로 응답 메타(total_count) + unique stock_codes 확인. 키는 마스킹.
    try {
        const key = process.env.DART_API_KEY;
        const end = new Date();
        const bgn = new Date(); bgn.setMonth(bgn.getMonth() - 1);
        const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        const params = { crtfc_key: key, corp_code: corp, bgn_de: ymd(bgn), end_de: ymd(end), page_no: '1', page_count: '100' };
        // 파라미터명·값 확인(키만 마스킹) — corp_code가 실제로 실려 나가는지, 오타 없는지.
        console.log('[dart-sample] list.json params (key masked):', JSON.stringify({ ...params, crtfc_key: '***' }));
        const res = await axios.get('https://opendart.fss.or.kr/api/list.json', {
            params, responseType: 'text', timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const json = JSON.parse(res.data);
        console.log('[dart-sample] meta:', JSON.stringify({
            status: json.status, message: json.message,
            total_count: json.total_count, total_page: json.total_page,
            page_no: json.page_no, page_count: json.page_count,
        }));
        const list = Array.isArray(json.list) ? json.list : [];
        const codes = [...new Set(list.map(i => String(i.stock_code || '').trim()))];
        console.log(`[dart-sample] list.length=${list.length} unique stock_codes=${codes.length}:`, codes.slice(0, 10));
        console.log('[dart-sample] 판정:',
            codes.filter(Boolean).length <= 1 ? 'corp_code 필터 정상(단일 종목)' : '전 시장 조회 의심(여러 종목 혼입)');
        if (list[0]) {
            console.log('[dart-sample] disclosure item keys:', Object.keys(list[0]));
            const it = list[0];
            console.log('[dart-sample] first item:', JSON.stringify({
                stock_code: it.stock_code, corp_cls: it.corp_cls, rm: it.rm,
                report_nm: it.report_nm, rcept_dt: it.rcept_dt, flr_nm: it.flr_nm,
                categorized: categorizeDisclosure(it.report_nm),
            }));
        }
    } catch (e) {
        console.error('[dart-sample] disclosure diagnose failed:', e.message);
    }

    console.log('[dart-sample] ===== 부트 샘플 종료 (검증 후 DART_SAMPLE_ON_BOOT 제거) =====');
}
