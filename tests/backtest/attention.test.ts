// attention 사건성 프록시 — 시점 t 재구성의 누수 차단 + 관찰-only 성질 고정.
//
// ⚠️ 이 하네스의 target은 |forward return|이다(사건 크기). 방향 예측이 아니다 —
//    양(+) IC가 좋은 결과라는 해석이 세션 1~3과 반대다.
import { describe, it, expect } from 'vitest';
import { attentionAt, disclosuresAsOf, absTarget, OBSERVATION_ONLY } from '@/scripts/backtest/attention.mjs';
import { scoreItem, ATTENTION_CONSTANTS } from '@/server/domains/attention/score';

type Bar = { date: string; price: number; volume: number };
type Disc = { rcept_dt: string; category: string };

// 오름차순 합성 시계열. 날짜는 'YYYYMMDD' 고정폭(사전식 = 시간순).
function mkSeries(n: number, priceAt: (i: number) => number): Bar[] {
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(Date.UTC(2024, 0, 1 + i));
        return {
            date: `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`,
            price: priceAt(i),
            volume: 1000 + (i % 7) * 100,
        };
    });
}

describe('disclosuresAsOf — 룩백 창 + ≤t 누수 차단', () => {
    const disc: Disc[] = [
        { rcept_dt: '20240301', category: 'other' },
        { rcept_dt: '20240310', category: 'dividend' },
        { rcept_dt: '20240315', category: 'earnings' },   // t
        { rcept_dt: '20240316', category: 'merger' },     // 미래
        { rcept_dt: '20240401', category: 'treasury' },   // 미래
    ];

    it('t 이후 공시를 절대 포함하지 않는다', () => {
        const w = disclosuresAsOf(disc, '20240315');
        expect(w.map((r: Disc) => r.rcept_dt)).not.toContain('20240316');
        expect(w.map((r: Disc) => r.rcept_dt)).not.toContain('20240401');
    });

    it('t 당일 공시는 포함한다 (경계 inclusive)', () => {
        expect(disclosuresAsOf(disc, '20240315').map((r: Disc) => r.rcept_dt)).toContain('20240315');
    });

    it('룩백(14일) 밖 과거는 제외한다', () => {
        // 20240315 기준 하한 = 20240301
        const w = disclosuresAsOf(disc, '20240315');
        expect(w.map((r: Disc) => r.rcept_dt)).toContain('20240301');
        expect(disclosuresAsOf(disc, '20240316').map((r: Disc) => r.rcept_dt)).not.toContain('20240301');
    });

    it('빈 입력·null에 던지지 않는다 (DART 미적재 robust)', () => {
        expect(disclosuresAsOf(null, '20240315')).toEqual([]);
        expect(disclosuresAsOf([], '20240315')).toEqual([]);
        expect(disclosuresAsOf(undefined, '20240315')).toEqual([]);
    });
});

describe('attentionAt — 관찰-only 현저성', () => {
    const rising = mkSeries(120, i => 10000 + i * 50);

    it('unrl·stake 컴포넌트는 항상 0 — 사용자 포지션은 시장 사건성이 아니다', () => {
        const a = attentionAt(rising.slice(0, 100), null, rising[99].date);
        expect(a.components.unrl).toBe(0);
        expect(a.components.stake).toBe(0);
        expect(OBSERVATION_ONLY.held).toBe(false);
    });

    it('공시가 없으면 salience == moveOnly (disc=0)', () => {
        const a = attentionAt(rising.slice(0, 100), null, rising[99].date);
        expect(a.discCount).toBe(0);
        expect(a.components.disc).toBe(0);
        expect(a.salience).toBe(a.moveOnly);
    });

    it('접두 길이에 의존하지 않는다 — 꼬리만 넘겨도 같은 값', () => {
        // computePriceStats는 뒤에서부터 고정 개수만 본다(ret5d=마지막 W+1, volSurge=마지막 21).
        // computeTechnicalFromHistory(MACD 루프가 length 의존)와 다른 성질 — 이 가정을 고정한다.
        const t = rising[99].date;
        const full = attentionAt(rising.slice(0, 100), null, t);
        const tail = attentionAt(rising.slice(70, 100), null, t);
        expect(tail.salience).toBe(full.salience);
        expect(tail.ret5d).toBe(full.ret5d);
        expect(tail.volSurge).toBe(full.volSurge);
    });

    it('누수 차단 — t 이후 봉을 조작해도 값이 불변', () => {
        const t = rising[99].date;
        const base = attentionAt(rising.slice(0, 100), null, t);
        const tampered = rising.map((b, i) => (i >= 100 ? { ...b, price: b.price * 5, volume: b.volume * 99 } : b));
        expect(attentionAt(tampered.slice(0, 100), null, t).salience).toBe(base.salience);
    });

    it('비공회전 — 창 안(최근 5거래일)을 바꾸면 값이 달라진다', () => {
        const t = rising[99].date;
        const base = attentionAt(rising.slice(0, 100), null, t);
        const tampered = rising.map((b, i) => (i > 94 && i < 100 ? { ...b, price: b.price * 2 } : b));
        expect(attentionAt(tampered.slice(0, 100), null, t).salience).not.toBe(base.salience);
    });

    it('|5거래일 수익률|만 본다 — 크기가 같으면 현저성도 같다', () => {
        // ⚠️ 선형 가격 경로(10000 ± i·100)로는 **퍼센트가 대칭이 아니다** — 분모가 달라서
        //    +3.5% vs −8.9%가 나온다. 정확히 ±10%를 만들려면 기준선을 평평하게 두고
        //    마지막 봉만 움직여야 한다(ret5d = 마지막 vs 6번째 뒤 종가).
        const flat = (last: number) => mkSeries(50, i => (i === 49 ? last : 10000));
        const up = flat(11000);
        const down = flat(9000);
        const u = attentionAt(up, null, up[49].date);
        const d = attentionAt(down, null, down[49].date);
        expect(u.ret5d).toBe(10);
        expect(d.ret5d).toBe(-10);
        // 방향은 점수에서 배제된다(R1 — 크기만) → 두 컴포넌트가 **정확히** 같아야 한다
        expect(u.components.move).toBe(d.components.move);
        expect(u.salience).toBe(d.salience);
    });

    it('공시가 붙으면 salience가 moveOnly보다 크다 (noisy-OR)', () => {
        const t = rising[99].date;
        const disc: Disc[] = [{ rcept_dt: t, category: 'dividend' }];
        const a = attentionAt(rising.slice(0, 100), disc, t);
        expect(a.discCount).toBe(1);
        expect(a.components.disc).toBeGreaterThan(0);
        expect(a.salience).toBeGreaterThan(a.moveOnly);
    });

    it('discOnly는 가격을 안 본다 — move 컴포넌트 0', () => {
        const t = rising[99].date;
        const disc: Disc[] = [{ rcept_dt: t, category: 'merger' }];
        const a = attentionAt(rising.slice(0, 100), disc, t);
        const expected = scoreItem({ held: false, ret5d: null, discEvents: [{ category: 'merger', daysAgo: 0 }] }, ATTENTION_CONSTANTS).score;
        expect(a.discOnly).toBe(expected);
    });

    it('프로덕션 scoreItem을 그대로 쓴다 — 규칙 복제 0', () => {
        const t = rising[99].date;
        const a = attentionAt(rising.slice(0, 100), null, t);
        const direct = scoreItem({ held: false, ret5d: a.ret5d, discEvents: [] }, ATTENTION_CONSTANTS).score;
        expect(a.salience).toBe(direct);
    });

    it('DART 없이도 동작한다 (robust)', () => {
        const t = rising[99].date;
        for (const d of [null, undefined, []]) {
            const a = attentionAt(rising.slice(0, 100), d as Disc[] | null, t);
            expect(Number.isFinite(a.salience)).toBe(true);
            expect(a.discCount).toBe(0);
        }
    });

    it('표본이 짧아 ret5d를 못 구하면 move=0 (억지 값 없음)', () => {
        const short = mkSeries(3, i => 10000 + i);
        const a = attentionAt(short, null, short[2].date);
        expect(a.ret5d).toBeNull();
        expect(a.components.move).toBe(0);
    });
});

describe('absTarget — 부호를 버린다', () => {
    it('|return|을 돌려준다', () => {
        expect(absTarget(0.05)).toBe(0.05);
        expect(absTarget(-0.05)).toBe(0.05);
        expect(absTarget(0)).toBe(0);
    });

    it('같은 크기의 상승·하락이 같은 target을 만든다 — 방향 정보 소거', () => {
        expect(absTarget(0.12)).toBe(absTarget(-0.12));
    });

    it('비유한값은 null', () => {
        expect(absTarget(null as unknown as number)).toBeNull();
        expect(absTarget(NaN)).toBeNull();
        expect(absTarget(Infinity)).toBeNull();
    });
});

// ── 측정 체인 양성 대조 ─────────────────────────────────────────
//
// "양(+) IC가 좋은 결과"라는 해석이 성립하려면, 현저성이 실제로 |move|를 끌 때
// 파이프라인이 그걸 **양수로 잡아내야** 한다. 합성 패널로 그 감도를 고정한다.
// (이게 없으면 라이브에서 0이 나왔을 때 "신호가 없다"인지 "배선이 틀렸다"인지 못 가른다.)
import { groupByDate, computeIC } from '@/scripts/backtest/ic.mjs';

describe('측정 체인 — |return| target에서 양(+) 신호를 잡아내는가', () => {
    // 결정적 의사난수(Math.random 금지 — 재현성).
    const rng = (seed: number) => () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };

    function panel(coupled: boolean) {
        const rand = rng(20260818);
        const rows: Array<{ date: string; salience: number; a20: number }> = [];
        for (let d = 0; d < 60; d++) {
            const date = `2024${String(1 + (d % 12)).padStart(2, '0')}${String(1 + (d % 28)).padStart(2, '0')}`;
            for (let k = 0; k < 30; k++) {
                const salience = rand();
                // coupled: 현저성이 높을수록 |수익률|이 크다(+잡음). 아니면 독립.
                const a20 = coupled ? salience * 0.10 + rand() * 0.04 : rand() * 0.10;
                rows.push({ date, salience, a20 });
            }
        }
        return rows;
    }

    const ic = (rows: ReturnType<typeof panel>) =>
        computeIC(groupByDate(rows, 'salience', 'a20'), { minCrossSection: 10, lag: 3 }).mean;

    it('현저성이 |move|를 끌면 뚜렷한 양(+) IC', () => {
        const m = ic(panel(true));
        expect(m).toBeGreaterThan(0.4);
    });

    it('독립이면 IC ≈ 0 — 위 양성이 자동 통과가 아님을 확인', () => {
        expect(Math.abs(ic(panel(false)))).toBeLessThan(0.1);
    });
});
