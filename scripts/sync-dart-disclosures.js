/**
 * sync-dart-disclosures.js — stocks 186종목 최근 공시 적재 (4.5a차).
 *
 * 적응형 페이징: 저장 대상(비노이즈)이 targetCount에 도달할 때까지만 페이지를 늘린다.
 * 대부분 종목은 1페이지에서 끝나고, 삼성전자처럼 소유상황보고서가 도배된 종목만 2~3페이지.
 * 노이즈(임원·주요주주 소유상황보고서 등)는 블랙리스트로 제외 — 분류 못 한 other는 저장.
 * dart_corp_codes 매핑 선행 필요.
 *
 * 사용:
 *   DART_API_KEY=... DATABASE_URL=... node scripts/sync-dart-disclosures.js
 *   ... --months 6            # 수집 기간(기본 3개월)
 *   ... --target 30           # 종목당 목표 저장 건수(기본 20)
 *   ... --max-pages 4         # 종목당 페이지 상한(기본 3)
 *   ... --limit 5 --offset 0  # 종목 부분 배치
 *   ... --dry-run             # DB 미기록, 수집·집계만 출력
 *
 * 주의: ESM. dotenv import 금지. 실패 종목은 skip + 로그, 전체 중단 없음.
 */
import pool, { withTransaction } from '../server/db/connection.js';
import { fetchDisclosurePage, fetchSignificantDisclosures, dartEnabled } from '../server/scrapers/dart.js';
import { categorizeDisclosure } from '../server/helpers/dartCategory.js';

// 조정 가능한 상수(인자로 override).
const DEFAULT_TARGET = 20;
const DEFAULT_MAX_PAGES = 3;
const PAGE_COUNT = 100;

function parseArgs() {
    const a = process.argv.slice(2);
    const out = { months: 3, limit: null, offset: 0, target: DEFAULT_TARGET, maxPages: DEFAULT_MAX_PAGES, dryRun: false };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--months') out.months = parseInt(a[++i], 10);
        else if (a[i] === '--limit') out.limit = parseInt(a[++i], 10);
        else if (a[i] === '--offset') out.offset = parseInt(a[++i], 10);
        else if (a[i] === '--target') out.target = parseInt(a[++i], 10);
        else if (a[i] === '--max-pages') out.maxPages = parseInt(a[++i], 10);
        else if (a[i] === '--dry-run') out.dryRun = true;
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
    console.log(`공시 적재: ${targets.length}종목, ${bgnDe}~${endDe} (target=${args.target}, maxPages=${args.maxPages}, dryRun=${args.dryRun})`);

    let totalStored = 0, totalNoise = 0, totalRequests = 0, i = 0;
    for (const t of targets) {
        i++;

        // 사전 점검: 첫 종목 raw 응답에 여러 종목이 섞이면 corp_code 필터 미동작 →
        // 186종목 오적재 방지 위해 즉시 중단. (빈 stock_code는 corp_code 신뢰로 무시)
        if (i === 1) {
            const probe = await fetchDisclosurePage(t.corp_code, bgnDe, endDe, 1, PAGE_COUNT); // 필터 없이 raw
            totalRequests++;
            if (probe && probe.list.length) {
                const uniq = [...new Set(probe.list.map(x => String(x.stock_code || '').trim()).filter(Boolean))];
                if (uniq.length > 1) {
                    console.error(`[중단] 첫 종목(${t.code}) 응답에 ${uniq.length}개 종목 혼입: ${uniq.slice(0, 8).join(',')} — corp_code 필터 미동작. 오적재 방지 위해 중단.`);
                    await pool.end();
                    process.exit(1);
                }
                console.log(`[사전점검] 첫 종목 응답 종목 다양성 OK (unique=${uniq.length}: ${uniq.join(',') || '(stock_code 빈값)'})`);
            }
            await sleep(300);
        }

        let result;
        try {
            result = await fetchSignificantDisclosures(t.corp_code, t.code, bgnDe, endDe, {
                targetCount: args.target, maxPages: args.maxPages, pageCount: PAGE_COUNT,
            });
        } catch (e) {
            console.error(`  [${i}/${targets.length}] ${t.name} (${t.code}) 조회 실패, skip:`, e.message);
            await sleep(300);
            continue;
        }
        if (result === null) { console.error(`  [${i}/${targets.length}] ${t.name} (${t.code}) 조회 실패(null), skip`); await sleep(300); continue; }

        const { items, noiseExcluded, pagesQueried } = result;
        totalRequests += pagesQueried;
        totalNoise += noiseExcluded;

        if (items.length > 0 && !args.dryRun) {
            try {
                await withTransaction(async (client) => {
                    for (const it of items) {
                        const reportNm = String(it.report_nm || '').trim();   // 꼬리 공백 정리
                        const { category } = categorizeDisclosure(reportNm);
                        await client.query(`
                            INSERT INTO dart_disclosures (rcept_no, code, corp_name, report_nm, rcept_dt, flr_nm, category, rm, corp_cls, created_at)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
                            ON CONFLICT (rcept_no) DO UPDATE SET
                                report_nm = EXCLUDED.report_nm,
                                rcept_dt = EXCLUDED.rcept_dt,
                                flr_nm = EXCLUDED.flr_nm,
                                category = EXCLUDED.category,
                                rm = EXCLUDED.rm,
                                corp_cls = EXCLUDED.corp_cls
                        `, [
                            String(it.rcept_no), t.code, it.corp_name || t.name,
                            reportNm, String(it.rcept_dt || '').trim(),
                            it.flr_nm || null, category,
                            (it.rm ? String(it.rm).trim() : null),
                            (it.corp_cls ? String(it.corp_cls).trim() : null),
                        ]);
                    }
                });
            } catch (e) {
                console.error(`  [${i}/${targets.length}] ${t.name} (${t.code}) DB 실패, skip:`, e.message);
                await sleep(300);
                continue;
            }
        }
        totalStored += items.length;
        console.log(`  [${i}/${targets.length}] ${t.code} ${t.name}: 저장 ${items.length}건 (${pagesQueried}페이지 조회, 노이즈 ${noiseExcluded} 제외)${args.dryRun ? ' [dry-run]' : ''}`);
        await sleep(300);
    }

    console.log(`완료: ${targets.length}종목, 저장 ${totalStored.toLocaleString()}건, 노이즈 제외 ${totalNoise.toLocaleString()}건, 총 요청 ${totalRequests.toLocaleString()}회${args.dryRun ? ' (dry-run, 미기록)' : ''}`);
    await pool.end();
}

main().catch(async (e) => {
    console.error('Fatal:', e.message);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
});
