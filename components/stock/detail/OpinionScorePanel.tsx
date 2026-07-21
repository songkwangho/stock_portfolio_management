'use client';

import ScoringBreakdownPanel from '@/components/stock/ScoringBreakdownPanel';
import type { StockSummary, StockDetail } from '@/types/stock';

// 종합점수(의견 통합) — 내 종목 상태(보유 시) + 종합점수 N/10 + 4대 지표바를 한 카드로 (3.13 밀도 2차 TASK 2).
// 시장 의견(중립적/긍정/부정)은 ScoringBreakdownPanel의 점수 라벨과 중복이라 생략.
// Signal Score는 우측 컬럼으로 이동(셸). 색/수치/텍스트는 원본 유지.
interface OpinionScorePanelProps {
  stock: StockSummary;
  stockDetail: StockDetail | null;
  isHolding: boolean;
}

export default function OpinionScorePanel({ stock, stockDetail, isHolding }: OpinionScorePanelProps) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
      {/* 내 종목 상태 (보유 시). 시장 의견은 아래 종합점수 라벨과 중복이라 생략 */}
      {isHolding && stock.avgPrice && (() => {
        const ho = stockDetail?.holding_opinion || '보유';
        const display = ho === '매도' ? '주의 필요' : ho === '추가매수' ? '추가 검토' : ho;
        return (
          <div className="flex items-center gap-1.5">
            <span className={`text-lg font-black px-3 py-1 rounded-lg border ${
              ho === '매도' ? 'bg-fall/10 text-fall border-fall/20' :
              ho === '관망' ? 'bg-caution/10 text-caution border-caution/20' :
              ho === '추가매수' ? 'bg-rise/10 text-rise border-rise/20' :
              'bg-inset text-muted border-line'
            }`}>{display}</span>
            <span className="text-xs text-faint">내 종목 상태</span>
          </div>
        );
      })()}

      {/* 종합점수 + 4대 지표바 (bare — 상위 카드에 병합, 중첩 방지) */}
      {stockDetail?.scoringBreakdown && (
        <ScoringBreakdownPanel breakdown={stockDetail.scoringBreakdown} bare />
      )}
    </div>
  );
}
