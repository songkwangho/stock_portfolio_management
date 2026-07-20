'use client';

import type { StockDetail } from '@/types/stock';

// 상세분석 분리 (3.13 탭 재편 PART 1) — 짧은 버전([요약] 탭).
// 사이드바의 "알고리즘 분석 요약"(stockDetail.advice)을 이동만. 텍스트/로직/색 변경 없음.
interface AnalysisSummaryProps {
  stockDetail: StockDetail | null;
}

export default function AnalysisSummary({ stockDetail }: AnalysisSummaryProps) {
  return (
    <div className="bg-surface border border-line rounded-xl p-6">
      <p className="font-bold text-ink mb-2">알고리즘 분석 요약</p>
      <p className="text-sm text-muted leading-relaxed">
        {stockDetail?.advice || '현재 시점에서는 시장 변동성을 고려한 신중한 접근이 필요합니다.'}
      </p>
    </div>
  );
}
