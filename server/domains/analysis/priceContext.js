// Phase A(A3) — 가격 변동·위치의 원시 사실. 순수 모듈(DB 접근 없음) → 단위 테스트 대상.
//
// 안전(계산-문구 일치): **표본 수를 함께 돌려준다.** 기존 StatsGrid가 40행짜리 history로
// "52주 최고/최저"를 표시하던 것 같은 거짓 라벨을 막기 위해서다 — 프론트는 days를 보고
// '최근 1년'이라 부를지 '최근 N거래일'이라 부를지 정한다.
//
// 변동성은 방향이 아니라 **리스크 정보**다(좋다/나쁘다 아님). 임계값은 전부 provisional.

const VOL_WINDOW = 20;        // 일간 변동성 표본(거래일). 5일은 노이즈가 커서 서술 근거로 약하다.
const RANGE_WINDOW = 250;     // 52주 ≈ 250거래일
const RANGE_MIN_DAYS = 200;   // 이보다 적으면 '1년'이라 부르지 않는다(프론트 판단용 기준)

export const PRICE_CONTEXT_CONSTANTS = { VOL_WINDOW, RANGE_WINDOW, RANGE_MIN_DAYS };

// closesChrono: 오래된→최신 순 종가 배열 → { volatility, range }
//   volatility: { dailyPct, days } — 일간 수익률 표준편차(%). 표본 부족이면 null.
//   range:      { high, low, positionPct, days } — 최근 RANGE_WINDOW 거래일 범위 내 현재가 위치.
export function computePriceContext(closesChrono) {
    const closes = (closesChrono || []).filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (closes.length === 0) return { volatility: null, range: null };

    // ── 일간 변동성(모표준편차 × 100) ──
    let volatility = null;
    const volSlice = closes.slice(-(VOL_WINDOW + 1));
    if (volSlice.length >= 6) {   // 최소 5개 수익률
        const returns = [];
        for (let i = 1; i < volSlice.length; i++) returns.push((volSlice[i] - volSlice[i - 1]) / volSlice[i - 1]);
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
        volatility = { dailyPct: Number((Math.sqrt(variance) * 100).toFixed(2)), days: returns.length };
    }

    // ── 기간 내 고저 + 현재가 위치 ──
    const rangeSlice = closes.slice(-RANGE_WINDOW);
    const high = Math.max(...rangeSlice);
    const low = Math.min(...rangeSlice);
    const current = closes[closes.length - 1];
    const range = {
        high, low, days: rangeSlice.length,
        // 고가=저가(무변동 구간)면 위치를 정의할 수 없다 → null.
        positionPct: high > low ? Math.round(((current - low) / (high - low)) * 100) : null,
    };

    return { volatility, range };
}
