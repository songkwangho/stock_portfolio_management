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

// HTML 테이블 1행을 { code, name, listedAt } 으로 파싱.
// <tr> 내 <td> 순서대로 회사명, 종목코드, ..., 상장일, ... 이므로 간단 정규식으로 추출한다.
function parseRow(trHtml) {
    const tds = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let match;
    while ((match = tdRegex.exec(trHtml)) !== null) {
        tds.push(match[1]);
    }
    if (tds.length < 5) return null;

    const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

    const name = stripTags(tds[0]);
    const rawCode = stripTags(tds[1]);
    const code = rawCode.replace(/\D/g, '').padStart(6, '0');
    const rawListed = stripTags(tds[4] || '');
    const listedAt = /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(rawListed)
        ? rawListed.replace(/\//g, '-')
        : null;

    if (!name || !/^\d{6}$/.test(code)) return null;
    return { code, name, listedAt };
}

async function fetchMarket(market) {
    const url = KRX_URLS[market];
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
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

    // tbody 내부 행만 매칭 — header/footer 오염 방지.
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const scope = tbodyMatch ? tbodyMatch[1] : html;
    const rows = scope.match(/<tr[\s\S]*?<\/tr>/g) || [];

    const parsed = [];
    for (const tr of rows) {
        const row = parseRow(tr);
        if (row) parsed.push({ ...row, market });
    }

    // 파싱된 종목 수가 최소 임계값 미달이면 KRX 응답 이상으로 간주하고 upsert 스킵.
    // (0건 조용히 성공 처리로 디렉토리가 공백으로 유지되는 문제 방지)
    const minExpected = MIN_EXPECTED_ROWS[market];
    if (parsed.length < minExpected) {
        throw new Error(
            `KRX ${market} parsed ${parsed.length} rows, below threshold ${minExpected} ` +
            `— likely HTML error page or format change. Skipping upsert.`
        );
    }

    return parsed;
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
        const kospi = await fetchMarket('KOSPI');
        kospiCount = await upsertBatch(kospi);
    } catch (e) {
        console.error('[directory] KOSPI fetch/upsert failed:', e.message);
    }

    try {
        const kosdaq = await fetchMarket('KOSDAQ');
        kosdaqCount = await upsertBatch(kosdaq);
    } catch (e) {
        console.error('[directory] KOSDAQ fetch/upsert failed:', e.message);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ KOSPI ${kospiCount}건 / KOSDAQ ${kosdaqCount}건 upsert 완료 (${elapsed}s)`);
    return { kospi: kospiCount, kosdaq: kosdaqCount };
}

// 디렉토리에 행이 하나라도 있으면 skip — 서버 시작 시 반복 동기화 방지.
// 일 1회 스케줄링은 Phase 6 본작업에서 setupScheduler 편입 예정.
export async function syncDirectoryIfEmpty() {
    try {
        const { rows } = await query('SELECT COUNT(*)::int AS count FROM stocks_directory');
        const count = rows[0]?.count ?? 0;
        if (count > 0) {
            console.log(`[directory] ${count}건 이미 존재 — 초기 동기화 skip`);
            return { skipped: true, count };
        }
        return await syncDirectory();
    } catch (e) {
        console.error('[directory] syncDirectoryIfEmpty failed:', e.message);
        return null;
    }
}
