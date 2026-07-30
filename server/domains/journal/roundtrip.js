// 4.5b차 — FIFO 라운드트립 매칭 + 실현손익 요약 (순수, DB 접근 없음).
// 종목별 매수 lot ↔ 매도 체결을 선입선출로 매칭해 청산거래(roundtrip)를 만든다.
// 실현손익 기준: 아직 안 판 보유분은 포함하지 않는다.

// 'YYYY-MM-DD' 두 날짜 사이 일수 (UTC 기준, 같은 날=0).
function daysBetween(a, b) {
    const ms = Date.parse(b) - Date.parse(a);
    return Math.round(ms / 86400000);
}

// Trade[] → Roundtrip[]
// Roundtrip = { code, buyDate, sellDate, quantity, buyPrice, sellPrice, holdingDays, pnl, pnlRate }
export function computeRoundtrips(trades) {
    const byCode = {};
    for (const t of trades) (byCode[t.code] ||= []).push(t);

    const roundtrips = [];
    for (const list of Object.values(byCode)) {
        // 날짜 오름차순, 같은 날은 매수를 먼저 (당일 매수분이 당일 매도에 매칭되도록).
        const sorted = [...list].sort((a, b) => {
            if (a.tradedAt !== b.tradedAt) return a.tradedAt < b.tradedAt ? -1 : 1;
            if (a.side === b.side) return 0;
            return a.side === 'buy' ? -1 : 1;
        });
        const lots = [];   // FIFO 큐: { date, price, remaining }
        for (const t of sorted) {
            const price = Number(t.price);
            if (t.side === 'buy') {
                lots.push({ date: t.tradedAt, price, remaining: t.quantity });
                continue;
            }
            // 매도 → 앞선 lot부터 소진
            let qty = t.quantity;
            while (qty > 0 && lots.length > 0) {
                const lot = lots[0];
                const m = Math.min(qty, lot.remaining);
                const pnl = (price - lot.price) * m;
                roundtrips.push({
                    code: t.code,
                    buyDate: lot.date,
                    sellDate: t.tradedAt,
                    quantity: m,
                    buyPrice: lot.price,
                    sellPrice: price,
                    holdingDays: daysBetween(lot.date, t.tradedAt),
                    pnl,
                    pnlRate: lot.price > 0 ? ((price - lot.price) / lot.price) * 100 : 0,
                });
                lot.remaining -= m;
                qty -= m;
                if (lot.remaining <= 0) lots.shift();
            }
            // qty>0 잔여 = 매수기록 없는 매도(공매도/이관 등) → 매칭 불가로 skip
        }
    }
    return roundtrips;
}

const round1 = (n) => Math.round(n * 10) / 10;
const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

// Roundtrip[] → 요약 지표 (전부 실현손익 기준).
export function summarize(roundtrips) {
    const n = roundtrips.length;
    if (n === 0) {
        return { roundtripCount: 0, winRate: null, avgHoldWin: null, avgHoldLoss: null, profitFactor: null, maxDrawdown: 0, totalPnl: 0 };
    }
    const wins = roundtrips.filter(r => r.pnl > 0);
    const losses = roundtrips.filter(r => r.pnl < 0);
    const decided = wins.length + losses.length;

    const grossProfit = wins.reduce((s, r) => s + r.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, r) => s + r.pnl, 0));

    // 낙폭(MDD) — 청산 시점(sellDate) 순 누적 실현손익 곡선의 최대 고점→저점 낙폭.
    const chrono = [...roundtrips].sort((a, b) => (a.sellDate < b.sellDate ? -1 : a.sellDate > b.sellDate ? 1 : 0));
    let cum = 0, peak = 0, mdd = 0;
    for (const r of chrono) { cum += r.pnl; if (cum > peak) peak = cum; if (peak - cum > mdd) mdd = peak - cum; }

    const winHold = avg(wins.map(r => r.holdingDays));
    const lossHold = avg(losses.map(r => r.holdingDays));

    return {
        roundtripCount: n,
        winRate: decided > 0 ? round1((wins.length / decided) * 100) : null,
        avgHoldWin: winHold == null ? null : round1(winHold),
        avgHoldLoss: lossHold == null ? null : round1(lossHold),
        profitFactor: grossLoss > 0 ? round1(grossProfit / grossLoss) : null,   // 손실 없으면 null(무한대 대신)
        maxDrawdown: Math.round(mdd),   // 원
        totalPnl: Math.round(cum),
    };
}
