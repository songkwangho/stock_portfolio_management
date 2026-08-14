/**
 * backfill-investor-history.js — 종목별 투자자 순매매 3년치 적재 (Phase 4 세션 3).
 *
 * 사용 예:
 *   DATABASE_URL=postgres://... node scripts/backfill-investor-history.js
 *   DATABASE_URL=postgres://... node scripts/backfill-investor-history.js --days 1095 --resume
 *   DATABASE_URL=postgres://... node scripts/backfill-investor-history.js --limit 30 --offset 0
 *   DATABASE_URL=postgres://... node scripts/backfill-investor-history.js --dry-run --limit 2
 *
 * 왜 KRX가 아니라 네이버인가 — server/scrapers/naverInvestor.js 상단 주석 참조.
 * 요약: Step 0 프로브 실측으로 KRX Open API엔 투자자별 데이터가 없고, MDC는 2026년
 *       회원체계 변경으로 본인인증 로그인이 필요해 키만으로는 열리지 않는다.
 *
 * 설계:
 * - 유니버스는 `stock_history` ≥600행 종목 우선(백테스트 유니버스와 일치 — 없는 종목을
 *   채워봐야 point-in-time 재구성이 안 된다).
 * - 종목당 ~37페이지 × 300ms ≈ 11초. 178종목 ≈ 35분.
 * - 체크포인트 `scripts/.backfill-investor-state.json` — 실패 시 `--resume`으로 이어받기.
 * - upsert(ON CONFLICT DO UPDATE) 멱등. 종목 단위 트랜잭션.
 *
 * ⚠️ individual 컬럼은 NULL로 넣는다 — 네이버 frgn 페이지에 **개인 순매매 컬럼이 없다**.
 *    (기존 라이브 스크래퍼는 '외국인 보유주수'를 individual로 잘못 넣고 있다. 그 값을
 *     복제하느니 비워 둔다. 수급 채점은 institution·foreign_net만 쓰므로 영향 없음.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../server/db/connection.js';
import { fetchInvestorHistory } from '../server/scrapers/naverInvestor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '.backfill-investor-state.json');

function parseArgs() {
    const a = process.argv.slice(2);
    const out = { days: 365 * 3, resume: false, limit: null, offset: 0, delayMs: 300, dryRun: false, minHistory: 600 };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--days') out.days = parseInt(a[++i], 10);
        else if (a[i] === '--resume') out.resume = true;
        else if (a[i] === '--limit') out.limit = parseInt(a[++i], 10);
        else if (a[i] === '--offset') out.offset = parseInt(a[++i], 10);
        else if (a[i] === '--delay') out.delayMs = parseInt(a[++i], 10);
        else if (a[i] === '--min-history') out.minHistory = parseInt(a[++i], 10);
        else if (a[i] === '--dry-run') out.dryRun = true;
    }
    return out;
}

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return { completed: [] }; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

function fromDateOf(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
    const args = parseArgs();
    const fromDate = fromDateOf(args.days);
    const state = args.resume ? loadState() : { completed: [] };
    const completed = new Set(state.completed);

    console.log('=== 투자자 순매매 backfill (Phase 4 세션 3) ===');
    console.log(`소스: 네이버 frgn.naver 페이지네이션 · 목표 시작일 ${fromDate} (${args.days}일)`);
    if (args.dryRun) console.log('⚠️ --dry-run — DB에 쓰지 않습니다\n');

    // 백테스트 유니버스와 동일 기준(≥minHistory행)으로 우선순위를 맞춘다.
    const { rows: universe } = await pool.query(
        `SELECT h.code, COUNT(*)::int AS rows
         FROM stock_history h GROUP BY h.code
         HAVING COUNT(*) >= $1
         ORDER BY h.code`,
        [args.minHistory]
    );
    let targets = universe.map(r => r.code).filter(c => !completed.has(c));
    if (args.offset) targets = targets.slice(args.offset);
    if (args.limit) targets = targets.slice(0, args.limit);

    console.log(`유니버스 ${universe.length}종목 (stock_history ≥${args.minHistory}행) · 이번 실행 대상 ${targets.length}종목`);
    if (completed.size) console.log(`체크포인트 완료분 ${completed.size}종목 건너뜀`);
    console.log(`예상 소요 ≈ ${Math.round(targets.length * 37 * args.delayMs / 1000 / 60)}분\n`);

    let totalRows = 0, failed = 0;
    for (let k = 0; k < targets.length; k++) {
        const code = targets[k];
        const t0 = Date.now();
        try {
            const { rows, pagesRead } = await fetchInvestorHistory(code, {
                maxPages: Math.ceil(args.days / 30) + 5,   // 1페이지 ≈ 20거래일 ≈ 28캘린더일
                fromDate, delayMs: args.delayMs,
            });

            if (rows.length === 0) {
                failed++;
                console.log(`  [${k + 1}/${targets.length}] ${code} — 0행 (페이지 ${pagesRead}) ✗`);
                continue;
            }

            if (!args.dryRun) {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    for (const r of rows) {
                        await client.query(
                            `INSERT INTO investor_history (code, date, institution, foreign_net, individual)
                             VALUES ($1, $2, $3, $4, NULL)
                             ON CONFLICT (code, date) DO UPDATE SET
                                institution = EXCLUDED.institution,
                                foreign_net = EXCLUDED.foreign_net`,
                            [code, r.date, r.institution, r.foreign_net]
                        );
                    }
                    await client.query('COMMIT');
                } catch (e) {
                    await client.query('ROLLBACK').catch(() => {});
                    throw e;
                } finally {
                    client.release();
                }
            }

            totalRows += rows.length;
            completed.add(code);
            if (!args.dryRun) saveState({ completed: [...completed] });
            console.log(`  [${k + 1}/${targets.length}] ${code} — ${rows.length}행 (${rows[0].date}~${rows[rows.length - 1].date}, 페이지 ${pagesRead}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        } catch (e) {
            failed++;
            console.log(`  [${k + 1}/${targets.length}] ${code} — 실패: ${e.message}`);
        }
    }

    console.log(`\n완료: ${totalRows}행 적재 · 실패 ${failed}종목`);
    console.log('검증: SELECT code, COUNT(*) FROM investor_history GROUP BY code HAVING COUNT(*) < 600;');
    await pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
