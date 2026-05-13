#!/usr/bin/env node
// 96종목 → ~200종목 확대 배치 스크립트.
// 실행: DATABASE_URL=postgres://... node scripts/expand-stocks.js
//
// 동작:
//   1) TARGET_CODES 중 stocks 테이블에 이미 존재하는 코드는 skip
//   2) 남은 코드에 대해 getStockData(code) 호출 → 네이버 크롤링 + upsert
//   3) BATCH_SIZE=3 동시 호출, 배치 간 DELAY_MS=3000 대기 (네이버 rate-limit 보호)
//   4) 성공/실패 카운트 로그
//
// 참고: 테마 매핑은 이 스크립트가 건드리지 않는다. data.js의 STOCK_THEME_MAP +
// CATEGORY_TO_THEMES 폴백이 다음 서버 재시작 시 새 종목을 자동 매핑한다.
//
// DATABASE_URL은 CLI에서 주입한다 (dotenv 의존성 없음):
//   DATABASE_URL=postgres://... node scripts/expand-stocks.js
import { getStockData } from '../server/domains/stock/service.js';
import pool from '../server/db/connection.js';

const DELAY_MS = 3000;   // 요청 간격 3초 (네이버 rate limit 준수)
const BATCH_SIZE = 3;    // 동시 처리 수

// 2차 확대 — 1차에서 실패한 코드 재시도 + 신규 대상 추가. 137 → 200 목표.
// 이미 DB에 있는 코드는 스크립트가 자동 skip하므로 중복 포함되어도 무해.
//
// 1차 실패 원인 분류:
//   - 합병/분할로 코드 변경 (예: 일부 지주사 재편)
//   - 네이버 금융 조회 자체 불가 (상장폐지·임시정지)
//   - 잘못된 코드 (오타)
//
// 본 리스트의 검증 책임은 실행 단계에 위임 — 스크립트가 코드별 성공/실패를 로그한다.
const TARGET_CODES = [
    // === 금융 (고배당 테마 강화) ===
    '139130', // DGB금융지주
    '192400', // 쿠쿠홀딩스
    '071050', // 한국금융지주
    '030610', // 교보증권
    '001500', // 현대차증권
    '138040', // 메리츠금융지주

    // === 바이오·헬스케어 추가 ===
    '091990', // 셀트리온헬스케어
    '000020', // 동화약품
    '003090', // 대웅
    '002720', // 국제약품
    '005690', // 파미셀
    '086900', // 메디톡스
    '145720', // 덴티움
    '007390', // 네이처셀
    '237690', // 에스티팜
    '214150', // 클래시스

    // === AI·반도체 추가 ===
    '079370', // 제우스
    '036830', // 솔브레인홀딩스
    '232830', // 다우데이타
    '039420', // 케이티스
    '053610', // 프로텍
    '272290', // 이녹스첨단소재

    // === 방산·우주 추가 ===
    '006120', // SK디스커버리
    '090080', // 평화산업
    '065680', // 우주일렉트로

    // === 조선·중공업·소재 ===
    '010060', // OCI홀딩스
    '036490', // 서울반도체
    '054620', // 에스디바이오센서
    '033780', // KT&G

    // === 소비재·유통 ===
    '007980', // 태평양물산
    '002790', // 아모레G
    '008770', // 호텔신라

    // === 에너지·소재 추가 ===
    '010780', // 아이에스동서
    '014680', // 한솔케미칼
    '025550', // 한국선재
    '006650', // 대한유화
    '267270', // 현대건설기계

    // === 게임·엔터 추가 ===
    '041040', // CJ CGV
    '069080', // 웹젠
    '225570', // 넥슨게임즈
    '017180', // 우리손에프앤지
    '020120', // 코오롱인더

    // === KOSDAQ 우량주 추가 ===
    '095660', // 네오위즈
    '060850', // 한국콜마홀딩스
];

async function expandStocks() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL 환경변수가 필요합니다.');
        process.exit(1);
    }

    // 1. 현재 DB에 있는 코드 목록 조회
    const { rows: existing } = await pool.query('SELECT code FROM stocks');
    const existingCodes = new Set(existing.map(r => r.code));

    // 2. 신규 추가 대상만 필터링 + 중복 제거
    const unique = Array.from(new Set(TARGET_CODES));
    const toAdd = unique.filter(code => !existingCodes.has(code));
    const skipped = unique.length - toAdd.length;
    console.log(`📋 추가 대상: ${toAdd.length}개 (전체 ${unique.length}개 중 기존 ${skipped}개 skip)`);
    console.log(`📊 DB 현재 종목: ${existingCodes.size}개`);

    if (toAdd.length === 0) {
        console.log('✅ 추가할 종목이 없습니다. 종료.');
        await pool.end();
        return;
    }

    // 3. 배치 처리 — Promise.allSettled로 한 종목 실패가 배치 전체를 중단시키지 않도록.
    let success = 0, fail = 0;
    for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
        const batch = toAdd.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(code => getStockData(code))
        );

        results.forEach((result, idx) => {
            const code = batch[idx];
            if (result.status === 'fulfilled' && result.value) {
                console.log(`✅ ${code} ${result.value.name}`);
                success++;
            } else {
                const msg = result.status === 'rejected'
                    ? result.reason?.message
                    : '데이터 없음 (네이버 조회 실패)';
                console.log(`❌ ${code} 실패: ${msg}`);
                fail++;
            }
        });

        if (i + BATCH_SIZE < toAdd.length) {
            console.log(`⏳ ${DELAY_MS / 1000}초 대기...`);
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }

    console.log(`\n🎉 완료: 성공 ${success}개, 실패 ${fail}개`);
    const { rows: after } = await pool.query('SELECT COUNT(*)::int AS count FROM stocks');
    console.log(`📊 DB 총 종목 수: ${after[0].count}개`);
    await pool.end();
}

expandStocks().catch(async (e) => {
    console.error('expand-stocks failed:', e);
    process.exitCode = 1;
    await pool.end().catch(() => {});
});
