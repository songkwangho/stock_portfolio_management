// Phase 4 — IC(정보계수)·버킷 통계. **순수 모듈**(DB·파일 접근 0) → 단위 테스트 대상.
//
// IC 정의(§4-3, 표준): 날짜별 **횡단면** Rank IC를 먼저 구하고 그 시계열을 평균한다.
// 관측치를 통째로 한 덩어리 Spearman에 넣으면 종목 수가 많은 날이 가중되고, 같은 날의
// 시장 공통 움직임이 상관으로 새어 들어간다.
//
// 중첩(overlap): 신호일 간격 STEP보다 호라이즌 N이 길면 forward 창이 겹쳐 IC 시계열에
// 자기상관이 생기고 순진한 t-stat이 부풀려진다 → Newey-West 보정 t를 함께 낸다.

// 동순위 평균 랭크. Spearman은 순위 상관이라 동점 처리가 값을 바꾼다.
export function rankWithTies(values) {
    const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length);
    let k = 0;
    while (k < idx.length) {
        let j = k;
        while (j + 1 < idx.length && idx[j + 1].v === idx[k].v) j++;
        const avg = (k + j) / 2 + 1;               // 1-based 평균 랭크
        for (let m = k; m <= j; m++) ranks[idx[m].i] = avg;
        k = j + 1;
    }
    return ranks;
}

// Pearson — 랭크에 적용하면 Spearman(동순위 포함 정의).
export function pearson(x, y) {
    const n = x.length;
    if (n < 3) return null;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx, dy = y[i] - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx <= 0 || syy <= 0) return null;         // 한쪽이 상수 — 상관 정의 불가
    return sxy / Math.sqrt(sxx * syy);
}

export function spearman(x, y) {
    if (!x || !y || x.length !== y.length) return null;
    return pearson(rankWithTies(x), rankWithTies(y));
}

// 표준정규 CDF(Abramowitz-Stegun erf 근사). n이 100+ 수준이라 t분포 대신 정규 근사를 쓴다
// — 리포트에 근사임을 밝힌다.
function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
}
export const twoSidedP = (t) => (t == null || !Number.isFinite(t) ? null : 2 * (1 - normCdf(Math.abs(t))));

// Newey-West 표준오차 — 중첩으로 생긴 자기상관을 흡수한다. lag=0이면 통상 SE와 같다.
export function neweyWestSE(series, lag) {
    const n = series.length;
    if (n < 2) return null;
    const mean = series.reduce((a, b) => a + b, 0) / n;
    const dev = series.map(v => v - mean);
    let s = dev.reduce((a, d) => a + d * d, 0) / n;          // γ0
    const L = Math.max(0, Math.min(lag, n - 1));
    for (let k = 1; k <= L; k++) {
        let g = 0;
        for (let t = k; t < n; t++) g += dev[t] * dev[t - k];
        g /= n;
        s += 2 * (1 - k / (L + 1)) * g;                       // Bartlett 커널
    }
    if (s <= 0) return null;                                  // 보정 후 음수분산 — 보고에서 제외
    return Math.sqrt(s / n);
}

// 중첩 lag 수: 신호일이 STEP 간격일 때 창 N이 겹치는 관측 개수.
export const overlapLag = (horizon, stepDays) => Math.floor((horizon - 1) / Math.max(1, stepDays));

// 관측 레코드 → 날짜별 횡단면 묶음. computeIC의 입력 형태를 만든다.
// rows: [{ date, [axis]: score, [retKey]: ret }]
export function groupByDate(rows, axis, retKey) {
    const m = new Map();
    for (const r of rows || []) {
        const score = r[axis], ret = r[retKey];
        if (!Number.isFinite(score) || !Number.isFinite(ret)) continue;
        if (!m.has(r.date)) m.set(r.date, []);
        m.get(r.date).push({ score, ret });
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, values]) => ({ date, values }));
}

// dailyObs: [{ date, values: [{ score, ret }] }] → 횡단면 IC 시계열 + 요약 통계.
export function computeIC(dailyObs, opts = {}) {
    const minCross = opts.minCrossSection ?? 10;
    const lag = opts.lag ?? 0;
    const periodsPerYear = opts.periodsPerYear ?? null;       // 연환산용(= 252/N)

    const series = [];
    for (const day of dailyObs || []) {
        const vs = (day.values || []).filter(v => Number.isFinite(v.score) && Number.isFinite(v.ret));
        if (vs.length < minCross) continue;
        const ic = spearman(vs.map(v => v.score), vs.map(v => v.ret));
        if (ic === null || !Number.isFinite(ic)) continue;     // 그날 점수가 전부 동일 등
        series.push({ date: day.date, ic, n: vs.length });
    }

    const n = series.length;
    if (n === 0) {
        return { n: 0, mean: null, std: null, icir: null, tStat: null, tStatNW: null, pValue: null, pValueNW: null, series: [], obs: 0 };
    }
    const ics = series.map(s => s.ic);
    const mean = ics.reduce((a, b) => a + b, 0) / n;
    // 표본 표준편차(n-1) — 시계열 평균의 유의성을 보는 거라 불편추정.
    const std = n > 1 ? Math.sqrt(ics.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : null;

    const tStat = std && std > 0 ? mean / (std / Math.sqrt(n)) : null;
    const seNW = neweyWestSE(ics, lag);
    const tStatNW = seNW && seNW > 0 ? mean / seNW : null;
    // ICIR — 관측 단위 IC의 정보비율. 연환산은 **독립 기간 수**(252/N)로만 한다.
    const icir = std && std > 0 ? (mean / std) * (periodsPerYear ? Math.sqrt(periodsPerYear) : 1) : null;

    return {
        n, mean, std, icir, tStat, tStatNW,
        pValue: twoSidedP(tStat), pValueNW: twoSidedP(tStatNW),
        obs: series.reduce((a, s) => a + s.n, 0),
        avgCrossSection: series.reduce((a, s) => a + s.n, 0) / n,
        series,
    };
}

// 버킷 통계 — 점수 구간별 forward return 분포. 단조성(점수↑ → 수익↑?)을 눈으로 볼 재료.
export function quantile(sortedAsc, q) {
    if (sortedAsc.length === 0) return null;
    const pos = (sortedAsc.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sortedAsc[lo];
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

// 수익률 배열 → 분포 통계. bucketStats(세션1)와 상태별 통계(세션2)가 **같은 함수**를 쓴다.
//
// p5·min을 함께 낸다: 세션2에서 손절의 가치는 평균이 아니라 **왼쪽 꼬리**로 판정한다
// ("평균 -Δ 대신 p5 +Δ'"의 교환). 평균만 보면 "손절이 수익을 깎는다"로 오독된다.
export function distributionStats(rets) {
    const s = [...(rets || [])].filter(Number.isFinite).sort((a, b) => a - b);
    if (s.length === 0) {
        return { n: 0, mean: null, median: null, std: null, p5: null, p25: null, p75: null, p95: null, min: null, max: null, winRate: null };
    }
    const mean = s.reduce((a, v) => a + v, 0) / s.length;
    const std = s.length > 1 ? Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / (s.length - 1)) : null;
    return {
        n: s.length, mean, std,
        median: quantile(s, 0.5),
        p5: quantile(s, 0.05), p25: quantile(s, 0.25), p75: quantile(s, 0.75), p95: quantile(s, 0.95),
        min: s[0], max: s[s.length - 1],
        winRate: s.filter(v => v > 0).length / s.length,
    };
}

export function bucketStats(observations, buckets) {
    return buckets.map(b => ({
        label: b.label,
        ...distributionStats((observations || [])
            .filter(o => Number.isFinite(o.score) && Number.isFinite(o.ret) && o.score >= b.min && o.score < b.max)
            .map(o => o.ret)),
    }));
}

// Benjamini-Hochberg — 축 × 호라이즌 6개 검정의 다중검정 보정.
// 원 p값과 함께 보고한다(보정만 남기면 어느 쪽이 원값인지 추적이 끊긴다).
export function benjaminiHochberg(pValues) {
    const items = pValues.map((p, i) => ({ p, i })).filter(x => Number.isFinite(x.p));
    if (items.length === 0) return pValues.map(() => null);
    items.sort((a, b) => a.p - b.p);
    const m = items.length;
    const out = new Array(pValues.length).fill(null);
    let prev = 1;
    for (let k = m - 1; k >= 0; k--) {
        const adj = Math.min(prev, (items[k].p * m) / (k + 1));
        out[items[k].i] = adj;
        prev = adj;
    }
    return out;
}
