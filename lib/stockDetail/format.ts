// 종목 상세 포맷터 (3.12차 S1에서 page.tsx로부터 분리). 본문 동일 — 이동만.

// 거래량 한국식 단위 (억/만). "한눈에 보기" 그리드에서 사용.
export function formatVol(v: number): string {
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
    if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
    return v.toLocaleString();
}

// 비중(%) 표시 — recalcWeights가 정수 반올림(Math.round)해 저장하므로 1% 미만이 0%로 뭉개진다 (3.13 TASK 1).
// 평가액이 있는데 "0%"는 오정보 → 표시 측에서 정밀 비중(float)을 넘겨 포맷만 담당한다.
// recalcWeights 계산은 미변경. 0<w<1 → "<1%", 그 외 반올림.
export function formatWeight(w: number | null | undefined): string {
    const v = w ?? 0;
    if (v > 0 && v < 1) return '<1%';
    return `${Math.round(v)}%`;
}
