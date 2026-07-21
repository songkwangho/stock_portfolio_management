'use client';

import ScoringBreakdownPanel from '@/components/stock/ScoringBreakdownPanel';
import type { StockDetail } from '@/types/stock';

// 종합점수 카드 — 종합점수 N/10 + 4대 지표바 (3.13 판정 뱃지 이동: 상단 "보유" 줄은 결론 카드로 이관).
// 점수 우측 등급 라벨(중립적 등)은 ScoringBreakdownPanel 내부에 유지 — 점수 등급이지 판정 뱃지가 아님.
interface OpinionScorePanelProps {
  stockDetail: StockDetail | null;
}

export default function OpinionScorePanel({ stockDetail }: OpinionScorePanelProps) {
  if (!stockDetail?.scoringBreakdown) return null;
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <ScoringBreakdownPanel breakdown={stockDetail.scoringBreakdown} bare />
    </div>
  );
}
