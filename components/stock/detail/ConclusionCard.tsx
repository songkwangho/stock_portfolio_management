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
    <Card variant="primary" padding="base" accentBar="neutral">
      {/* 요약문만. 판정 뱃지는 두 축 모두 제거됐다.
          N3 — 내 종목 상태(holding_opinion) 뱃지(주의 필요/추가 검토/관망): 라벨 자체가 방향 지시.
          M1 — market_opinion "시장 분석" 뱃지(긍정적/중립적/부정적): 여러 관점을 하나로 뭉친
               매수 판정을 통보하는 것이라 제거(R2). 판단 근거는 [요약] 탭의 관점별 풀이와
               균형 요약이 제공하고, 종합은 사용자가 한다.
          accentBar도 opinion 색(rise/fall)을 쓰면 **색으로 같은 판정을 전달**하므로 neutral 고정.
          카드 위계(primary)는 유지 — 강조는 하되 방향은 말하지 않는다. */}
      <p className="text-base font-bold text-ink leading-relaxed mb-3">
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
