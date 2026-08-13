/**
 * Phase 4 세션 1 — 백테스팅 하네스 오케스트레이터.
 *
 * 실행:
 *   DATABASE_URL='postgres://...' node scripts/backtest/run.mjs
 *
 * 산출물: scripts/backtest/out/*.csv, *.json (gitignore) + stdout 요약표.
 *
 * ⚠️ 프레이밍 — 이건 **내부 임계값 보정용**이다. "오르는 확률"이 아니고, 결과는 내부 문서에만.
 * ⚠️ 세션1 범위 — 기술(0~3)·추세(0~2) **두 축만**. 밸류·수급은 point-in-time 재구성이
 *    불가능해 공란이다(밸류는 stocks 현재 스냅샷 = look-ahead, 수급은 investor_history가
 *    2026-03-18부터 ~5개월뿐). 두 축을 합쳐 하나의 IC로 보고하지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, BUCKETS } from './config.mjs';
import { loadUniverse, loadSeries, loadBenchmark, closePool } from './load.mjs';
import { signalsAt } from './signals.mjs';
import { forwardReturn, excessReturn, signalIndices } from './returns.mjs';
import { computeIC, bucketStats, benjaminiHochberg, overlapLag, groupByDate } from './ic.mjs';

const AXES = [...CONFIG.AXES, 'partialSum'];   // partialSum은 참고 라벨로만 붙는다
const fmt = (v, d = 4) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const pct = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);

function main() {
    return run().catch(async (e) => {
        console.error('Fatal:', e.message);
        console.error(e.stack);
        await closePool();
        process.exit(1);
    });
}

async function run() {
    const t0 = Date.now();
    console.log('=== Phase 4 세션 1 — 백테스팅 하네스 ===');
    console.log(`설정: horizons=${CONFIG.HORIZONS.join(',')} step=${CONFIG.STEP_DAYS} warmup=${CONFIG.MIN_WARMUP} minHistory=${CONFIG.MIN_HISTORY}`);

    // ── 1. 유니버스 ──────────────────────────────────────────────
    const { universe, excluded } = await loadUniverse();
    console.log(`\n[유니버스] ${universe.length}종목 (히스토리 ≥ ${CONFIG.MIN_HISTORY}행) · 제외 ${excluded.length}종목`);
    if (excluded.length) {
        console.log(`  제외(행수): ${excluded.slice(0, 15).map(e => `${e.code}:${e.rows}`).join(' ')}${excluded.length > 15 ? ' …' : ''}`);
    }
    if (universe.length === 0) { console.error('유니버스가 비었습니다 — 중단'); await closePool(); process.exit(1); }

    const { byCode, dropped, totalRows } = await loadSeries(universe.map(u => u.code));
    console.log(`[로드] ${totalRows}행 → 유효 ${totalRows - dropped}행 (가격 결측·0 제외 ${dropped}행), ${byCode.size}종목`);

    const bench = await loadBenchmark(CONFIG.BENCHMARK);
    console.log(`[벤치마크] ${CONFIG.BENCHMARK}: ${bench ? `${bench.size}일 적재 — 초과수익 IC 포함` : '미적재 — 초과수익 IC 생략'}`);

    // ── 2. 신호 × forward return 수집 ────────────────────────────
    const maxHorizon = Math.max(...CONFIG.HORIZONS);
    const records = [];      // { code, date, technical, trend, partialSum, r5, r20, r60, x5, x20, x60 }
    const drops = { horizon_beyond_series: 0, exit_price_missing: 0, entry_price_missing: 0, other: 0 };
    let signalPoints = 0;

    for (const { code } of universe) {
        const series = byCode.get(code);
        if (!series || series.length < CONFIG.MIN_WARMUP + maxHorizon + 1) continue;

        for (const i of signalIndices(series.length, {
            minWarmup: CONFIG.MIN_WARMUP, stepDays: CONFIG.STEP_DAYS, maxHorizon,
        })) {
            const sig = signalsAt(series, i);           // ← series[0..i] 만 본다
            signalPoints++;
            const rec = { code, date: series[i].date, technical: sig.technical, trend: sig.trend, partialSum: sig.partialSum };
            let any = false;
            for (const n of CONFIG.HORIZONS) {
                const fr = forwardReturn(series, i, n);
                if (!fr.ok) { drops[fr.reason] = (drops[fr.reason] ?? drops.other) + 1; continue; }
                rec[`r${n}`] = fr.ret;
                any = true;
                if (bench) {
                    const ex = excessReturn(fr.ret, fr.entryDate, fr.exitDate, bench);
                    if (ex.ok) rec[`x${n}`] = ex.excess;
                }
            }
            if (any) records.push(rec);
        }
    }
    console.log(`[신호] ${signalPoints}개 시점 · 유효 표본 ${records.length}개`);
    console.log(`  제외: ${Object.entries(drops).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ') || '없음'}`);
    if (records.length === 0) { console.error('표본이 없습니다 — 중단'); await closePool(); process.exit(1); }

    // ── 3. sacred holdout 분할 (§4-4) ────────────────────────────
    const dates = [...new Set(records.map(r => r.date))].sort();
    const cut = CONFIG.TEST_HOLDOUT_FROM
        || dates[Math.max(0, Math.floor(dates.length * (1 - CONFIG.HOLDOUT_FRACTION)))];
    const splits = {
        train: records.filter(r => r.date < cut),
        test: records.filter(r => r.date >= cut),
        all: records,
    };
    console.log(`\n[분할] 신호일 ${dates.length}일 (${dates[0]} ~ ${dates[dates.length - 1]})`);
    console.log(`  학습 < ${cut} : ${splits.train.length}표본 / 봉인(test) ≥ ${cut} : ${splits.test.length}표본`);
    console.log('  ※ 봉인 구간은 상수 조정에 쓰지 않는다. 여기서 값을 보고 기준을 고치면 오염이다(§4-4).');

    // ── 4. 축별 IC ───────────────────────────────────────────────
    const icRows = [];
    for (const splitName of ['train', 'test', 'all']) {
        for (const axis of AXES) {
            for (const n of CONFIG.HORIZONS) {
                for (const retKey of bench ? [`r${n}`, `x${n}`] : [`r${n}`]) {
                    const daily = groupByDate(splits[splitName], axis, retKey);
                    const res = computeIC(daily, {
                        minCrossSection: CONFIG.MIN_CROSS_SECTION,
                        lag: overlapLag(n, CONFIG.STEP_DAYS),
                        periodsPerYear: CONFIG.TRADING_DAYS_PER_YEAR / n,
                    });
                    icRows.push({
                        split: splitName, axis, horizon: n,
                        returnType: retKey.startsWith('x') ? 'excess' : 'raw',
                        dates: res.n, observations: res.obs,
                        avgCrossSection: res.avgCrossSection ?? null,
                        meanIC: res.mean, stdIC: res.std, icirAnnual: res.icir,
                        tStat: res.tStat, tStatNW: res.tStatNW,
                        pValue: res.pValue, pValueNW: res.pValueNW,
                        overlapLag: overlapLag(n, CONFIG.STEP_DAYS),
                    });
                }
            }
        }
    }
    // BH 보정 — **1차 산출물인 두 축 × 3 호라이즌 × raw**만 대상(참고용 partialSum·초과수익은 제외).
    const primary = icRows.filter(r => r.split === 'train' && r.returnType === 'raw' && CONFIG.AXES.includes(r.axis));
    const adj = benjaminiHochberg(primary.map(r => r.pValueNW ?? r.pValue));
    primary.forEach((r, k) => { r.pAdjustedBH = adj[k]; });

    // ── 5. 버킷 ──────────────────────────────────────────────────
    const bucketRows = [];
    for (const splitName of ['train', 'test']) {
        for (const axis of AXES) {
            for (const n of CONFIG.HORIZONS) {
                const obs = splits[splitName]
                    .filter(r => Number.isFinite(r[`r${n}`]))
                    .map(r => ({ score: r[axis], ret: r[`r${n}`] }));
                for (const b of bucketStats(obs, BUCKETS[axis])) {
                    bucketRows.push({ split: splitName, axis, horizon: n, ...b });
                }
            }
        }
    }

    // ── 6. 출력 ──────────────────────────────────────────────────
    const outDir = path.resolve(process.cwd(), CONFIG.OUT_DIR);
    fs.mkdirSync(outDir, { recursive: true });
    const meta = {
        generatedAt: new Date().toISOString(),
        config: CONFIG,
        universe: { included: universe.length, excluded: excluded.length, minHistory: CONFIG.MIN_HISTORY },
        sample: { signalPoints, records: records.length, drops, dateFrom: dates[0], dateTo: dates[dates.length - 1], holdoutFrom: cut },
        benchmark: bench ? { symbol: CONFIG.BENCHMARK, days: bench.size } : null,
        axesNotMeasured: {
            valuation: '미검증(데이터 미비) — calculateValuationScore가 stocks 현재 스냅샷 PER/PBR/ROE + peer 현재 중앙값을 써서 과거 시점 재구성 시 look-ahead',
            supplyDemand: '미검증(데이터 미비) — investor_history가 2026-03-18부터 ~5개월(600행 이상 종목 0)',
        },
        caveats: [
            '수정주가 아님: stock_history.price는 액면분할·배당 미조정(INTEGER) → 개별 종목 forward return 왜곡 가능',
            '중첩: 신호일 간격보다 긴 호라이즌은 forward 창이 겹친다 → Newey-West 보정 t를 함께 보고(overlapLag 열)',
            '다중검정: 축 2 × 호라이즌 3 = 6검정 → BH 보정 p를 원 p와 함께 보고',
            'partialSum(기술+추세, 0~5)은 **부분 점수**다 — 밸류·수급이 빠져 있어 MarketOpinion 7/4 컷 검증이 아니다',
            'p값은 표본 날짜 수가 커 정규 근사(t분포 아님)',
            `표본은 ${universe.length}종목·${dates[0]}~${dates[dates.length - 1]} — 일반화 한계`,
        ],
        reproduce: "DATABASE_URL='...' node scripts/backtest/run.mjs   (설정은 scripts/backtest/config.mjs 고정)",
    };
    writeJson(path.join(outDir, 'meta.json'), meta);
    writeCsv(path.join(outDir, 'ic.csv'), icRows);
    writeCsv(path.join(outDir, 'buckets.csv'), bucketRows);
    writeCsv(path.join(outDir, 'observations.csv'), records);
    writeJson(path.join(outDir, 'ic.json'), icRows);

    printIcTable(icRows);
    printBucketTable(bucketRows);
    printAxisGaps();

    console.log(`\n[산출물] ${outDir}/ic.csv · buckets.csv · observations.csv · ic.json · meta.json`);
    console.log(`[소요] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await closePool();
}

function printIcTable(rows) {
    console.log('\n=== 축별 Rank IC (날짜별 횡단면 → 시계열 평균) ===');
    for (const split of ['train', 'test']) {
        console.log(`\n[${split === 'train' ? '학습 구간' : '봉인 구간(holdout)'}]`);
        console.log('  축          N   수익  날짜수  관측수  평균IC    표준편차  ICIR(연)  t      t(NW)  p(NW)   p(BH)');
        for (const r of rows.filter(x => x.split === split)) {
            const isPrimary = CONFIG.AXES.includes(r.axis);
            console.log(
                `  ${(r.axis + (isPrimary ? '' : '*')).padEnd(11)} ${String(r.horizon).padStart(2)}  ${r.returnType === 'raw' ? '원  ' : '초과'}  `
                + `${String(r.dates).padStart(5)}  ${String(r.observations).padStart(6)}  `
                + `${fmt(r.meanIC).padStart(8)}  ${fmt(r.stdIC).padStart(8)}  ${fmt(r.icirAnnual, 3).padStart(8)}  `
                + `${fmt(r.tStat, 2).padStart(5)}  ${fmt(r.tStatNW, 2).padStart(5)}  ${fmt(r.pValueNW, 3).padStart(6)}  ${fmt(r.pAdjustedBH, 3).padStart(6)}`
            );
        }
    }
    console.log('\n  * partialSum = 기술+추세 부분합. 밸류·수급이 빠진 **부분 점수**라 7/4 컷 검증이 아니다.');
    console.log('  ICIR(연) = (평균IC / 표준편차) × √(252/N). t(NW) = Newey-West 중첩 보정. p(BH) = 6검정 다중검정 보정.');
}

function printBucketTable(rows) {
    console.log('\n=== 버킷별 forward return (단조성 점검 — 필요조건일 뿐, 컷 판정 아님) ===');
    for (const split of ['train', 'test']) {
        for (const axis of AXES) {
            for (const n of CONFIG.HORIZONS) {
                const sub = rows.filter(r => r.split === split && r.axis === axis && r.horizon === n);
                if (!sub.some(s => s.n > 0)) continue;
                console.log(`\n[${split}] ${axis} · ${n}거래일`);
                console.log('  버킷                              n      평균      중앙     p25      p75      승률');
                for (const b of sub) {
                    console.log(`  ${b.label.padEnd(32)} ${String(b.n).padStart(6)}  ${pct(b.mean).padStart(8)}  ${pct(b.median).padStart(7)}  ${pct(b.p25).padStart(7)}  ${pct(b.p75).padStart(7)}  ${pct(b.winRate, 1).padStart(6)}`);
                }
            }
        }
    }
}

function printAxisGaps() {
    console.log('\n=== 미검증 축 (데이터 미비 — 공란) ===');
    console.log('  밸류(0~3)  : 미검증 — calculateValuationScore가 stocks 현재 스냅샷 + peer 현재 중앙값 → 과거 시점은 look-ahead');
    console.log('  수급(0~2)  : 미검증 — investor_history 2026-03-18~ (약 5개월). 과거 t에 데이터 자체가 없음');
    console.log('  → MarketOpinion 10점의 절반(5점)만 재구성됐다. 7/4 컷은 이 세션에서 판정하지 않는다.');
}

function writeCsv(file, rows) {
    if (!rows.length) { fs.writeFileSync(file, ''); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const esc = (v) => (v == null ? '' : typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
    fs.writeFileSync(file, [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
}
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

main();
