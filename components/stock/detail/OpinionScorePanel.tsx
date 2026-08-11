'use client';

import ScoringBreakdownPanel from '@/components/stock/ScoringBreakdownPanel';
import type { StockDetail } from '@/types/stock';

// 항목별 점수 카드 — 밸류에이션/기술지표/수급/추세 4개 지표바.
// B1에서 총점(N/10)과 등급 라벨(긍정적/중립적/부정적)을 제거했다 — 하나로 합친 판정을 통보하지 않는다.
// 남은 건 항목별 재료 분포이고, 종합은 InterpretationPanel의 균형 요약이 담당한다.
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
