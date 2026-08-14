// Phase 4 세션 3 — 수급 순수 코어 동치 + 시점 t 슬라이스 누수 가드.
//
// 왜 동치 테스트가 필수인가: 하네스가 프로덕션과 **다른 걸 재면** IC가 무의미하다.
// 세션 1의 computeTechnicalFromHistory 동치 테스트와 같은 규율(리팩터 안전망이 아니라
// 하네스의 전제 조건).
import { describe, it, expect } from 'vitest';
import { calculateSupplyDemandScore, computeSupplyDemandFromRows } from '@/server/domains/analysis/scoring';
import { supplyAt } from '@/scripts/backtest/signals.mjs';
import { CONFIG } from '@/scripts/backtest/config.mjs';

type Row = { date: string; institution: number; foreign_net: number };

// pg는 BIGINT를 **문자열**로 돌려준다 → DB 경로의 Number() 캐스팅이 살아 있는지까지 잰다.
function pgStub(rowsDesc: Row[]) {
    return {
        query: async () => ({
            rows: rowsDesc.map(r => ({
                date: r.date,
                institution: String(r.institution),
                foreign_net: String(r.foreign_net),
            })),
        }),
    };
}

function mkRows(n: number, f: (i: number) => { institution: number; foreign_net: number }): Row[] {
    // 오름차순 생성(최신이 마지막)
    return Array.from({ length: n }, (_, i) => ({
        date: `2026${String(1 + Math.floor(i / 28)).padStart(2, '0')}${String((i % 28) + 1).padStart(2, '0')}`,
        ...f(i),
    }));
}

describe('computeSupplyDemandFromRows — 프로덕션 DB 경로와 동치', () => {
    const cases: Array<[string, Row[]]> = [
        ['전일 매수', mkRows(20, () => ({ institution: 100, foreign_net: 200 }))],
        ['전일 매도', mkRows(20, () => ({ institution: -100, foreign_net: -200 }))],
        ['교대', mkRows(20, i => ({ institution: i % 2 ? 50 : -50, foreign_net: i % 3 ? 10 : -10 }))],
        ['외국인만 매수', mkRows(20, () => ({ institution: -1, foreign_net: 1 }))],
        ['0 혼재', mkRows(20, i => ({ institution: i % 4 === 0 ? 0 : 7, foreign_net: 0 }))],
        ['최소 표본 3', mkRows(3, () => ({ institution: 1, foreign_net: 1 }))],
        ['10행 미만(정규화 분모 축소)', mkRows(6, () => ({ institution: 5, foreign_net: 5 }))],
    ];

    for (const [label, asc] of cases) {
        it(`${label} — DB 경로 == 순수 코어`, async () => {
            const desc = [...asc].reverse();
            const viaDb = await calculateSupplyDemandScore(pgStub(desc), '005930');
            const viaPure = computeSupplyDemandFromRows(desc);
            expect(viaDb).toEqual(viaPure);
            expect(viaDb.total).toBeGreaterThanOrEqual(0);
            expect(viaDb.total).toBeLessThanOrEqual(2);
        });
    }

    it('3행 미만은 total 0 · detail 빈 객체 (프로덕션 폴백 유지)', () => {
        expect(computeSupplyDemandFromRows([])).toEqual({ total: 0, detail: {} });
        expect(computeSupplyDemandFromRows(mkRows(2, () => ({ institution: 9, foreign_net: 9 })))).toEqual({ total: 0, detail: {} });
    });

    it('null/undefined 입력도 폴백 (하네스가 빈 창을 넘길 수 있다)', () => {
        expect(computeSupplyDemandFromRows(null)).toEqual({ total: 0, detail: {} });
        expect(computeSupplyDemandFromRows(undefined)).toEqual({ total: 0, detail: {} });
    });

    it('순서가 뒤집히면 값이 달라진다 — DESC 계약이 실재함(비공회전)', () => {
        // 최근 3일만 매수, 나머지 매도 → DESC로 넣으면 감쇠 가중이 매수에 크게 붙는다.
        const asc = mkRows(20, i => ({ institution: i >= 17 ? 100 : -100, foreign_net: i >= 17 ? 100 : -100 }));
        const desc = [...asc].reverse();
        const correct = computeSupplyDemandFromRows(desc).total;
        const flipped = computeSupplyDemandFromRows(asc).total;
        expect(correct).not.toBe(flipped);
        expect(correct).toBeGreaterThan(flipped);
    });
});

describe('supplyAt — 시점 t 슬라이스 (누수 차단)', () => {
    const asc = mkRows(60, i => ({ institution: i % 2 ? 100 : -100, foreign_net: i % 2 ? 100 : -100 }));

    it('≤ t 행만 본다 — t 이후를 조작해도 점수 불변', () => {
        const t = asc[40].date;
        const base = supplyAt(asc, t);

        const tampered = asc.map((r, i) => (i > 40 ? { ...r, institution: 999999, foreign_net: 999999 } : r));
        expect(supplyAt(tampered, t).score).toBe(base.score);

        // 미래를 통째로 잘라내도 동일해야 한다(= 미래를 전혀 안 봤다는 뜻)
        expect(supplyAt(asc.slice(0, 41), t).score).toBe(base.score);
    });

    it('비공회전 — 창 **안**(≤t 최근 20행)을 바꾸면 점수가 달라진다', () => {
        const t = asc[40].date;
        const base = supplyAt(asc, t);
        const tampered = asc.map((r, i) => (i > 30 && i <= 40 ? { ...r, institution: 5000, foreign_net: 5000 } : r));
        expect(supplyAt(tampered, t).score).not.toBe(base.score);
    });

    it('창은 정확히 최근 SUPPLY_LOOKBACK_ROWS행 — 그 이전을 바꿔도 불변', () => {
        const t = asc[40].date;
        const base = supplyAt(asc, t);
        const older = 40 - CONFIG.SUPPLY_LOOKBACK_ROWS;    // 창 밖(더 과거)
        const tampered = asc.map((r, i) => (i < older ? { ...r, institution: -777777, foreign_net: -777777 } : r));
        expect(supplyAt(tampered, t).score).toBe(base.score);
    });

    it('supplyAt == computeSupplyDemandFromRows(≤t 최근 20행 DESC)', () => {
        const t = asc[40].date;
        const window = asc.filter(r => r.date <= t).slice(-CONFIG.SUPPLY_LOOKBACK_ROWS).reverse();
        expect(supplyAt(asc, t).score).toBe(computeSupplyDemandFromRows(window).total);
    });

    it('창이 안 차면 점수 대신 null — 가짜 0을 만들지 않는다', () => {
        const shallow = mkRows(5, () => ({ institution: 1, foreign_net: 1 }));
        const r = supplyAt(shallow, shallow[4].date);
        expect(r.score).toBeNull();
        expect(r.reason).toBe('insufficient_investor_rows');
        expect(r.rowsUsed).toBe(5);
    });

    it('데이터 없음과 순매수 없음을 구분한다', () => {
        expect(supplyAt(null, '20260401').score).toBeNull();
        expect(supplyAt(null, '20260401').reason).toBe('no_investor_data');
        expect(supplyAt([], '20260401').reason).toBe('no_investor_data');

        // 전량 순매도 = 데이터는 있고 점수는 0 → null이 아니어야 한다
        const allSell = mkRows(20, () => ({ institution: -1, foreign_net: -1 }));
        const sold = supplyAt(allSell, allSell[19].date);
        expect(sold.score).toBe(0);
        expect(sold.reason).toBeNull();
    });

    it('t가 전 구간보다 과거면 창이 비어 null', () => {
        expect(supplyAt(asc, '20200101').score).toBeNull();
    });

    it('t에 정확히 해당하는 행은 **포함**된다 (경계)', () => {
        const t = asc[25].date;
        const withT = supplyAt(asc, t);
        const exclusive = computeSupplyDemandFromRows(
            asc.filter(r => r.date < t).slice(-CONFIG.SUPPLY_LOOKBACK_ROWS).reverse()
        ).total;
        expect(withT.score).not.toBe(exclusive);
    });
});
