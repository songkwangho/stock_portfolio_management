'use client';

import type { SectorComparison } from '@/types/stock';

// 같은 업종 비교 (3.12차 S3 분리 → 3.13 탭 재편 TASK 3: 아코디언 제거, 항상 펼침).
// 스크롤-투-현재행 effect도 제거 — 탭 진입 시 항상 렌더돼 페이지가 점프하는 회귀 방지.
// 현재 종목은 bg-inset 하이라이트 + "← 현재" 마커로 식별.
interface SectorCompareProps {
  sectorData: SectorComparison | null;
  currentCode: string;
}

export default function SectorCompare({ sectorData, currentCode }: SectorCompareProps) {
  if (!sectorData || sectorData.stocks.length <= 1) return null;

  // 현재 종목의 업종 내 백분위 계산 — "나는 어디 위치인가" 맥락 제공
  const me = sectorData.stocks.find(s => s.code === currentCode);
  const computePercentile = (key: 'per' | 'pbr' | 'roe', lowerIsBetter: boolean) => {
    const myVal = me?.[key];
    if (myVal === null || myVal === undefined) return null;
    const others = sectorData.stocks.map(s => s[key]).filter((v): v is number => v !== null && v !== undefined && v > 0);
    if (others.length < 2) return null;
    const sorted = [...others].sort((a, b) => a - b);
    const rank = sorted.findIndex(v => v >= myVal); // 0-indexed
    const pct = Math.round((rank / sorted.length) * 100); // 하위 N%
    return lowerIsBetter ? pct : 100 - pct; // PER/PBR은 낮을수록 좋음
  };
  const perPct = computePercentile('per', true);
  const pbrPct = computePercentile('pbr', true);
  const roePct = computePercentile('roe', false);
  const interpret = (pct: number | null, label: string) => {
    if (pct === null) return null;
    const tier = pct <= 25 ? '상위 25%' : pct <= 50 ? '상위 50%' : pct <= 75 ? '하위 50%' : '하위 25%';
    const tone = pct <= 50 ? '우수한 편' : '주의 필요';
    return `${label}: 업종 내 ${tier} (${tone})`;
  };
  return (
    <div className="bg-surface border border-line rounded-xl p-6">
      <h3 className="text-lg font-semibold text-ink mb-2">같은 업종 비교</h3>
      <p className="text-xs text-muted mb-3">
        <span className="text-ink font-bold">{sectorData.category}</span> 업종 중앙값과 비교해요.
        PER이 중앙값보다 낮고 ROE가 높으면 좋아요!
      </p>
      {/* 업종 내 백분위 요약 — 평균값 비교보다 직관적 */}
      {(perPct !== null || pbrPct !== null || roePct !== null) && (
        <div className="mb-4 p-3 bg-inset border border-line rounded-xl space-y-1">
          <p className="text-xs font-bold text-ink mb-1">이 종목의 업종 내 위치</p>
          {perPct !== null && <p className="text-xs text-muted">{interpret(perPct, 'PER')}</p>}
          {pbrPct !== null && <p className="text-xs text-muted">{interpret(pbrPct, 'PBR')}</p>}
          {roePct !== null && <p className="text-xs text-muted">{interpret(roePct, 'ROE')}</p>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-inset border border-line rounded-xl">
        <div className="text-center">
          <p className="text-xs text-muted mb-1">업종 중앙값 PER</p>
          <p className="text-sm font-bold text-ink tabular-nums">{sectorData.medians.per}배</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted mb-1">업종 중앙값 PBR</p>
          <p className="text-sm font-bold text-ink tabular-nums">{sectorData.medians.pbr}배</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted mb-1">업종 중앙값 ROE</p>
          <p className="text-sm font-bold text-ink tabular-nums">{sectorData.medians.roe}%</p>
        </div>
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line-strong">
              <th className="text-left py-2 px-3 text-xs text-muted font-bold">종목</th>
              <th className="text-right py-2 px-3 text-xs text-muted font-bold">PER</th>
              <th className="text-right py-2 px-3 text-xs text-muted font-bold">PBR</th>
              <th className="text-right py-2 px-3 text-xs text-muted font-bold">ROE</th>
            </tr>
          </thead>
          <tbody>
            {sectorData.stocks.map(s => {
              const isCurrent = s.code === currentCode;
              return (
                <tr
                  key={s.code}
                  className={`border-b border-line ${isCurrent ? 'bg-inset' : ''}`}
                >
                  <td className="py-2 px-3">
                    <span className={isCurrent ? 'text-ink font-bold' : 'text-ink'}>{s.name}</span>
                    {isCurrent && <span className="text-xs text-muted ml-1">← 현재</span>}
                  </td>
                  <td className="text-right py-2 px-3">
                    <span className="text-ink tabular-nums">{s.per || '---'}</span>
                  </td>
                  <td className="text-right py-2 px-3">
                    <span className="text-ink tabular-nums">{s.pbr || '---'}</span>
                  </td>
                  <td className="text-right py-2 px-3">
                    <span className="text-ink tabular-nums">{s.roe ? `${s.roe}%` : '---'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
