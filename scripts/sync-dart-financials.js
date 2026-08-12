/**
 * sync-dart-financials.js — stocks 186종목 재무제표(DART) 적재 (4.5a차).
 *
 * 대상: 최근 N개년(기본 2) × 4보고서(1Q/반기/3Q/사업). fs_div는 CFS(연결) 우선, 없으면 OFS(별도).
 * dart_corp_codes 매핑이 선행돼야 한다(sync-dart-corpcodes.js 먼저 실행).
 *
 * 사용:
 *   DART_API_KEY=... DATABASE_URL=... node scripts/sync-dart-financials.js
 *   ... --years 3                 # 최근 3개년
 *   ... --limit 5 --offset 0      # 종목 부분 배치
 *   ... --code 000220,005930      # 특정 종목만 (쉼표 구분)
 *   ... --dry-run                 # DB 미기록, 첫 종목 매핑 결과만 출력
 *                                   ※ dry-run은 유효 종목 **첫 건**에서 멈춘다. 특정 종목의
 *                                     매칭을 확인하려면 --code 로 대상을 좁혀서 함께 쓸 것.
 *   ... --save-sample             # 첫 성공 응답 원본을 scripts/.dart-sample.json 저장 후 종료
 *                                   (운영자가 실제 구조 확인 → 파서 대조·보정용. dry-run 포함)
 *
 * 주의: ESM. dotenv import 금지. 관대한 파싱 — 실패 종목/계정은 skip + 로그, 전체 중단 없음.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { withTransaction } from '../server/db/connection.js';
import { fetchFinancials, parseAmount, dartEnabled } from '../server/scrapers/dart.js';
import { matchAccount, orderBySection, REPRT_CODES } from '../server/helpers/dartAccounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FILE = path.join(__dirname, '.dart-sample.json');

function parseArgs() {
    const a = process.argv.slice(2);
    const out = { years: 2, limit: null, offset: 0, codes: null, dryRun: false, saveSample: false };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--years') out.years = parseInt(a[++i], 10);
        else if (a[i] === '--limit') out.limit = parseInt(a[++i], 10);
        else if (a[i] === '--offset') out.offset = parseInt(a[++i], 10);
        else if (a[i] === '--code') out.codes = String(a[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
        else if (a[i] === '--dry-run') out.dryRun = true;
        else if (a[i] === '--save-sample') { out.saveSample = true; out.dryRun = true; }
    }
    return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTargets() {
    // stocks ⨝ dart_corp_codes (stock_code = stocks.code). 매핑 없는 종목은 자동 제외.
    const { rows } = await pool.query(`
        SELECT s.code, s.name, d.corp_code
        FROM stocks s
        JOIN dart_corp_codes d ON d.stock_code = s.code
        ORDER BY s.code
    `);
    return rows;
}

async function main() {
    const args = parseArgs();
    if (!dartEnabled()) { console.error('DART_API_KEY 미설정 — 중단'); process.exit(1); }

    let targets = await getTargets();
    if (targets.length === 0) {
        console.error('대상 없음 — sync-dart-corpcodes.js 를 먼저 실행해 매핑을 채우세요.');
        await pool.end();
        process.exit(1);
    }
    // --code 는 offset/limit보다 먼저 — 특정 종목 하나를 dry-run으로 확인하는 용도라
    // "몇 번째에 있는지" 몰라도 되게 한다(dry-run이 첫 유효 종목에서 멈추므로 필요).
    if (args.codes) {
        const want = new Set(args.codes);
        targets = targets.filter(t => want.has(t.code));
        if (targets.length === 0) {
            console.error(`--code ${args.codes.join(',')}: 대상 없음 — stocks ⨝ dart_corp_codes 매핑을 확인하세요.`);
            await pool.end();
            process.exit(1);
        }
    }
    if (args.offset) targets = targets.slice(args.offset);
    if (args.limit) targets = targets.slice(0, args.limit);

    const curYear = new Date().getFullYear();
    const years = Array.from({ length: args.years }, (_, i) => curYear - i);
    console.log(`재무제표 적재: ${targets.length}종목 × ${years.join(',')} × ${REPRT_CODES.length}보고서 (dryRun=${args.dryRun}, saveSample=${args.saveSample})`);

    let totalRows = 0, totalSkipped = 0, i = 0;
    for (const t of targets) {
        i++;
        const rows = [];
        // canonical PK first-wins 디둡 — DART는 합계를 하위/귀속 라인보다 먼저 나열하므로
        // 최초 매칭(=합계)을 유지한다. matchAccount 정확일치와 함께 이중 방어(오값 저장 차단).
        //
        // 손익 계정이 IS·CIS 양쪽에서 잡히게 된 뒤(단일 포괄손익계산서 보고 회사 커버)로는
        // '최초'가 곧 '어느 표에서 왔는가'를 정한다 → orderBySection()으로 IS를 먼저 흘려
        // 응답 순서와 무관하게 IS 값이 남게 한다. 섹션 내부 순서는 안정 정렬로 보존된다.
        const seen = new Set();
        let matchedThisStock = 0, skippedThisStock = 0;
        for (const year of years) {
            for (const { code: reprtCode, quarter } of REPRT_CODES) {
                let res = await fetchFinancials(t.corp_code, year, reprtCode, 'CFS');
                let fsDiv = 'CFS';
                if (!res || res.list.length === 0) {
                    res = await fetchFinancials(t.corp_code, year, reprtCode, 'OFS');
                    fsDiv = 'OFS';
                }
                if (!res || res.list.length === 0) continue;

                if (args.saveSample) {
                    const payload = { meta: { code: t.code, name: t.name, year, reprtCode, fsDiv }, response: res };
                    fs.writeFileSync(SAMPLE_FILE, JSON.stringify(payload, null, 2));
                    console.log(`샘플 저장: ${SAMPLE_FILE} (${t.name} ${year} ${quarter} ${fsDiv}, list ${res.list.length}건)`);
                    console.log('운영자: 이 파일의 list[] 필드명을 확인해 dartAccounts.js 매핑을 대조하세요.');
                    await pool.end();
                    return;
                }

                for (const item of orderBySection(res.list)) {
                    const matched = matchAccount(item);
                    if (!matched) { skippedThisStock++; continue; }
                    const pk = `${year}|${quarter}|${fsDiv}|${matched.id}`;
                    if (seen.has(pk)) continue;   // 합계가 먼저 오므로 first-wins = 합계 유지
                    seen.add(pk);
                    rows.push({
                        code: t.code, year, quarter, fs_div: fsDiv,
                        account_id: matched.id,
                        account_nm: (item.account_nm || matched.label),
                        amount: parseAmount(item.thstrm_amount),
                        prev_amount: parseAmount(item.frmtrm_amount),
                    });
                    matchedThisStock++;
                }
                await sleep(80); // rate limit 여유
            }
        }

        if (!args.dryRun && rows.length > 0) {
            try {
                await withTransaction(async (client) => {
                    for (const r of rows) {
                        await client.query(`
                            INSERT INTO dart_financials (code, year, quarter, fs_div, account_id, account_nm, amount, prev_amount, updated_at)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
                            ON CONFLICT (code, year, quarter, fs_div, account_id) DO UPDATE SET
                                account_nm = EXCLUDED.account_nm,
                                amount = EXCLUDED.amount,
                                prev_amount = EXCLUDED.prev_amount,
                                updated_at = NOW()
                        `, [r.code, r.year, r.quarter, r.fs_div, r.account_id, r.account_nm, r.amount, r.prev_amount]);
                    }
                });
            } catch (e) {
                console.error(`  [${i}/${targets.length}] ${t.name} (${t.code}) DB 실패, skip:`, e.message);
                continue;
            }
        }

        totalRows += matchedThisStock;
        totalSkipped += skippedThisStock;
        console.log(`  [${i}/${targets.length}] ${t.name} (${t.code}): 매칭 ${matchedThisStock}행${args.dryRun ? ' (dry-run 미기록)' : ' 적재'} · skip ${skippedThisStock}`);

        if (args.dryRun && rows.length > 0) {
            console.log('    dry-run 매핑 예시:', JSON.stringify(rows.slice(0, 6), null, 0));
            break; // dry-run은 첫 유효 종목만
        }
    }

    console.log(`Done. 매칭 ${totalRows}행, skip ${totalSkipped}계정.`);
    await pool.end();
}

main().catch(async (e) => {
    console.error('Fatal:', e.message);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
});
