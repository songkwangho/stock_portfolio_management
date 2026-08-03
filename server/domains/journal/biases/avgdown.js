// C-3차 — 평단 하향 추가매수 관찰: 하락한 뒤 재매수로 평단을 낮춘 매수를 중립 사실로 집계.
// ⚠️ "편향/물타기" 명명 금지 — metrics·flag만 반환, 한국어 관찰형 풀이는 프론트 interpret.
// 정의(못박기): 종목별 매수를 시간순 처리, **매수만으로 러닝 평단 유지(매도는 평단 미변경)**.
//   각 매수가 < 직전 러닝 평단 이면 '평단 하향 추가매수' 이벤트. 종목 첫 매수는 제외(비교 대상 없음).

const PER_STOCK_MIN = 2;   // ⚠️ 임시(미검증): 한 종목에서 이 횟수 이상이면 flag

export function avgdown(trades) {
    const byCode = {};
    for (const t of trades) (byCode[t.code] ||= []).push(t);

    let count = 0;          // 평단 하향 추가매수 이벤트 총수
    let evaluableBuys = 0;  // 비교 가능한(첫 매수 이후) 매수 수
    const perCode = {};     // code → 이벤트 수

    for (const [code, list] of Object.entries(byCode)) {
        const sorted = [...list].sort((a, b) => (a.tradedAt < b.tradedAt ? -1 : a.tradedAt > b.tradedAt ? 1 : 0));
        let qty = 0, cost = 0;   // 매수 누적(매도 미반영 — 평단 미변경)
        for (const t of sorted) {
            if (t.side !== 'buy') continue;
            if (qty > 0) {
                evaluableBuys++;
                const avg = cost / qty;   // 직전 러닝 평단
                if (Number(t.price) < avg) { count++; perCode[code] = (perCode[code] || 0) + 1; }
            }
            qty += t.quantity;
            cost += Number(t.price) * t.quantity;
        }
    }

    if (evaluableBuys === 0) return { key: 'avgdown', available: false };
    return {
        key: 'avgdown',
        available: true,
        count,
        evaluableBuys,
        codes: Object.keys(perCode),
        thresholds: { perStockMin: PER_STOCK_MIN, provisional: true },
        flag: Object.values(perCode).some(c => c >= PER_STOCK_MIN),
    };
}
