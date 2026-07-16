#!/usr/bin/env node
// 상장폐지/거래정지 정황 종목 정리 스크립트 (3.12차 TASK 1).
//
// 삭제 대상 판정 (자동 탐지):
//   - stock_history 최신일이 오늘로부터 10일 초과 (signals.js P2 stale 가드와 동일 임계)
//   - 또는 stocks.price IS NULL
// 명시 코드를 인자로 주면 자동 탐지 대신 해당 코드만 대상으로 한다.
//
// ⚠️ 삭제는 비가역이다. 반드시 먼저 --dry-run으로 후보를 확인하라.
//
// 사용법 (DATABASE_URL은 CLI 주입, dotenv 의존성 없음):
//   DATABASE_URL=postgres://... node scripts/cleanup-delisted.js --dry-run   # 후보만 확인
//   DATABASE_URL=postgres://... node scripts/cleanup-delisted.js             # 자동 탐지 삭제
//   DATABASE_URL=postgres://... node scripts/cleanup-delisted.js 042670      # 특정 코드 삭제
//   DATABASE_URL=postgres://... node scripts/cleanup-delisted.js 042670 --dry-run
import pool, { withTransaction } from '../server/db/connection.js';

const STALE_DAYS = 10; // signals.js P2 가드와 동일

function daysSince(yyyymmdd) {
    if (!yyyymmdd || yyyymmdd.length !== 8) return Infinity;
    const iso = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL 환경변수가 필요합니다.');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const explicitCodes = args.filter(a => !a.startsWith('--'));

    console.log('⚠️  삭제는 비가역입니다. 처음에는 --dry-run으로 후보를 확인하는 것을 권장합니다.\n');

    // 현재 종목별 최신 history 날짜 + price 조회
    const { rows } = await pool.query(`
        SELECT s.code, s.name, s.price, h.latest_date
        FROM stocks s
        LEFT JOIN LATERAL (
            SELECT MAX(date) AS latest_date FROM stock_history WHERE code = s.code
        ) h ON true
        ORDER BY s.code
    `);

    let targets;
    if (explicitCodes.length > 0) {
        const set = new Set(explicitCodes);
        targets = rows.filter(r => set.has(r.code));
        const missing = explicitCodes.filter(c => !rows.some(r => r.code === c));
        if (missing.length) console.log(`ℹ️  stocks 테이블에 없는 코드(무시): ${missing.join(', ')}\n`);
    } else {
        // 자동 탐지: price null 또는 최신 history 10일 초과
        targets = rows.filter(r => {
            const stale = r.latest_date ? daysSince(r.latest_date) > STALE_DAYS : true;
            return r.price === null || stale;
        });
    }

    if (targets.length === 0) {
        console.log('✅ 삭제 대상 종목이 없습니다. 종료.');
        await pool.end();
        return;
    }

    console.log(`📋 삭제 대상 ${targets.length}개:`);
    for (const t of targets) {
        const age = t.latest_date ? `${daysSince(t.latest_date)}일 전(${t.latest_date})` : 'history 없음';
        console.log(`   - ${t.code} ${t.name || '(이름없음)'} | price=${t.price ?? 'NULL'} | 최신 ${age}`);
    }
    console.log('');

    if (dryRun) {
        console.log('🔎 --dry-run 모드 — 실제 삭제는 하지 않았습니다. 삭제하려면 --dry-run 없이 다시 실행하세요.');
        await pool.end();
        return;
    }

    const before = rows.length;
    let deleted = 0;
    for (const t of targets) {
        try {
            await withTransaction(async (client) => {
                await client.query('DELETE FROM stock_history   WHERE code = $1', [t.code]);
                await client.query('DELETE FROM investor_history WHERE code = $1', [t.code]);
                await client.query('DELETE FROM stocks           WHERE code = $1', [t.code]); // FK CASCADE로 holding/watchlist/alerts 정리
            });
            console.log(`🗑️  삭제 완료: ${t.code} ${t.name || ''}`);
            deleted++;
        } catch (e) {
            console.error(`❌ ${t.code} 삭제 실패: ${e.message}`);
        }
    }

    const { rows: after } = await pool.query('SELECT COUNT(*)::int AS count FROM stocks');
    console.log(`\n🎉 완료: ${deleted}개 삭제. 종목 수 ${before} → ${after[0].count}`);
    console.log('ℹ️  data.js의 majorStocks 큐레이션에 남아 있으면 서버 재시작 시 다시 시드될 수 있으니, 코드에서도 제거했는지 확인하세요.');
    await pool.end();
}

main().catch(async (e) => {
    console.error('cleanup-delisted failed:', e);
    process.exitCode = 1;
    await pool.end().catch(() => {});
});
