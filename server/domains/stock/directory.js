// KRX 상장법인목록(corpList.do) → stocks_directory 동기화.
//
// KRX 엔드포인트는 확장자가 .xls 이지만 실제 응답은 EUC-KR HTML 테이블이다.
// 컬럼 순서: 회사명, 종목코드, 업종, 주요제품, 상장일, 결산월, 대표자명, 홈페이지, 지역.
// naver.js와 동일한 패턴으로 responseType: 'arraybuffer' → TextDecoder('euc-kr')로 디코드.
//
// 시세 데이터는 여전히 네이버 크롤링 유지. 이 모듈은 명→코드 매핑 디렉토리 용도로만 사용.
import axios from 'axios';
import { query } from '../../db/connection.js';

const KRX_URLS = {
    KOSPI:  'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=stockMkt',
    KOSDAQ: 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=kosdaqMkt',
};

// KRX이 HTML 에러 페이지(HTTP 200 + <tr> 0~수십 개)를 돌려줄 때 조용히 "0건 upsert 성공"으로
// 착각하지 않도록 최소 종목 수 임계값을 둔다. 실측 기준 KOSPI 950+ / KOSDAQ 1600+.
// 너무 빡빡하면 KRX가 정상 데이터만 소폭 줄어든 날도 차단하므로 여유 있게 낮춤.
const MIN_EXPECTED_ROWS = {
    KOSPI: 500,
    KOSDAQ: 800,
};

// D1 — 자동 sync 재동기화 임계값. "행 0개일 때만"이 아니라 KOSPI+KOSDAQ 합계가 이 값 미만이면
// 재동기화한다. 이전엔 실패로 남은 1행이 count>0이라 auto-sync를 영구 skip시켰다(디렉토리 공백 고착).
// 정상 ~2,600의 안전 하한. 성공 후엔 >1000이라 매 부팅마다 KRX를 두드리지 않는다.
const MIN_DIRECTORY_TOTAL = 1000;

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

// HTML 테이블 1행을 { code, name, listedAt } 으로 파싱.
// 1A — KRX 실컬럼: 회사명(0)·시장구분(1)·종목코드(2)·업종(3)·주요제품(4)·상장일(5)…
// 종목코드는 stripped[2] 우선 채택하되 **끝자리 영문 허용**(우선주/스팩 00088K류 → /^[0-9A-Z]{6}$/).
// 이전 /^\d{6}$/ 스캔은 알파뉴메릭 코드를 놓쳐 ~90행이 000000으로 붕괴했다. 날짜·코드 모두 값 패턴으로
// 잡아 컬럼 순서 재변경(시장구분 삽입처럼)에도 견고. market은 fetchMarket 인자에서 오므로 tds[1]은 무시.
function parseRow(trHtml) {
    const tds = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let match;
    while ((match = tdRegex.exec(trHtml)) !== null) {
        tds.push(match[1]);
    }
    if (tds.length < 5) return null;

    const stripped = tds.map(stripTags);
    const name = stripped[0];
    // 종목코드 = stripped[2] 우선(알파뉴메릭 6자리). 실패 시 알파뉴메릭 6자리 셀 스캔 폴백.
    let code = /^[0-9A-Z]{6}$/.test(stripped[2] || '') ? stripped[2] : null;
    if (!code) code = stripped.find(t => /^[0-9A-Z]{6}$/.test(t));
    // 상장일 = 날짜 패턴 셀 스캔(인덱스 고정 대신). 구분자 -, /, . 허용 → '-'로 정규화.
    const rawListed = stripped.find(t => /^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(t));
    const listedAt = rawListed ? rawListed.replace(/[/.]/g, '-') : null;

    if (!name || !/^[0-9A-Z]{6}$/.test(code)) return null;
    return { code, name, listedAt };
}

// fetch + EUC-KR decode + tbody의 <tr> 추출까지(파싱 전 원자료). fetchMarket과 parsepreview가 공유.
async function fetchMarketRaw(market) {
    const url = KRX_URLS[market];
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        // D2 — Referer 추가. KRX은 Referer 없는 요청을 봇으로 보고 에러 페이지를 주기도 한다.
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://kind.krx.co.kr/' },
        timeout: 30000,
    });
    if (response.status !== 200) {
        throw new Error(`KRX ${market} responded with HTTP ${response.status}`);
    }
    const html = new TextDecoder('euc-kr').decode(response.data);

    // 빈 응답 또는 마크업 자체가 이상한 경우 — 장애 페이지 가능성 높음.
    if (!html || html.length < 1000) {
        throw new Error(`KRX ${market} response too short (${html?.length ?? 0} bytes)`);
    }

    // E1 — 머리글 문자열 기반 "HTML error page" 판정 제거. KRX 엑셀 export가 유효하면서도
    // MS Office HTML 래퍼(<html ...>)로 시작하는 케이스가 있어 정상 데이터를 오탐했다(sync 0건).
    // 진짜 유효성 기준은 "파싱된 종목 행 수"(fetchMarket의 MIN_EXPECTED_ROWS) — 그게 유일한 게이트다.

    // tbody 내부 행만 매칭 — header/footer 오염 방지.
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const scope = tbodyMatch ? tbodyMatch[1] : html;
    const trRows = scope.match(/<tr[\s\S]*?<\/tr>/g) || [];
    const ct = response.headers['content-type'] || '';
    return { html, trRows, ct };
}

async function fetchMarket(market) {
    const { html, trRows, ct } = await fetchMarketRaw(market);

    const parsed = [];
    for (const tr of trRows) {
        const row = parseRow(tr);
        if (row) parsed.push({ ...row, market });
    }

    // 파싱된 종목 수가 최소 임계값 미달이면 KRX 응답 이상으로 간주하고 upsert 스킵.
    // (0건 조용히 성공 처리로 디렉토리가 공백으로 유지되는 문제 방지)
    const minExpected = MIN_EXPECTED_ROWS[market];
    if (parsed.length < minExpected) {
        // E1 — 실패 시 다음 진단(포맷 변경 vs IP 차단)이 가능하도록 응답 메타를 남긴다.
        const headPreview = html.trimStart().slice(0, 300).replace(/\s+/g, ' ');
        console.error(`[directory] ${market} parsed=${parsed.length} (<${minExpected}) | content-type=${ct} | len=${html.length} | head="${headPreview}"`);
        throw new Error(
            `KRX ${market} parsed ${parsed.length} rows, below threshold ${minExpected} ` +
            `— likely HTML error page or format change. Skipping upsert.`
        );
    }

    console.log(`[directory] ${market} parsed ${parsed.length} rows, content-type=${ct}`);
    return parsed;
}

// D2 — fetchMarket 재시도 래퍼. KRX rate-limit 순간(HTML 에러 페이지·threshold 미달·네트워크)에
// 선형 백오프로 재시도한다. 부팅 자동 sync가 순간적 차단에 걸려도 흡수. 전 시도 실패면 마지막 에러 throw.
async function fetchMarketWithRetry(market, attempts = 3, baseDelayMs = 6000) {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fetchMarket(market);
        } catch (e) {
            lastErr = e;
            if (i < attempts) {
                const delay = baseDelayMs * i;   // 선형 백오프: 6s, 12s, ...
                console.warn(`[directory] ${market} fetch 실패 (${i}/${attempts}): ${e.message} — ${delay / 1000}s 후 재시도`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastErr;
}

async function upsertBatch(rows) {
    if (rows.length === 0) return 0;
    // Neon pool max=5 경합 방지를 위해 한 번에 한 행씩 upsert (전 종목 ~2,600행 * ~20ms = 52s).
    // 대량 UPSERT가 필요해지면 unnest 패턴으로 1쿼리 전환 고려.
    for (const { code, name, market, listedAt } of rows) {
        await query(
            `INSERT INTO stocks_directory (code, name, market, listed_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name,
                market = EXCLUDED.market,
                listed_at = COALESCE(EXCLUDED.listed_at, stocks_directory.listed_at),
                updated_at = NOW()`,
            [code, name, market, listedAt]
        );
    }
    return rows.length;
}

export async function syncDirectory() {
    const start = Date.now();
    let kospiCount = 0;
    let kosdaqCount = 0;

    try {
        const kospi = await fetchMarketWithRetry('KOSPI');
        kospiCount = await upsertBatch(kospi);
    } catch (e) {
        console.error('[directory] KOSPI fetch/upsert failed:', e.message);
    }

    try {
        const kosdaq = await fetchMarketWithRetry('KOSDAQ');
        kosdaqCount = await upsertBatch(kosdaq);
    } catch (e) {
        console.error('[directory] KOSDAQ fetch/upsert failed:', e.message);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ KOSPI ${kospiCount}건 / KOSDAQ ${kosdaqCount}건 upsert 완료 (${elapsed}s)`);
    return { kospi: kospiCount, kosdaq: kosdaqCount };
}

// D1 — 이름은 유지하되(호출부 scheduler.js 영향 최소화) 시맨틱은 "empty"가 아니라
// **under-threshold 재동기화**. 디렉토리가 MIN_DIRECTORY_TOTAL 미만이면(실패로 남은 소수 행 포함)
// 자동 재적재한다. 성공해 임계값을 넘기면 이후 부팅에선 skip.
export async function syncDirectoryIfEmpty() {
    try {
        const { rows } = await query('SELECT COUNT(*)::int AS count FROM stocks_directory');
        const count = rows[0]?.count ?? 0;
        if (count >= MIN_DIRECTORY_TOTAL) {
            console.log(`[directory] ${count}건 (임계값 ${MIN_DIRECTORY_TOTAL} 이상) — 초기 동기화 skip`);
            return { skipped: true, count };
        }
        console.log(`[directory] ${count}건 (임계값 ${MIN_DIRECTORY_TOTAL} 미만) — 자동 재동기화`);
        return await syncDirectory();
    } catch (e) {
        console.error('[directory] syncDirectoryIfEmpty failed:', e.message);
        return null;
    }
}
