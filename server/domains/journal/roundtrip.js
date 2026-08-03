// 4.5b차 — FIFO 라운드트립 매칭 + 실현손익 요약 (순수, DB 접근 없음).
// 종목별 매수 lot ↔ 매도 체결을 선입선출로 매칭해 청산거래(roundtrip)를 만든다.
// 실현손익 기준: 아직 안 판 보유분은 포함하지 않는다.

// 'YYYY-MM-DD' 두 날짜 사이 일수 (UTC 기준, 같은 날=0).
function daysBetween(a, b) {
    const ms = Date.parse(b) - Date.parse(a);
    return Math.round(ms / 86400000);
}

// Trade[] → { roundtrips: Roundtrip[], unmatched: { sellCount, sellQty }, openLots: OpenLot[] }
// Roundtrip = { code, buyDate, sellDate, quantity, buyPrice, sellPrice, holdingDays, pnl, pnlRate }
// OpenLot   = { code, quantity(잔여합), avgBuyPrice(잔여 가중평균), firstBuyDate }
//
// F2(리뷰): 앞선 매수 lot이 없는 매도분(업로드 구간 이전 보유분의 매도가 대부분)을 집계해
// unmatched로 반환한다. 예전엔 silent skip이라 승률·손익비·MDD가 부분집합으로 계산되는데
// 사용자에게 고지가 없었음 → coverage 투명성 원칙 위반. 이제 호출부가 고지할 수 있게 노출.
// C-2: FIFO 종료 후 미청산 매수 lot = 현재 보유분 → openLots로 반환(호출부가 최근 종가로 미실현 평가).
export function computeRoundtrips(trades) {
    const byCode = {};
    for (const t of trades) (byCode[t.code] ||= []).push(t);

    const roundtrips = [];
    const openLots = [];
    let unmatchedSellCount = 0;
    let unmatchedSellQty = 0;
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
            // qty>0 잔여 = 매수기록 없는 매도(업로드 구간 이전 보유분/이관/공매도) → 매칭 불가.
            // silent skip 대신 집계해 coverage로 고지(F2).
            if (qty > 0) { unmatchedSellCount++; unmatchedSellQty += qty; }
        }
        // C-2: 종목의 미청산 매수 lot = 현재 보유분. 잔여 가중평균가·첫 매수일 집계.
        if (lots.length > 0) {
            const code = list[0].code;
            const quantity = lots.reduce((s, l) => s + l.remaining, 0);
            const cost = lots.reduce((s, l) => s + l.price * l.remaining, 0);
            const firstBuyDate = lots.reduce((min, l) => (l.date < min ? l.date : min), lots[0].date);
            openLots.push({ code, quantity, avgBuyPrice: quantity > 0 ? cost / quantity : 0, firstBuyDate });
        }
    }
    return { roundtrips, unmatched: { sellCount: unmatchedSellCount, sellQty: unmatchedSellQty }, openLots };
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
        realizedLossCount: losses.length,   // C-2: 실현 손실 청산 건수
        winCount: wins.length,              // C-2(리뷰): "전부 이익"은 winCount===roundtripCount일 때만(본전 pnl=0 배제)
        winRate: decided > 0 ? round1((wins.length / decided) * 100) : null,
        avgHoldWin: winHold == null ? null : round1(winHold),
        avgHoldLoss: lossHold == null ? null : round1(lossHold),
        profitFactor: grossLoss > 0 ? round1(grossProfit / grossLoss) : null,   // 손실 없으면 null(무한대 대신)
        maxDrawdown: Math.round(mdd),   // 원
        totalPnl: Math.round(cum),
    };
}

// C-2 — 미청산 보유분(openLots)을 종목별 가격으로 평가 (순수, DB 접근 없음 → 단위테스트 가능).
// priceByCode = { code: { close:number, date:'YYYY-MM-DD'|null } }  (date null = stocks.price 폴백, 날짜 없음)
// 보유일은 **그 종목의 최신 종가 날짜 기준**(폴백이면 전역 asOfDate)으로, Math.max(0,…)로 음수 클램프.
// (리뷰 지적: 전역 asOfDate를 모든 lot에 쓰면 오늘 산 보유분이 어제 종가보다 뒤라 '-1일'이 나옴.)
export function evaluateOpenLots(openLots, priceByCode) {
    const base = { openPositionCount: openLots.length, openLossCount: 0, openLossAvgHoldDays: null, asOfDate: null, unvaluedCount: 0 };
    if (openLots.length === 0) return base;

    // asOfDate = 히스토리로 평가된 종목의 최신 종가 날짜 중 가장 최근('YYYY-MM-DD' 사전순).
    let asOfDate = null;
    for (const o of openLots) {
        const p = priceByCode[o.code];
        if (p && p.date && (!asOfDate || p.date > asOfDate)) asOfDate = p.date;
    }

    let unvalued = 0, lossCount = 0;
    const lossHoldDays = [];
    for (const o of openLots) {
        const p = priceByCode[o.code];
        const cur = p && p.close != null && p.close > 0 ? p.close : null;
        if (cur == null) { unvalued++; continue; }
        if (cur < o.avgBuyPrice) {
            lossCount++;
            const refDate = p.date || asOfDate;   // 종목 최신 종가 날짜(폴백이면 전역)
            if (refDate) lossHoldDays.push(Math.max(0, daysBetween(o.firstBuyDate, refDate)));
        }
    }
    return {
        openPositionCount: openLots.length,
        openLossCount: lossCount,
        openLossAvgHoldDays: lossHoldDays.length ? round1(lossHoldDays.reduce((s, d) => s + d, 0) / lossHoldDays.length) : null,
        asOfDate,
        unvaluedCount: unvalued,
    };
}
