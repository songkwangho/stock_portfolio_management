#!/usr/bin/env node
// stocks_directory 쓰레기 행 정리 (1C — 유니버스 확장 마무리).
//
// 삭제 대상(고정): '000000'(파서 붕괴 잔재) · '999999'(debug 센티넬 __DEBUG__).
// 파서 1A 수정으로 신규 000000은 더 생기지 않지만, 이전 붕괴 행·센티넬은 남으므로 명시 삭제한다.
//
// ⚠️ 삭제는 비가역이다. 먼저 --dry-run으로 대상을 확인하라.
//
// 사용법 (DATABASE_URL은 CLI 주입, dotenv 의존성 없음):
//   DATABASE_URL=postgres://... node scripts/cleanup-directory-junk.js --dry-run   # 대상만 확인
//   DATABASE_URL=postgres://... node scripts/cleanup-directory-junk.js             # 삭제
import pool from '../server/db/connection.js';

const JUNK_CODES = ['000000', '999999'];

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL 환경변수가 필요합니다.');
        process.exit(1);
    }
    const dryRun = process.argv.slice(2).includes('--dry-run');

    console.log('⚠️  삭제는 비가역입니다. 처음에는 --dry-run으로 대상을 확인하는 것을 권장합니다.\n');

    const { rows: targets } = await pool.query(
        'SELECT code, name, market FROM stocks_directory WHERE code = ANY($1) ORDER BY code',
        [JUNK_CODES]
    );

    if (targets.length === 0) {
        console.log('✅ 삭제 대상(000000/999999) 없음. 종료.');
        await pool.end();
        return;
    }

    console.log(`📋 삭제 대상 ${targets.length}개:`);
    for (const t of targets) {
        console.log(`   - ${t.code} ${t.name || '(이름없음)'} | ${t.market}`);
    }
    console.log('');

    if (dryRun) {
        console.log('🔎 --dry-run 모드 — 실제 삭제는 하지 않았습니다. 삭제하려면 --dry-run 없이 다시 실행하세요.');
        await pool.end();
        return;
    }

    const { rowCount } = await pool.query('DELETE FROM stocks_directory WHERE code = ANY($1)', [JUNK_CODES]);
    const { rows: after } = await pool.query('SELECT COUNT(*)::int AS count FROM stocks_directory');
    console.log(`🎉 완료: ${rowCount}행 삭제. stocks_directory 총 ${after[0].count}행.`);
    await pool.end();
}

main().catch(async (e) => {
    console.error('cleanup-directory-junk failed:', e);
    process.exitCode = 1;
    await pool.end().catch(() => {});
});
