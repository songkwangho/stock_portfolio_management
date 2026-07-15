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
      padding="emphasis"
      accentBar={
        stockDetail.market_opinion === '긍정적' ? 'positive' :
        stockDetail.market_opinion === '부정적' ? 'negative' : 'neutral'
      }
      className="mb-6"
    >
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
        📋 이 종목 한 줄 요약
      </p>
      <p className="text-base font-bold text-white mb-3 leading-relaxed">
        {generateStockSummary(stockDetail, isHolding, holdingMatch)}
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
          stockDetail.market_opinion === '긍정적'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : stockDetail.market_opinion === '부정적'
            ? 'bg-red-500/10 text-red-400 border-red-500/20'
            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        }`}>
          📊 시장 분석: {stockDetail.market_opinion || '분석 중'}
        </span>
        {isHolding && stockDetail.holding_opinion && (
          <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
            stockDetail.holding_opinion === '매도'
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : stockDetail.holding_opinion === '관망'
              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              : stockDetail.holding_opinion === '추가매수'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
          }`}>
            💼 내 종목 상태: {
              stockDetail.holding_opinion === '매도' ? '주의 필요' :
              stockDetail.holding_opinion === '추가매수' ? '추가 검토' :
              stockDetail.holding_opinion
            }
          </span>
        )}
      </div>
      <div className="border-t border-slate-700/50 pt-3">
        <p className="text-xs font-bold text-slate-400 mb-2">지금 할 수 있는 것</p>
        <div className="space-y-1.5">
          {generateActionGuide(stockDetail, isHolding).map((action, i) => (
            <div key={i} className="flex items-start space-x-2">
              <span className="text-slate-500 text-xs mt-0.5 shrink-0">{i + 1}.</span>
              <p className="text-xs text-slate-300 leading-relaxed">{action}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-600 mt-3 leading-relaxed">
        ※ 위 내용은 알고리즘 분석 결과예요. 실제 투자 결정은 본인이 직접 하시고,
        거래는 증권사 앱에서 진행해 주세요.
      </p>
    </Card>
  );
}
