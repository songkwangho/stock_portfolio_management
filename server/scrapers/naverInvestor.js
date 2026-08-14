/**
 * Phase 4 세션 3 — 투자자 순매매 이력 어댑터 (Port & Adapter).
 *
 * ⚠️ 지시문 §2-1은 `server/scrapers/krx.js`(KRX_API_KEY)를 지정했지만, Step 0 프로브가
 *    **그 경로가 존재하지 않음**을 실측했다:
 *      · KRX Open API(openapi.krx.co.kr) — 서비스 40여 종에 투자자별 항목 자체가 없다.
 *      · data.krx MDC(getJsonData.cmd) — 데이터는 있으나 2026년 회원체계 변경으로
 *        **본인인증 회원 로그인 필수**. 익명 요청은 전 MDCSTAT 화면이 HTTP 400 "LOGOUT".
 *    키만 있으면 되는 물건이 아니라서, 그대로 만들면 **동작하지 않는 어댑터**가 된다.
 *
 * 대신 이미 프로덕션에서 쓰는 네이버 소스에 `&page=N`을 붙였다 — 실측으로 page 80이
 * 2020-02까지 내려간다(3년 ≈ 37페이지). 3년 backfill 경로가 이미 손에 있었다.
 *
 * 인터페이스는 `fetchInvestorHistory(code, opts)`로 고정한다 — 훗날 KRX 계정을 도입하면
 * 같은 시그니처의 krx.js로 갈아끼우면 되고 호출부는 안 바뀐다.
 *
 * ⚠️ 이 경로는 **네이버**다 — 단일소스 리스크는 해소되지 않는다(docs/ADR-001 참조).
 */

const PAGE_URL = (code, page) => `https://finance.naver.com/item/frgn.naver?code=${code}&page=${page}`;

/**
 * frgn.naver 표 파싱 — **순수 함수**(네트워크 없음) → 단위 테스트 대상.
 *
 * 컬럼(실측 헤더): 날짜 · 종가 · 전일비 · 등락률 · 거래량 · 기관 순매매량 · 외국인 순매매량 · 외국인 보유주수 · 보유율
 *
 * ⚠️ index 7은 **외국인 보유주수**이지 개인이 아니다. 기존 `scrapeInvestorData`는 이걸
 *    `individual`로 넣고 있다(server/scrapers/naver.js) — 이 페이지에 개인 순매매 컬럼은 없다.
 *    여기서는 그 오류를 복제하지 않고 `individual: null`로 둔다(없는 값을 지어내지 않는다).
 *
 * @returns [{ date:'YYYYMMDD', institution:number, foreign_net:number, individual:null }] — 페이지 내 순서 그대로(최신 우선)
 */
export function parseInvestorRows(html) {
    const out = [];
    for (const row of String(html || '').match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
        const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [])
            .map(td => td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim());
        if (cells.length < 7) continue;

        const date = cells[0].replace(/\./g, '').trim();
        if (!/^\d{8}$/.test(date)) continue;

        // 음수는 '-1,234' 형태의 리터럴. 쉼표·공백·부호 외 문자는 버린다.
        const num = (s) => {
            const cleaned = String(s).replace(/[^\d-]/g, '');
            const v = parseInt(cleaned, 10);
            return Number.isFinite(v) ? v : 0;
        };

        out.push({ date, institution: num(cells[5]), foreign_net: num(cells[6]), individual: null });
    }
    return out;
}

/**
 * 종목의 투자자 순매매 이력을 과거로 훑는다. fail-soft — 예외를 던지지 않고 모은 만큼 반환한다.
 *
 * @param opts.maxPages  최대 페이지(1페이지 ≈ 20거래일). 3년 ≈ 37
 * @param opts.fromDate  'YYYYMMDD' — 이 날짜보다 과거가 나오면 조기 종료
 * @param opts.delayMs   페이지 간 간격(rate limit)
 */
export async function fetchInvestorHistory(code, opts = {}) {
    const { maxPages = 40, fromDate = null, delayMs = 300, fetchImpl = fetch } = opts;
    const byDate = new Map();
    let pagesRead = 0, emptyStreak = 0;

    for (let page = 1; page <= maxPages; page++) {
        let rows = [];
        try {
            const res = await fetchImpl(PAGE_URL(code, page), {
                headers: { 'User-Agent': 'Mozilla/5.0', Referer: `https://finance.naver.com/item/frgn.naver?code=${code}` },
            });
            if (!res.ok) break;
            rows = parseInvestorRows(new TextDecoder('euc-kr').decode(await res.arrayBuffer()));
        } catch {
            break;   // fail-soft: 여기까지 모은 것만 쓴다
        }
        pagesRead++;

        // 빈 페이지가 연속 2번이면 이력 끝. 1번은 일시적 결측일 수 있어 바로 끊지 않는다.
        if (rows.length === 0) { if (++emptyStreak >= 2) break; continue; }
        emptyStreak = 0;

        for (const r of rows) byDate.set(r.date, r);

        // 페이지 내 최고(과거) 날짜가 목표를 넘어섰으면 더 볼 필요 없다.
        const oldest = rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date);
        if (fromDate && oldest <= fromDate) break;

        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }

    const all = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { rows: fromDate ? all.filter(r => r.date >= fromDate) : all, pagesRead };
}
