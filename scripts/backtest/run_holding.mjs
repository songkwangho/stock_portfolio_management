/**
 * Phase 4 세션 2 — HoldingOpinion 백테스트 오케스트레이터.
 *
 * 실행:
 *   DATABASE_URL='postgres://...' node scripts/backtest/run_holding.mjs
 *
 * Part A  MA-상태 → forward 분포 (진입가 무관)
 * Part B  실제 HoldingOpinion을 exit 트리거로 돌린 정책 시뮬 vs 매수후보유 + θ 스윕  ★핵심
 * Part C  near5MA('추가매수') 상태가 baseline보다 오르는가
 *
 * ⚠️ 프레이밍 — 내부 임계값 보정용. UI·R2 원칙 불변, 결과는 내부 문서에만.
 * ⚠️ 해석 원칙 — 손절은 **평균이 아니라 왼쪽 꼬리(p5·최소)로 판정**한다. 손절은 보통 평균을
 *    낮추고 대신 큰 손실을 자른다. 평균만 보면 "손절이 수익을 깎는다"는 오독이 나온다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { loadUniverse, loadSeries, loadCorporateActions, closePool } from './load.mjs';
import { signalIndices } from './returns.mjs';
import { distributionStats } from './ic.mjs';
import {
    classifyMaState, MA_STATES, simulateHolding, precomputeSmas, labeledStats, pairedDiff, variantMatchesProduction,
} from './holding.mjs';

const pct = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const num = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));

// 정책 목록 — production은 calculateHoldingOpinion을 **그대로** 호출한다(규칙 복제 0).
// stop-0.07_dbd는 같은 파라미터의 변종이라 production과 결과가 **완전히 같아야** 한다(런타임 대조).
function buildPolicies() {
    const out = [{ name: 'production', stopThreshold: -0.07, useDoubleBreakdown: true, useProductionRule: true }];
    for (const th of CONFIG.STOP_THRESHOLDS) {
        // 이름은 toFixed(2) — 그냥 붙이면 -0.10이 '-0.1'로 찍혀 CSV 정렬·대조가 지저분해진다.
        const tag = th.toFixed(2);
        out.push({ name: `stop${tag}_dbd`, stopThreshold: th, useDoubleBreakdown: true, useProductionRule: false });
        out.push({ name: `stop${tag}_only`, stopThreshold: th, useDoubleBreakdown: false, useProductionRule: false });
    }
    // 손절 없이 이중이탈만 — 손절 단독 효과와 분리해서 보려면 반대쪽도 있어야 한다.
    out.push({ name: 'dbd_only', stopThreshold: -Infinity, useDoubleBreakdown: true, useProductionRule: false });
    return out;
}

// 합성 스모크에서 확인된 구조적 성질(실측 규모는 운영자 실행에서 확정):
//   이중이탈이 켜져 있으면 **거의 항상 손절보다 먼저 발동**해 θ 스윕이 통째로 흡수된다
//   (합성 25종목: production 청산 1118건 중 손절 0 / 이탈 1118). 그래서
//   ① θ의 효과는 `*_only`(이중이탈 off) 계열에서만 볼 수 있고,
//   ② 진입 시점에 **이미 doubleBreakdown인 표본**(합성 38%)은 다음날 바로 청산돼
//      "정책"이 사실상 1일 보유가 된다 → 헤드라인 평균이 그 표본에 끌려간다.
// ②를 분리해 보려고 entryState를 기록하고 Part B에 entryFilter 축을 둔다.
const ENTRY_FILTERS = [
    { name: 'all', keep: () => true },
    { name: 'notSellAtEntry', keep: (r) => r.entryState !== 'doubleBreakdown' },
];

async function run() {
    const t0 = Date.now();
    console.log('=== Phase 4 세션 2 — HoldingOpinion 백테스트 ===');
    console.log(`설정: horizons=${CONFIG.HOLDING_HORIZONS.join(',')} step=${CONFIG.STEP_DAYS} warmup=${CONFIG.MIN_WARMUP} θ=${CONFIG.STOP_THRESHOLDS.join(',')} exitLag=${CONFIG.EXIT_LAG_DAYS.join(',')}`);

    // ── 로드 ─────────────────────────────────────────────────────
    const { universe, excluded } = await loadUniverse();
    console.log(`\n[유니버스] ${universe.length}종목 · 제외 ${excluded.length}종목 (히스토리 < ${CONFIG.MIN_HISTORY}행)`);
    if (universe.length === 0) { console.error('유니버스 비었음 — 중단'); await closePool(); process.exit(1); }

    const codes = universe.map(u => u.code);
    const { byCode, dropped, totalRows } = await loadSeries(codes);
    console.log(`[로드] ${totalRows}행 → 유효 ${totalRows - dropped}행, ${byCode.size}종목`);

    const ca = await loadCorporateActions(codes);
    console.log(`[분할 스크리닝] 공시 ${ca.available ? `${ca.events}건 · ${ca.codesAffected}종목 (주식분할·병합·무상증자·주식배당)` : '조회 불가'} · 모드=${CONFIG.SPLIT_SCREEN}`);

    // ── 표본 수집 ────────────────────────────────────────────────
    const maxH = Math.max(...CONFIG.HOLDING_HORIZONS);
    const policies = buildPolicies();

    const stateRows = [];    // Part A/C: { code, date, state, r5, r20, r60, splitSuspect }
    const policyRows = [];   // Part B:   { code, date, policy(name), horizon, exitLag, buyHold, policyRet, ... }
    const counters = {
        signals: 0, splitByDisclosure: 0, splitByDailyDrop: 0,
        prodMismatch: 0, simDrops: {},
    };

    for (const { code } of universe) {
        const series = byCode.get(code);
        if (!series || series.length < CONFIG.MIN_WARMUP + maxH + 2) continue;
        const smas = precomputeSmas(series);
        const events = ca.byCode.get(code) || null;

        // 단일일 급락(가격제한폭 밖) 위치 — 분할 의심 마킹용. ≤ j 정보만 쓰므로 누수 아님.
        const bigDrop = new Array(series.length).fill(false);
        for (let j = 1; j < series.length; j++) {
            const r = series[j].price / series[j - 1].price - 1;
            if (r < CONFIG.SPLIT_SUSPECT_DAILY_DROP - 1e-9) bigDrop[j] = true;
        }

        for (const i of signalIndices(series.length, { minWarmup: CONFIG.MIN_WARMUP, stepDays: CONFIG.STEP_DAYS, maxHorizon: maxH + 1 })) {
            counters.signals++;
            const entryDate = series[i].date;
            // 보유 구간(진입~최대 호라이즌+지연) 안에 분할성 이벤트가 있으면 그 표본은 오염됐다.
            const lastIdx = Math.min(series.length - 1, i + maxH + Math.max(...CONFIG.EXIT_LAG_DAYS));
            let suspect = false;
            if (events) {
                for (let j = i; j <= lastIdx; j++) if (events.has(series[j].date)) { suspect = true; break; }
            }
            if (suspect) counters.splitByDisclosure++;
            let dropSuspect = false;
            for (let j = i + 1; j <= lastIdx; j++) if (bigDrop[j]) { dropSuspect = true; break; }
            if (dropSuspect) counters.splitByDailyDrop++;
            const splitSuspect = suspect || dropSuspect;

            // Part A/C — 진입가 무관 상태 + forward return
            const entryState = classifyMaState(series[i].price, smas.sma5[i], smas.sma20[i]);
            const st = { code, date: entryDate, state: entryState, splitSuspect };
            for (const n of CONFIG.HOLDING_HORIZONS) {
                const sim0 = simulateHolding(series, i, n, { ...policies[0], exitLagDays: 0, precomputed: smas });
                if (sim0.ok) st[`r${n}`] = sim0.buyHold;   // buyHold = 순수 forward return
            }
            stateRows.push(st);

            // Part B — 정책 × 호라이즌 × 지연
            for (const p of policies) {
                for (const n of CONFIG.HOLDING_HORIZONS) {
                    for (const lag of CONFIG.EXIT_LAG_DAYS) {
                        const sim = simulateHolding(series, i, n, { ...p, exitLagDays: lag, precomputed: smas });
                        if (!sim.ok) { counters.simDrops[sim.reason] = (counters.simDrops[sim.reason] || 0) + 1; continue; }
                        policyRows.push({
                            code, date: entryDate, policy: p.name, horizon: n, exitLag: lag, splitSuspect, entryState,
                            buyHold: sim.buyHold, policyRet: sim.policy,
                            exited: sim.exited ? 1 : 0, exitReason: sim.exitReason || '',
                            holdingDays: sim.holdingDays,
                        });
                    }
                }
            }

            // production vs 동일 파라미터 변종 — 규칙 복제가 어긋나지 않았는지 실데이터로 대조.
            if (!variantMatchesProduction(series[i].price, series[i + 1].price, smas.sma5[i + 1], smas.sma20[i + 1])) {
                counters.prodMismatch++;
            }
        }
    }

    console.log(`[표본] 진입 신호 ${counters.signals}개 · 상태행 ${stateRows.length} · 정책행 ${policyRows.length}`);
    console.log(`  분할 의심: 공시 기준 ${counters.splitByDisclosure} · 단일일 ${pct(CONFIG.SPLIT_SUSPECT_DAILY_DROP, 0)} 급락 기준 ${counters.splitByDailyDrop}`);
    console.log(`  시뮬 제외: ${Object.entries(counters.simDrops).map(([k, v]) => `${k}=${v}`).join(' ') || '없음'}`);
    console.log(`  프로덕션 규칙 대조 불일치: ${counters.prodMismatch}건 ${counters.prodMismatch === 0 ? '(변종 로직 = 프로덕션 판정)' : '⚠️ 변종 로직이 어긋났다'}`);
    if (stateRows.length === 0) { console.error('표본 없음 — 중단'); await closePool(); process.exit(1); }

    // ── holdout 분할 (세션 1과 같은 방식 — 신호일 마지막 20%) ────
    const dates = [...new Set(stateRows.map(r => r.date))].sort();
    const cut = CONFIG.TEST_HOLDOUT_FROM || dates[Math.max(0, Math.floor(dates.length * (1 - CONFIG.HOLDOUT_FRACTION)))];
    console.log(`\n[분할] 신호일 ${dates.length}일 (${dates[0]} ~ ${dates[dates.length - 1]}) · holdout ≥ ${cut}`);
    console.log('  ※ 봉인 구간에서 θ를 고르지 않는다. 여기 값을 보고 문턱을 정하면 오염이다.');

    const keep = (r) => (CONFIG.SPLIT_SCREEN === 'exclude' ? !r.splitSuspect : true);
    const inSplit = (r, name) => (name === 'train' ? r.date < cut : r.date >= cut);

    // ── Part A/C ─────────────────────────────────────────────────
    const partA = [];
    for (const splitName of ['train', 'test']) {
        for (const n of CONFIG.HOLDING_HORIZONS) {
            const rows = stateRows.filter(r => keep(r) && inSplit(r, splitName) && Number.isFinite(r[`r${n}`]));
            for (const s of labeledStats(rows, 'state', `r${n}`, MA_STATES)) {
                partA.push({ split: splitName, horizon: n, state: s.label, ...s, label: undefined });
            }
            // baseline(전체) — Part C에서 near5MA와 비교할 기준선.
            partA.push({ split: splitName, horizon: n, state: 'ALL(baseline)', ...distributionStats(rows.map(r => r[`r${n}`])) });
        }
    }

    // ── Part B ───────────────────────────────────────────────────
    const partB = [];
    for (const splitName of ['train', 'test']) {
      for (const ef of ENTRY_FILTERS) {
        for (const p of policies) {
            for (const n of CONFIG.HOLDING_HORIZONS) {
                for (const lag of CONFIG.EXIT_LAG_DAYS) {
                    const rows = policyRows.filter(r => keep(r) && ef.keep(r) && inSplit(r, splitName) && r.policy === p.name && r.horizon === n && r.exitLag === lag);
                    if (rows.length === 0) continue;
                    const pol = distributionStats(rows.map(r => r.policyRet));
                    const bh = distributionStats(rows.map(r => r.buyHold));
                    const diff = pairedDiff(rows.map(r => ({ policy: r.policyRet, buyHold: r.buyHold })));
                    const exitedRows = rows.filter(r => r.exited === 1);
                    const byStop = exitedRows.filter(r => r.exitReason === 'stop_loss');
                    const byDbd = exitedRows.filter(r => r.exitReason === 'double_breakdown');
                    partB.push({
                        split: splitName, entryFilter: ef.name, policy: p.name, horizon: n, exitLag: lag, n: rows.length,
                        polMean: pol.mean, polMedian: pol.median, polStd: pol.std, polP5: pol.p5, polMin: pol.min, polWin: pol.winRate,
                        bhMean: bh.mean, bhMedian: bh.median, bhStd: bh.std, bhP5: bh.p5, bhMin: bh.min, bhWin: bh.winRate,
                        diffMean: diff.mean, diffMedian: diff.median, diffP5: diff.p5, diffTNaive: diff.tNaive,
                        betterRate: diff.betterRate, sameRate: diff.sameRate,
                        exitRate: exitedRows.length / rows.length,
                        avgHoldingDays: rows.reduce((a, r) => a + r.holdingDays, 0) / rows.length,
                        stopRate: exitedRows.length ? byStop.length / exitedRows.length : null,
                        dbdRate: exitedRows.length ? byDbd.length / exitedRows.length : null,
                        stopMeanRet: byStop.length ? byStop.reduce((a, r) => a + r.policyRet, 0) / byStop.length : null,
                        dbdMeanRet: byDbd.length ? byDbd.reduce((a, r) => a + r.policyRet, 0) / byDbd.length : null,
                    });
                }
            }
        }
      }
    }

    // ── 출력 ─────────────────────────────────────────────────────
    const outDir = path.resolve(process.cwd(), CONFIG.OUT_DIR);
    fs.mkdirSync(outDir, { recursive: true });
    writeCsv(path.join(outDir, 'holding_states.csv'), partA);
    writeCsv(path.join(outDir, 'holding_policy.csv'), partB);
    writeJson(path.join(outDir, 'holding_meta.json'), {
        generatedAt: new Date().toISOString(),
        session: 'phase4-session2-holdingopinion',
        config: {
            HOLDING_HORIZONS: CONFIG.HOLDING_HORIZONS, STOP_THRESHOLDS: CONFIG.STOP_THRESHOLDS,
            EXIT_LAG_DAYS: CONFIG.EXIT_LAG_DAYS, STEP_DAYS: CONFIG.STEP_DAYS, MIN_WARMUP: CONFIG.MIN_WARMUP,
            MIN_HISTORY: CONFIG.MIN_HISTORY, SPLIT_SCREEN: CONFIG.SPLIT_SCREEN,
            SPLIT_SUSPECT_DAILY_DROP: CONFIG.SPLIT_SUSPECT_DAILY_DROP, HOLDOUT_FRACTION: CONFIG.HOLDOUT_FRACTION,
        },
        universe: { included: universe.length, excluded: excluded.length },
        sample: {
            signals: counters.signals, stateRows: stateRows.length, policyRows: policyRows.length,
            dateFrom: dates[0], dateTo: dates[dates.length - 1], holdoutFrom: cut,
            splitByDisclosure: counters.splitByDisclosure, splitByDailyDrop: counters.splitByDailyDrop,
            simDrops: counters.simDrops,
        },
        integrity: {
            productionRuleImported: 'server/domains/analysis/scoring.js calculateHoldingOpinion (복제 0)',
            variantVsProductionMismatch: counters.prodMismatch,
            corporateActionScreening: ca.available ? `공시 ${ca.events}건 / ${ca.codesAffected}종목` : '공시 조회 불가 — 급락 휴리스틱만',
        },
        interpretation: [
            '손절(−θ)의 가치는 평균이 아니라 **왼쪽 꼬리**(polP5·polMin)로 판정한다. 평균 −Δ 대신 p5 +Δ\' 의 교환을 본다.',
            'exitLag=0은 낙관적이다(트리거 당일 종가 청산). 프로덕션은 어제 종가로 판정해 다음날 08:00 알림 → exitLag=1이 실사용에 가깝다.',
            'θ 스윕이 −0.07을 변곡점으로 지지하지 않으면 "임의값 → 재보정 후보"로 기록한다. 재보정 값은 봉인 구간 밖에서만 고른다.',
            '이중이탈(dbd) 매도는 세션 1의 추세축 역방향 관찰(정배열 1.34% < 양 이평선 아래 2.03%)과 대조해 읽는다.',
        ],
        caveats: [
            '수정주가 아님 — 액면분할·무상증자가 −7% 손절을 거짓 발동시킬 수 있다. 공시 기준 + 일일 제한폭 밖 급락으로 스크리닝했으나 완전하지 않다(공시 미적재 종목·배당락 미포함).',
            '표본 중첩 — 진입 그리드 5거래일, 보유 최대 60일이라 표본이 겹친다. 쌍체 차이의 t(diffTNaive)는 부풀려진 값이다.',
            'near5MA와 aligned는 겹칠 수 있어 프로덕션 판정 순서대로 근접을 먼저 배정했다.',
            `표본은 ${universe.length}종목·${dates[0]}~${dates[dates.length - 1]} — 일반화 한계.`,
        ],
        reproduce: "DATABASE_URL='...' node scripts/backtest/run_holding.mjs   (설정은 scripts/backtest/config.mjs 고정)",
    });

    printPartA(partA);
    printPartB(partB);
    printPartC(partA);

    console.log(`\n[산출물] ${outDir}/holding_states.csv · holding_policy.csv · holding_meta.json`);
    console.log(`[소요] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await closePool();
}

function printPartA(rows) {
    console.log('\n=== Part A — MA-상태 → forward 분포 (진입가 무관) ===');
    console.log('  핵심 질문: 규칙이 \'매도\'로 보는 doubleBreakdown이 \'보유\'(aligned)보다 실제로 나쁜가?');
    for (const split of ['train', 'test']) {
        for (const n of CONFIG.HOLDING_HORIZONS) {
            const sub = rows.filter(r => r.split === split && r.horizon === n);
            if (!sub.some(s => s.n > 0)) continue;
            console.log(`\n[${split}] ${n}거래일`);
            console.log('  상태                        n        평균     중앙       p5      최소     승률');
            for (const s of sub) {
                console.log(`  ${s.state.padEnd(24)} ${String(s.n).padStart(7)}  ${pct(s.mean).padStart(8)}  ${pct(s.median).padStart(7)}  ${pct(s.p5).padStart(8)}  ${pct(s.min).padStart(8)}  ${pct(s.winRate, 1).padStart(6)}`);
            }
        }
    }
}

function printPartB(rows) {
    console.log('\n=== Part B — 정책 vs 매수후보유 (★핵심) ===');
    console.log('  판정 기준: 평균이 아니라 **왼쪽 꼬리**. "평균 −Δ 대신 p5 +Δ\'"의 교환이 성립하는가.');
    for (const split of ['train', 'test']) {
      for (const ef of ENTRY_FILTERS) {
        for (const n of CONFIG.HOLDING_HORIZONS) {
            for (const lag of CONFIG.EXIT_LAG_DAYS) {
                const sub = rows.filter(r => r.split === split && r.entryFilter === ef.name && r.horizon === n && r.exitLag === lag);
                if (sub.length === 0) continue;
                console.log(`\n[${split}] 진입=${ef.name === 'all' ? '전체' : '진입시 매도상태 제외'} · ${n}거래일 · 청산지연 ${lag}일${lag === 0 ? ' (낙관)' : ' (실행 지연 반영)'}`);
                console.log('  정책              n      정책평균  BH평균   Δ평균    정책p5    BH p5    Δp5     정책최소  BH최소   청산율  보유일  손절%  이탈%');
                for (const r of sub) {
                    const dP5 = (r.polP5 != null && r.bhP5 != null) ? r.polP5 - r.bhP5 : null;
                    console.log(
                        `  ${r.policy.padEnd(16)} ${String(r.n).padStart(6)}  ${pct(r.polMean).padStart(8)} ${pct(r.bhMean).padStart(7)} ${pct(r.diffMean).padStart(7)}  `
                        + `${pct(r.polP5).padStart(8)} ${pct(r.bhP5).padStart(8)} ${pct(dP5).padStart(7)}  `
                        + `${pct(r.polMin).padStart(8)} ${pct(r.bhMin).padStart(8)} ${pct(r.exitRate, 1).padStart(6)}  ${num(r.avgHoldingDays, 1).padStart(5)}  ${pct(r.stopRate, 0).padStart(5)}  ${pct(r.dbdRate, 0).padStart(5)}`
                    );
                }
            }
        }
      }
    }
    // production == stop-0.07_dbd 실데이터 대조
    const mismatches = [];
    for (const a of rows.filter(r => r.policy === 'production')) {
        const b = rows.find(r => r.policy === 'stop-0.07_dbd' && r.split === a.split && r.entryFilter === a.entryFilter && r.horizon === a.horizon && r.exitLag === a.exitLag);
        if (b && (Math.abs((a.polMean ?? 0) - (b.polMean ?? 0)) > 1e-12 || a.n !== b.n)) mismatches.push(`${a.split}/${a.entryFilter}/${a.horizon}/${a.exitLag}`);
    }
    console.log(`\n  [정합] production(calculateHoldingOpinion 직접 호출) vs stop-0.07_dbd(변종): ${mismatches.length === 0 ? '전 셀 동일 ✓' : `⚠️ 불일치 ${mismatches.join(' ')}`}`);
}

function printPartC(rows) {
    console.log('\n=== Part C — near5MA(\'추가매수\')가 baseline보다 오르는가 ===');
    console.log('  구간   N   near5MA 평균   baseline 평균   차이     near5MA n');
    for (const split of ['train', 'test']) {
        for (const n of CONFIG.HOLDING_HORIZONS) {
            const near = rows.find(r => r.split === split && r.horizon === n && r.state === 'near5MA');
            const base = rows.find(r => r.split === split && r.horizon === n && r.state === 'ALL(baseline)');
            if (!near || !base) continue;
            const d = (near.mean != null && base.mean != null) ? near.mean - base.mean : null;
            console.log(`  ${split.padEnd(6)} ${String(n).padStart(2)}  ${pct(near.mean).padStart(12)}  ${pct(base.mean).padStart(13)}  ${pct(d).padStart(7)}  ${String(near.n).padStart(9)}`);
        }
    }
}

function writeCsv(file, rows) {
    if (!rows.length) { fs.writeFileSync(file, ''); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => rows.some(r => r[c] !== undefined));
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
