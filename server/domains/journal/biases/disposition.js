// 4.5b차 — 처분효과(disposition effect): 이익 종목은 빨리 팔고 손실 종목은 오래 들고 있는 경향.
// 판단 아님 — 이익/손실 청산의 "평균 보유일" 두 숫자를 사실로 산출. 텍스트는 프론트 interpret이 생성.
// metrics만 반환. flag는 손실 평균보유 > 이익 평균보유 (경향 관찰용 논리 구분, UI 색 아님).

export function disposition(roundtrips) {
    const wins = roundtrips.filter(r => r.pnl > 0);
    const losses = roundtrips.filter(r => r.pnl < 0);
    if (wins.length === 0 || losses.length === 0) {
        return { key: 'disposition', available: false };
    }
    const avg = (arr) => Math.round((arr.reduce((s, r) => s + r.holdingDays, 0) / arr.length) * 10) / 10;
    const winnerAvgHold = avg(wins);
    const loserAvgHold = avg(losses);
    return {
        key: 'disposition',
        available: true,
        winnerAvgHold,
        loserAvgHold,
        winnerCount: wins.length,
        loserCount: losses.length,
        gap: Math.round((loserAvgHold - winnerAvgHold) * 10) / 10,
        flag: loserAvgHold > winnerAvgHold,
    };
}
