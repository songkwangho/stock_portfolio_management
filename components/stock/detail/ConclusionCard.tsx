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
      {/* 라벨(자명)·의견 뱃지(종합점수와 중복) 제거 → 요약문 + 행동스텝 + 면책 3덩어리 (3.13 밀도 2차 TASK 1) */}
      <p className="text-base font-bold text-ink mb-3 leading-relaxed">
        {generateStockSummary(stockDetail, isHolding, holdingMatch)}
      </p>
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
