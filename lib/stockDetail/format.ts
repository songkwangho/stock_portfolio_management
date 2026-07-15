// 종목 상세 포맷터 (3.12차 S1에서 page.tsx로부터 분리). 본문 동일 — 이동만.

// 거래량 한국식 단위 (억/만). "한눈에 보기" 그리드에서 사용.
export function formatVol(v: number): string {
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
    if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
    return v.toLocaleString();
}
