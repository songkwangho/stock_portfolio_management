'use client';

import type { StockDetail } from '@/types/stock';

// 상세분석 분리 (3.13 탭 재편 PART 1) — 상세 버전([차트·지표] 탭).
// 사이드바의 "상세 분석"(stockDetail.analysis) + 면책을 이동만. 텍스트/로직/색 변경 없음.
interface AnalysisDetailProps {
  stockDetail: StockDetail | null;
  name: string;
}

export default function AnalysisDetail({ stockDetail, name }: AnalysisDetailProps) {
  return (
    <div className="bg-surface border border-line rounded-xl p-6">
      <p className="font-bold text-ink mb-2">상세 분석</p>
      <p className="text-sm text-muted leading-relaxed">
        {stockDetail?.analysis || `${name}에 대한 시장 데이터와 기술적 지표를 종합적으로 분석하고 있습니다.`}
      </p>
      <p className="text-xs text-faint mt-4 pt-3 border-t border-line leading-relaxed">
        이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다. 모든 투자에는 원금 손실 위험이 있습니다.
      </p>
    </div>
  );
}
