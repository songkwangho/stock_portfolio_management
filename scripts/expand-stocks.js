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
import 'dotenv/config';
import { getStockData } from '../server/domains/stock/service.js';
import pool from '../server/db/connection.js';

const DELAY_MS = 3000;   // 요청 간격 3초 (네이버 rate limit 준수)
const BATCH_SIZE = 3;    // 동시 처리 수

// 확대 대상 ~86개. 이미 등록된 코드는 자동 skip.
// 괄호 주석은 실측 전 추정 — 네이버에서 조회 실패 시 그대로 fail로 집계되고 DB는 변경 없음.
const TARGET_CODES = [
    // === 대형주·지주 ===
    '005490', // POSCO홀딩스
    '000010', // 신한은행
    '086790', // 하나금융지주
    '105560', // KB금융
    '055550', // 신한지주
    '316140', // 우리금융지주
    '024110', // 기업은행
    '032830', // 삼성생명
    '088350', // 한화생명
    '000810', // 삼성화재
    '001450', // 현대해상

    // === 2차전지·전기차 ===
    '247540', // 에코프로비엠
    '086520', // 에코프로
    '900140', // LG디스플레이 (실제)
    '003670', // 포스코퓨처엠
    '402340', // SK스퀘어 (이미 등록)
    '361610', // SK아이이테크놀로지
    '011790', // SKC
    '298050', // 효성첨단소재
    '064960', // S&T모티브

    // === AI·반도체·IT ===
    '034020', // 두산에너빌리티
    '000150', // 두산
    '042700', // 한미반도체
    '336370', // 솔브레인홀딩스
    '357780', // 솔브레인
    '240810', // 원익IPS
    '030200', // KT
    '017670', // SK텔레콤
    '032640', // LG유플러스
    '251270', // 넷마블
    '036570', // 엔씨소프트
    '263750', // 펄어비스

    // === 방산·우주항공 ===
    '012450', // 한화에어로스페이스
    '047050', // 포스코인터내셔널
    '000880', // 한화
    '064350', // 현대로템
    '272210', // 한화시스템
    '003490', // 대한항공
    '020560', // 아시아나항공

    // === 바이오·헬스케어 ===
    '068270', // 셀트리온
    '000100', // 유한양행
    '128940', // 한미약품
    '185750', // 종근당
    '002380', // KCC
    '326030', // SK바이오팜
    '302440', // SK바이오사이언스
    '145020', // 휴젤
    '214370', // 케어젠
    '196170', // 알테오젠

    // === 친환경·에너지 ===
    '015760', // 한국전력
    '036460', // 한국가스공사
    '034730', // SK (이미 등록)
    '011210', // 현대위아
    '267250', // 현대중공업지주
    '009540', // HD한국조선해양
    '042660', // 한화오션
    '010620', // 현대미포조선
    '329180', // HD현대중공업

    // === 소비재·유통·식품 ===
    '005300', // 롯데칠성
    '004370', // 농심
    '097950', // CJ제일제당
    '000080', // 하이트진로
    '007310', // 오뚜기
    '011780', // 금호석유
    '001040', // CJ
    '006360', // GS건설
    '000720', // 현대건설
    '047040', // 대우건설

    // === 엔터·미디어·게임 ===
    '352820', // 하이브
    '041510', // SM엔터테인먼트
    '035900', // JYP엔터테인먼트
    '122870', // 와이지엔터테인먼트
    '293490', // 카카오게임즈
    '112040', // 위메이드

    // === KOSDAQ 우량주 ===
    '091990', // 셀트리온헬스케어
    '041960', // 셀트리온제약
    '028300', // HLB
    '066970', // L&F (엘앤에프)
    '259960', // 크래프톤
    '039130', // 하나투어
    '035760', // CJ ENM
    '018260', // 삼성에스디에스
    '011070', // LG이노텍
    '009150', // 삼성전기 (이미 등록)
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
