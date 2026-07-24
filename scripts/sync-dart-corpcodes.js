/**
 * sync-dart-corpcodes.js — DART 전 상장사 corp_code ↔ stock_code 매핑 적재 (4.5a차).
 *
 * DART API는 종목코드(6자리)가 아닌 기업 고유번호(corp_code, 8자리) 기반이라
 * 재무제표·공시 조회 전에 매핑 테이블을 먼저 채워야 한다. 약 10만 건, 월 1회 수준 갱신.
 *
 * 사용:
 *   DART_API_KEY=... DATABASE_URL=postgres://... node scripts/sync-dart-corpcodes.js
 *   ... --dry-run   # 다운로드·파싱만 하고 건수 보고, DB 미기록
 *
 * 주의: ESM. dotenv import 금지(이전 이슈) — 환경변수는 쉘에서 export.
 */
import pool, { withTransaction } from '../server/db/connection.js';
import { fetchCorpCodes, dartEnabled } from '../server/scrapers/dart.js';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    if (!dartEnabled()) {
        console.error('DART_API_KEY 미설정 — 중단 (쉘에서 export 후 재실행)');
        process.exit(1);
    }
    console.log('corpCode 매핑 다운로드 중...');
    const list = await fetchCorpCodes();
    if (!list) {
        console.error('corpCode 조회 실패 (키/네트워크/응답 확인)');
        await pool.end();
        process.exit(1);
    }
    const listed = list.filter(c => c.stock_code).length;
    console.log(`파싱 완료: 전체 ${list.length}건 (상장 ${listed}건).${dryRun ? ' [dry-run] DB 미기록, 종료.' : ' 적재 시작...'}`);
    if (dryRun) {
        console.log('샘플 3건:', JSON.stringify(list.slice(0, 3)));
        await pool.end();
        return;
    }

    const CHUNK = 1000;
    let n = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
        const chunk = list.slice(i, i + CHUNK);
        await withTransaction(async (client) => {
            for (const c of chunk) {
                await client.query(`
                    INSERT INTO dart_corp_codes (corp_code, stock_code, corp_name, modify_date, updated_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (corp_code) DO UPDATE SET
                        stock_code = EXCLUDED.stock_code,
                        corp_name = EXCLUDED.corp_name,
                        modify_date = EXCLUDED.modify_date,
                        updated_at = NOW()
                `, [c.corp_code, c.stock_code, c.corp_name, c.modify_date]);
            }
        });
        n += chunk.length;
        if (n % 10000 === 0 || n === list.length) console.log(`  ${n}/${list.length}`);
    }
    console.log(`Done. ${n}건 upsert (상장 매핑 ${listed}건).`);
    await pool.end();
}

main().catch(async (e) => {
    console.error('Fatal:', e.message);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
});
