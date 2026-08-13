// Phase 4 — forward return + 누수 가드. **순수 모듈** → 단위 테스트 대상.
//
// 누수 차단(§4-2)이 이 파일의 존재 이유다:
//   · 시점 t의 수익은 **엄격히 t+1..t+N**. price[i]는 진입가로만 쓰고 미래 가격은 i+N 하나뿐.
//   · i+N이 시계열 끝을 넘거나 그 종가가 결측이면 **그 표본을 버린다**(억지 채움 금지 —
//     마지막 가격으로 메우면 상장폐지·거래정지 종목의 손실이 0으로 둔갑한다).

// seriesAsc: [{ date, price }] 오름차순. i: 진입 인덱스. N: 보유 거래일.
// → { ok, ret, exitDate, reason }
export function forwardReturn(seriesAsc, i, n) {
    const s = seriesAsc || [];
    if (!Number.isInteger(i) || i < 0 || i >= s.length) return { ok: false, reason: 'index_out_of_range' };
    if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: 'bad_horizon' };

    const j = i + n;
    if (j >= s.length) return { ok: false, reason: 'horizon_beyond_series' };   // 미래가 없음 → 제외

    const entry = s[i]?.price;
    const exit = s[j]?.price;
    if (!Number.isFinite(entry) || entry <= 0) return { ok: false, reason: 'entry_price_missing' };
    if (!Number.isFinite(exit) || exit <= 0) return { ok: false, reason: 'exit_price_missing' };  // 정지·폐지

    return { ok: true, ret: exit / entry - 1, exitDate: s[j].date, entryDate: s[i].date };
}

// 벤치마크 초과수익 — **같은 캘린더 구간**으로 맞춘다. 거래일 인덱스가 아니라 날짜로 정렬해야
// 종목별 휴장·결측이 구간을 어긋나게 만들지 않는다.
// benchByDate: Map<'YYYYMMDD', close>. 구간 양끝이 없으면 초과수익만 제외(원수익은 유지).
export function excessReturn(ret, entryDate, exitDate, benchByDate) {
    if (!benchByDate || ret == null) return { ok: false, reason: 'no_benchmark' };
    const a = benchByDate.get(entryDate);
    const b = benchByDate.get(exitDate);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return { ok: false, reason: 'bench_missing' };
    return { ok: true, excess: ret - (b / a - 1) };
}

// 신호일 인덱스 그리드 — 워밍업 이후부터 STEP 간격, 그리고 **가장 큰 호라이즌이 들어갈 자리**까지만.
// (호라이즌마다 다시 자르지 않고 여기서 상한을 두면, 축·호라이즌 간 표본 날짜가 달라져
//  IC를 나란히 비교할 수 없게 되는 걸 막는다 — 대신 호라이즌별 표본 수는 동일 그리드에서
//  forwardReturn 실패로만 줄어든다.)
export function signalIndices(seriesLength, { minWarmup, stepDays, maxHorizon }) {
    const out = [];
    const last = seriesLength - 1 - maxHorizon;
    for (let i = minWarmup; i <= last; i += Math.max(1, stepDays)) out.push(i);
    return out;
}

// 시점 t의 SMA — 프로덕션 정의와 **동일**해야 한다.
// server/domains/stock/service.js:323-330 `getSMA`: 최근 N개 종가 평균을 Math.round.
// round를 빼먹으면 정배열/역배열 경계에서 추세 점수가 갈린다.
export function smaAt(seriesAsc, i, days) {
    if (i + 1 < days) return null;                        // 표본 부족 — 프로덕션도 null
    let sum = 0;
    for (let k = i - days + 1; k <= i; k++) {
        const p = seriesAsc[k]?.price;
        if (!Number.isFinite(p)) return null;
        sum += p;
    }
    return Math.round(sum / days);
}
