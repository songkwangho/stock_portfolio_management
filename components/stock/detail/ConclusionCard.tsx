'use client';

import Card from '@/components/ui/Card';
import { generateStockSummary, generateActionGuide } from '@/lib/stockDetail/summary';
import type { StockDetail, Holding } from '@/types/stock';

// 결론 카드 (3.12차 S3 분리). 본문 이동만.
interface ConclusionCardProps {
  stockDetail: StockDetail;
  isHolding: boolean;
  holdingMatch?: Holding;
}

export default function ConclusionCard({ stockDetail, isHolding, holdingMatch }: ConclusionCardProps) {
  return (
    <Card
      variant="primary"
      padding="base"
      accentBar={
        stockDetail.market_opinion === '긍정적' ? 'positive' :
        stockDetail.market_opinion === '부정적' ? 'negative' : 'neutral'
      }
    >
      {/* 요약문 + 시장 분석 뱃지(우상단). 데스크톱: 좌 요약문 / 우 뱃지. 모바일: 뱃지가 아래로 wrap.
          N3 — 내 종목 상태(holding_opinion) 판정 뱃지(주의 필요/추가 검토/관망)는 제거했다.
          라벨 자체가 방향 지시라, 5·20일 평균 가격 위치를 푼 요약문(generateStockSummary)이 그 자리를 대신한다.
          market_opinion "시장 분석" 뱃지는 별 축이라 이번 범위 밖 — 그대로 둔다. */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2 lg:gap-4 mb-3">
        <p className="text-base font-bold text-ink leading-relaxed lg:flex-1 lg:min-w-0">
          {generateStockSummary(stockDetail, isHolding, holdingMatch)}
        </p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
            stockDetail.market_opinion === '긍정적' ? 'bg-rise/10 text-rise border-rise/20' :
            stockDetail.market_opinion === '부정적' ? 'bg-fall/10 text-fall border-fall/20' :
            'bg-inset text-muted border-line'
          }`}>{stockDetail.market_opinion || '분석 중'}</span>
        </div>
      </div>
      <div className="border-t border-line pt-3">
        <p className="text-xs font-bold text-muted mb-2">지금 할 수 있는 것</p>
        <div className="space-y-1.5">
          {generateActionGuide(stockDetail, isHolding).map((action, i) => (
            <div key={i} className="flex items-start space-x-2">
              <span className="text-faint text-xs mt-0.5 shrink-0 tabular-nums">{i + 1}.</span>
              <p className="text-xs text-muted leading-relaxed">{action}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-faint mt-3 leading-relaxed">
        ※ 위 내용은 알고리즘 분석 결과예요. 실제 투자 결정은 본인이 직접 하시고,
        거래는 증권사 앱에서 진행해 주세요.
      </p>
    </Card>
  );
}
