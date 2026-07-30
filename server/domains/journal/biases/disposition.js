// 4.5b차 — 처분효과(disposition effect): 이익 종목은 빨리 팔고 손실 종목은 오래 들고 있는 경향.
// 판단 아님 — 이익/손실 청산의 "평균 보유일" 두 숫자를 사실로 산출. 텍스트는 프론트 interpret이 생성.
// metrics만 반환. flag는 경향 관찰용 논리 구분(UI 색 아님).
//
// F3(리뷰): 사소한 격차(0.1일)·소표본(n=1)에도 명명되던 문제 → 다른 편향처럼 magnitude·표본 문턱 도입.

const MIN_SAMPLE_EACH = 3;   // ⚠️ 임시(미검증): 이익·손실 각 최소 청산 건수
const MIN_GAP_DAYS = 3;      // ⚠️ 임시(미검증): 손실이 이익보다 더 오래 보유한 최소 일수 격차

export function disposition(roundtrips) {
    const wins = roundtrips.filter(r => r.pnl > 0);
    const losses = roundtrips.filter(r => r.pnl < 0);
    if (wins.length === 0 || losses.length === 0) {
        return { key: 'disposition', available: false };
    }
    const avg = (arr) => Math.round((arr.reduce((s, r) => s + r.holdingDays, 0) / arr.length) * 10) / 10;
    const winnerAvgHold = avg(wins);
    const loserAvgHold = avg(losses);
    const gap = Math.round((loserAvgHold - winnerAvgHold) * 10) / 10;
    return {
        key: 'disposition',
        available: true,
        winnerAvgHold,
        loserAvgHold,
        winnerCount: wins.length,
        loserCount: losses.length,
        gap,
        thresholds: { minSampleEach: MIN_SAMPLE_EACH, minGapDays: MIN_GAP_DAYS, provisional: true },
        flag: gap >= MIN_GAP_DAYS && wins.length >= MIN_SAMPLE_EACH && losses.length >= MIN_SAMPLE_EACH,
    };
}
