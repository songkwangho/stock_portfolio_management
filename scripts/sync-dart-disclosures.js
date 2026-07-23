/**
 * sync-dart-disclosures.js — stocks 186종목 최근 공시 적재 (4.5a차).
 *
 * 최근 N개월(기본 3) 공시를 종목별로 수집해 규칙 기반 카테고리와 함께 저장. 일 1회 갱신 대상.
 * dart_corp_codes 매핑 선행 필요.
 *
 * 사용:
 *   DART_API_KEY=... DATABASE_URL=... node scripts/sync-dart-disclosures.js
 *   ... --months 6
 *   ... --limit 5 --offset 0
 *
 * 주의: ESM. dotenv import 금지. 실패 종목은 skip + 로그, 전체 중단 없음.
 */
import pool, { withTransaction } from '../server/db/connection.js';
import { fetchDisclosures, dartEnabled } from '../server/scrapers/dart.js';
import { categorizeDisclosure } from '../server/helpers/dartCategory.js';

function parseArgs() {
    const a = process.argv.slice(2);
    const out = { months: 3, limit: null, offset: 0 };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--months') out.months = parseInt(a[++i], 10);
        else if (a[i] === '--limit') out.limit = parseInt(a[++i], 10);
        else if (a[i] === '--offset') out.offset = parseInt(a[++i], 10);
    }
    return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

async function main() {
    const args = parseArgs();
    if (!dartEnabled()) { console.error('DART_API_KEY 미설정 — 중단'); process.exit(1); }

    const { rows: allTargets } = await pool.query(`
        SELECT s.code, s.name, d.corp_code
        FROM stocks s
        JOIN dart_corp_codes d ON d.stock_code = s.code
        ORDER BY s.code
    `);
    let targets = allTargets;
    if (targets.length === 0) {
        console.error('대상 없음 — sync-dart-corpcodes.js 를 먼저 실행하세요.');
        await pool.end();
        process.exit(1);
    }
    if (args.offset) targets = targets.slice(args.offset);
    if (args.limit) targets = targets.slice(0, args.limit);

    const endDe = ymd(new Date());
    const bgn = new Date();
    bgn.setMonth(bgn.getMonth() - args.months);
    const bgnDe = ymd(bgn);
    console.log(`공시 적재: ${targets.length}종목, ${bgnDe}~${endDe}`);

    let total = 0, i = 0;
    for (const t of targets) {
        i++;
        let items;
        try {
            items = await fetchDisclosures(t.corp_code, bgnDe, endDe);
        } catch (e) {
            console.error(`  [${i}/${targets.length}] ${t.name} (${t.code}) 조회 실패, skip:`, e.message);
            await sleep(120);
            continue;
        }
        if (items === null) { console.error(`  [${i}/${targets.length}] ${t.name} (${t.code}) 조회 실패(null), skip`); await sleep(120); continue; }

        if (items.length > 0) {
            try {
                await withTransaction(async (client) => {
                    for (const it of items) {
                        const { category } = categorizeDisclosure(it.report_nm);
                        await client.query(`
                            INSERT INTO dart_disclosures (rcept_no, code, corp_name, report_nm, rcept_dt, flr_nm, category, created_at)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                            ON CONFLICT (rcept_no) DO UPDATE SET
                                report_nm = EXCLUDED.report_nm,
                                rcept_dt = EXCLUDED.rcept_dt,
                                flr_nm = EXCLUDED.flr_nm,
                                category = EXCLUDED.category
                        `, [
                            String(it.rcept_no), t.code, it.corp_name || t.name,
                            String(it.report_nm || '').trim(), String(it.rcept_dt || '').trim(),
                            it.flr_nm || null, category,
                        ]);
                    }
                });
                total += items.length;
            } catch (e) {
                console.error(`  [${i}/${targets.length}] ${t.name} (${t.code}) DB 실패, skip:`, e.message);
                await sleep(120);
                continue;
            }
        }
        console.log(`  [${i}/${targets.length}] ${t.name} (${t.code}): ${items.length}건`);
        await sleep(120);
    }
    console.log(`Done. 공시 ${total}건 upsert.`);
    await pool.end();
}

main().catch(async (e) => {
    console.error('Fatal:', e.message);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
});
