/**
 * attention 현저성 — **사건성 프록시** 검증 오케스트레이터.
 *
 * 실행:
 *   DATABASE_URL='postgres://...' node scripts/backtest/run_attention.mjs
 *
 * 산출물: scripts/backtest/out/attention_eventproxy.csv · attention_buckets.csv · attention_meta.json
 *
 * ⚠️⚠️ **target이 |forward return|이다** — 부호 있는 수익이 아니다.
 *      세션 1~3은 방향 예측을 쟀고 전부 무신호~역방향이었다. 여기서 재는 건 다른 것이다:
 *      "현저성 상위 종목이 실제로 다음 구간에 **크게 움직이는가**"(방향 무관, 사건 크기).
 *      → **양(+) IC = 좋은 결과**(트리아지 정상 작동). 세션 1~3과 정반대 해석.
 *
 * ⚠️ 부분 검증이다 — unrl(|미실현|)·stake(비중)는 사용자 포지션 의존이라 대상이 아니다.
 *    "현저성 전체"가 아니라 "**시장 관찰 컴포넌트가 사건을 잡나**"까지만 답한다.
 *
 * ⚠️ 이 러너는 **DART 유무에 robust**하다. dart_disclosures가 없거나 비어 있으면 disc 축을
 *    통째로 건너뛰고 move 단독을 1차 산출물로 낸다(중단하지 않는다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, BUCKETS } from './config.mjs';
import { loadUniverse, loadSeries, loadDisclosures, closePool } from './load.mjs';
import { attentionAt, absTarget } from './attention.mjs';
import { forwardReturn, signalIndices } from './returns.mjs';
import { computeIC, bucketStats, benjaminiHochberg, overlapLag, groupByDate } from './ic.mjs';
import { ATTENTION_CONSTANTS } from '../../server/domains/attention/score.js';

const fmt = (v, d = 4) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const pct = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);

async function run() {
    const t0 = Date.now();
    console.log('=== attention 현저성 — 사건성 프록시 검증 ===');
    console.log('⚠️ target = |forward return| (사건 크기). **양(+) IC가 좋은 결과** — 세션 1~3과 반대 해석.');
    console.log(`설정: horizons=${CONFIG.HORIZONS.join(',')} step=${CONFIG.STEP_DAYS} 창=${ATTENTION_CONSTANTS.windowTradingDays}거래일 공시룩백=${ATTENTION_CONSTANTS.discLookbackDays}일\n`);

    // ── 1. 유니버스·시계열 ───────────────────────────────────────
    const { universe, excluded } = await loadUniverse();
    console.log(`[유니버스] ${universe.length}종목 (히스토리 ≥ ${CONFIG.MIN_HISTORY}행) · 제외 ${excluded.length}종목`);
    if (universe.length === 0) { console.error('유니버스가 비었습니다 — 중단'); await closePool(); process.exit(1); }

    const { byCode, dropped, totalRows } = await loadSeries(universe.map(u => u.code));
    console.log(`[로드] ${totalRows}행 → 유효 ${totalRows - dropped}행, ${byCode.size}종목`);

    // ── 2. Step 0 게이트 — dart_disclosures 깊이 실측 ────────────
    const disc = await loadDisclosures(universe.map(u => u.code));
    printDiscGate(disc, universe.length);

    // ── 3. 신호 × |forward return| 수집 ─────────────────────────
    const maxHorizon = Math.max(...CONFIG.HORIZONS);
    const records = [];
    const drops = { horizon_beyond_series: 0, exit_price_missing: 0, entry_price_missing: 0, other: 0 };
    let signalPoints = 0, withDisc = 0;

    for (const { code } of universe) {
        const series = byCode.get(code);
        if (!series || series.length < CONFIG.MIN_WARMUP + maxHorizon + 1) continue;
        const discAsc = disc.byCode.get(code) || null;

        for (const i of signalIndices(series.length, {
            minWarmup: CONFIG.MIN_WARMUP, stepDays: CONFIG.STEP_DAYS, maxHorizon,
        })) {
            // ≤ t 접두만 넘긴다. computePriceStats는 뒤에서부터 고정 개수만 보므로
            // 접두 길이에 의존하지 않는다(테스트로 고정).
            const a = attentionAt(series.slice(0, i + 1), discAsc, series[i].date);
            signalPoints++;
            if (a.discCount > 0) withDisc++;

            const rec = {
                code, date: series[i].date,
                salience: a.salience, moveOnly: a.moveOnly, discOnly: a.discOnly,
                ret5d: a.ret5d, volSurge: a.volSurge,
                discCount: a.discCount, discLatestDaysAgo: a.discLatestDaysAgo,
                // disc가 구조적으로 0일 수밖에 없는 구간(적재 시작 전)을 표시한다 —
                // 그 구간을 섞으면 salience == moveOnly인 표본이 disc 축을 희석한다.
                discCovered: disc.available && disc.minDate != null && series[i].date >= disc.minDate,
            };

            let any = false;
            for (const n of CONFIG.HORIZONS) {
                const fr = forwardReturn(series, i, n);
                if (!fr.ok) { drops[fr.reason] = (drops[fr.reason] ?? drops.other) + 1; continue; }
                rec[`r${n}`] = fr.ret;
                rec[`a${n}`] = absTarget(fr.ret);   // ← target
                any = true;
            }
            if (any) records.push(rec);
        }
    }

    console.log(`\n[신호] ${signalPoints}개 시점 · 유효 표본 ${records.length}개`);
    console.log(`  제외: ${Object.entries(drops).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ') || '없음'}`);
    console.log(`  공시가 붙은 시점: ${withDisc} (${signalPoints ? (withDisc / signalPoints * 100).toFixed(1) : '0'}%)`);
    if (records.length === 0) { console.error('표본이 없습니다 — 중단'); await closePool(); process.exit(1); }

    const discCoveredCount = records.filter(r => r.discCovered).length;
    // disc 축을 낼지 결정 — 데이터가 없거나, 있어도 공시가 붙은 시점이 너무 적으면 내지 않는다.
    // (그 경우 disc는 사실상 상수 0이라 Rank IC가 무의미하다.)
    const discUsable = disc.available && withDisc >= CONFIG.ATTENTION_MIN_DISC_POINTS;
    if (!discUsable) {
        console.log(`\n  ⚠️ disc 축을 보고하지 않습니다 — ${!disc.available
            ? 'dart_disclosures 미적재(정상 경로)'
            : `공시가 붙은 시점 ${withDisc} < 최소 ${CONFIG.ATTENTION_MIN_DISC_POINTS}`}`);
        console.log('     → **move 단독이 1차 산출물**이 됩니다. salience는 disc=0이라 moveOnly와 동일합니다.');
    }

    // ── 4. holdout 분할 ─────────────────────────────────────────
    const dates = [...new Set(records.map(r => r.date))].sort();
    const cut = CONFIG.TEST_HOLDOUT_FROM
        || dates[Math.max(0, Math.floor(dates.length * (1 - CONFIG.HOLDOUT_FRACTION)))];
    console.log(`\n[분할] 신호일 ${dates.length}일 (${dates[0]} ~ ${dates[dates.length - 1]})`);
    console.log(`  학습 < ${cut} / 봉인(test) ≥ ${cut}`);
    console.log('  ※ 봉인 구간을 보고 상수(scoreFloor·가중치)를 고치면 오염이다.');

    // 축별로 쓰는 표본 구간이 다르다 — move는 전 구간, disc·salience는 공시 커버 구간.
    // **비교 가능성**을 위해 move도 커버 구간 버전을 함께 낸다(구간이 다르면 대소를 못 견준다).
    const scope = (axis, rows) => (axis === 'moveOnly' ? rows : rows.filter(r => r.discCovered));
    const axes = discUsable ? CONFIG.ATTENTION_AXES : ['moveOnly'];

    // ── 5. IC ───────────────────────────────────────────────────
    const icRows = [];
    for (const splitName of ['train', 'test']) {
        const base = splitName === 'train' ? records.filter(r => r.date < cut) : records.filter(r => r.date >= cut);
        for (const axis of axes) {
            for (const range of axis === 'moveOnly' && discUsable ? ['full', 'discCovered'] : ['full']) {
                const rows = range === 'discCovered' ? base.filter(r => r.discCovered) : scope(axis, base);
                for (const n of CONFIG.HORIZONS) {
                    const daily = groupByDate(rows, axis, `a${n}`);       // ← |return|
                    const res = computeIC(daily, {
                        minCrossSection: CONFIG.MIN_CROSS_SECTION,
                        lag: overlapLag(n, CONFIG.STEP_DAYS),
                        periodsPerYear: CONFIG.TRADING_DAYS_PER_YEAR / n,
                    });
                    icRows.push({
                        split: splitName, axis, range, horizon: n, target: 'absReturn',
                        dates: res.n, observations: res.obs, avgCrossSection: res.avgCrossSection ?? null,
                        meanIC: res.mean, stdIC: res.std, icirAnnual: res.icir,
                        tStat: res.tStat, tStatNW: res.tStatNW,
                        pValue: res.pValue, pValueNW: res.pValueNW,
                        overlapLag: overlapLag(n, CONFIG.STEP_DAYS),
                    });
                }
            }
        }
    }
    // BH — 학습 구간 1차 산출물만(축 × 호라이즌). 봉인·비교용 range 중복은 제외.
    const primary = icRows.filter(r => r.split === 'train' && r.range === 'full');
    const adj = benjaminiHochberg(primary.map(r => r.pValueNW ?? r.pValue));
    primary.forEach((r, k) => { r.pAdjustedBH = adj[k]; });

    // ── 6. 버킷 ─────────────────────────────────────────────────
    const bucketRows = [];
    for (const splitName of ['train', 'test']) {
        const base = splitName === 'train' ? records.filter(r => r.date < cut) : records.filter(r => r.date >= cut);
        for (const axis of axes) {
            for (const n of CONFIG.HORIZONS) {
                const obs = scope(axis, base)
                    .filter(r => Number.isFinite(r[`a${n}`]))
                    .map(r => ({ score: r[axis], ret: r[`a${n}`] }));
                for (const b of bucketStats(obs, BUCKETS[axis] || BUCKETS.salience)) {
                    bucketRows.push({ split: splitName, axis, horizon: n, target: 'absReturn', ...b });
                }
            }
        }
    }

    // ── 7. 출력 ─────────────────────────────────────────────────
    const outDir = path.resolve(process.cwd(), CONFIG.OUT_DIR);
    fs.mkdirSync(outDir, { recursive: true });
    const meta = {
        generatedAt: new Date().toISOString(),
        purpose: '사건성 프록시 — 현저성 상위가 다음 구간에 크게 움직이는가(|forward return|). 예측 검증 아님.',
        interpretation: '양(+) IC = 트리아지 정상 작동. 세션 1~3(방향 예측)과 **반대 해석**.',
        target: '|forward return| (부호 버림)',
        constants: ATTENTION_CONSTANTS,
        config: { horizons: CONFIG.HORIZONS, step: CONFIG.STEP_DAYS, minWarmup: CONFIG.MIN_WARMUP, minHistory: CONFIG.MIN_HISTORY },
        universe: { included: universe.length, excluded: excluded.length },
        sample: {
            signalPoints, records: records.length, drops,
            withDisclosures: withDisc, discCoveredRecords: discCoveredCount,
            dateFrom: dates[0], dateTo: dates[dates.length - 1], holdoutFrom: cut,
        },
        disclosures: {
            available: disc.available, reason: disc.reason, rows: disc.totalRows,
            codesWithData: disc.codesWithData, minDate: disc.minDate, maxDate: disc.maxDate,
            usableForIC: discUsable, minPointsRequired: CONFIG.ATTENTION_MIN_DISC_POINTS,
        },
        axesReported: axes,
        caveats: [
            '**부분 검증** — unrl(|미실현|)·stake(비중)는 사용자 포지션 의존이라 대상 아님. "현저성 전체"가 아니라 "시장 관찰 컴포넌트가 사건을 잡나"까지만',
            '동시대성(변동성 클러스터링)은 **여기선 바람직하다** — 지금 크게 움직인 종목이 계속 크게 움직이는 걸 잡는 게 트리아지의 목적이다. 세션 3의 "동행 위양성" 우려가 여기선 원하는 성질',
            'target이 |return|이라 부호 정보가 없다 — 이 결과는 "어느 방향으로 갈지"에 대해 **아무 말도 하지 않는다**',
            'disc 축은 dart_disclosures 커버 구간(minDate 이후)에서만 잰다. move는 전 구간 + 같은 커버 구간 둘 다 내어 비교 가능하게 했다',
            '수정주가 아님: 분할·배당이 |return|을 기계적으로 부풀린다 → 사건성 IC를 위로 편향시킬 수 있다(docs/ADR-001)',
            `중첩: 호라이즌 > 신호 간격(${CONFIG.STEP_DAYS}일)이면 forward 창이 겹친다 → Newey-West 보정 t 병기`,
        ],
        reproduce: "DATABASE_URL='...' node scripts/backtest/run_attention.mjs",
    };
    writeJson(path.join(outDir, 'attention_meta.json'), meta);
    writeCsv(path.join(outDir, 'attention_eventproxy.csv'), icRows);
    writeCsv(path.join(outDir, 'attention_buckets.csv'), bucketRows);
    writeCsv(path.join(outDir, 'attention_observations.csv'), records);

    printIcTable(icRows, discUsable);
    printBucketTable(bucketRows, axes);
    printObservationCeiling(discUsable);

    console.log(`\n[산출물] ${outDir}/attention_eventproxy.csv · attention_buckets.csv · attention_observations.csv · attention_meta.json`);
    console.log(`[소요] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await closePool();
}

function printDiscGate(disc, universeSize) {
    console.log('\n=== Step 0 게이트 — dart_disclosures 깊이 ===');
    if (!disc.available) {
        console.log(`  적재 없음 (${disc.reason === 'error' ? '테이블 부재·조회 실패' : '빈 테이블'}) — **정상 경로**입니다(DART 적재는 운영자 수동).`);
        console.log('  → disc 컴포넌트는 상시 0. move 단독으로 진행합니다.');
        return;
    }
    console.log(`  ${disc.totalRows}건 · ${disc.codesWithData}/${universeSize}종목 · ${disc.minDate} ~ ${disc.maxDate}`);
    const counts = [...disc.byCode.values()].map(v => v.length).sort((a, b) => a - b);
    const q = (p) => counts[Math.min(counts.length - 1, Math.floor(counts.length * p))];
    console.log(`  종목당 건수: 최소 ${counts[0]} · p25 ${q(0.25)} · 중앙 ${q(0.5)} · p75 ${q(0.75)} · 최대 ${counts[counts.length - 1]}`);
    console.log('  ※ 최근 편중이면 disc 프록시는 참고로만 — move 단독이 1차 산출물입니다.');
}

function printIcTable(rows, discUsable) {
    console.log('\n=== 현저성 → |forward return| Rank IC (날짜별 횡단면 → 시계열 평균) ===');
    console.log('※ **양(+)이 좋은 결과다** — 현저성 상위가 실제로 크게 움직였다는 뜻(트리아지 정상).');
    for (const split of ['train', 'test']) {
        console.log(`\n[${split === 'train' ? '학습 구간' : '봉인 구간(holdout)'}]`);
        console.log('  축         구간        N   날짜수  관측수  평균IC    표준편차  ICIR(연)  t(NW)  p(NW)   p(BH)');
        for (const r of rows.filter(x => x.split === split)) {
            console.log(
                `  ${r.axis.padEnd(10)} ${r.range.padEnd(11)} ${String(r.horizon).padStart(2)}  `
                + `${String(r.dates).padStart(5)}  ${String(r.observations).padStart(6)}  `
                + `${fmt(r.meanIC).padStart(8)}  ${fmt(r.stdIC).padStart(8)}  ${fmt(r.icirAnnual, 3).padStart(8)}  `
                + `${fmt(r.tStatNW, 2).padStart(5)}  ${fmt(r.pValueNW, 3).padStart(6)}  ${fmt(r.pAdjustedBH, 3).padStart(6)}`
            );
        }
    }
    if (!discUsable) console.log('\n  ※ disc·salience 미보고 — 공시 표본 부족. salience는 disc=0이라 moveOnly와 동일합니다.');
}

function printBucketTable(rows, axes) {
    console.log('\n=== 현저성 버킷별 |forward return| (단조 증가면 트리아지가 사건을 고른다) ===');
    for (const split of ['train', 'test']) {
        for (const axis of axes) {
            for (const n of CONFIG.HORIZONS) {
                const sub = rows.filter(r => r.split === split && r.axis === axis && r.horizon === n);
                if (!sub.some(s => s.n > 0)) continue;
                console.log(`\n[${split}] ${axis} · ${n}거래일 · target=|return|`);
                console.log('  버킷                              n      평균      중앙     p75      p95');
                for (const b of sub) {
                    console.log(`  ${b.label.padEnd(32)} ${String(b.n).padStart(6)}  ${pct(b.mean).padStart(8)}  ${pct(b.median).padStart(7)}  ${pct(b.p75).padStart(7)}  ${pct(b.p95).padStart(7)}`);
                }
            }
        }
    }
}

// 관찰-only 현저성의 **구조적 상한** — 버킷 분포를 읽을 때 필요한 맥락이다.
// noisy-OR에서 move 단독 최대는 w_move(=0.45), disc 단독 최대는 w_disc(=0.25)다.
// 즉 unrl·stake를 뺀 이 검증에서는 상위 버킷이 **원래 비어 있는 게 정상**이다.
function printObservationCeiling(discUsable) {
    const { weights, moveCapPct, scoreFloor } = ATTENTION_CONSTANTS;
    const moveMax = weights.move;
    const bothMax = 1 - (1 - weights.move) * (1 - weights.disc);
    // score = w_move · c 이므로 노출 문턱을 넘는 최소 |5거래일 수익률|
    const minMovePct = (scoreFloor / weights.move) * moveCapPct;
    console.log('\n=== 관찰-only 현저성의 구조적 상한 (버킷 해석용) ===');
    console.log(`  move 단독 최대   : ${moveMax.toFixed(2)}  (w_move)`);
    console.log(`  move+disc 최대   : ${bothMax.toFixed(2)}  (noisy-OR)`);
    console.log(`  → unrl(0.85)·stake(0.70)를 뺐으므로 상위 버킷([0.50,1.00])은 ${discUsable ? '거의' : '구조적으로'} 비어 있는 게 정상이다.`);
    console.log(`  프로덕션 노출 문턱(scoreFloor ${scoreFloor}) 환산: 공시가 없으면 |5거래일 수익률| ≥ ${minMovePct.toFixed(1)}% 여야 블록에 뜬다.`);
}

function writeCsv(file, rows) {
    if (!rows.length) { fs.writeFileSync(file, ''); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const esc = (v) => (v == null ? '' : typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
    fs.writeFileSync(file, [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
}
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

run().catch(async (e) => {
    console.error('Fatal:', e.message);
    console.error(e.stack);
    await closePool();
    process.exit(1);
});
