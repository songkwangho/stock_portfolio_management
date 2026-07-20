'use client';

import ScoringBreakdownPanel from '@/components/stock/ScoringBreakdownPanel';
import type { StockSummary, StockDetail } from '@/types/stock';

// 종합의견 + 종합점수(4대 지표바) + Signal Score (3.13 탭 재편 PART 2).
// 사이드바에서 [요약] 탭으로 이동 — 풀폭이라 지표바 옹색함 해소.
// 마크업/색/텍스트/로직은 사이드바 원본과 동일 (조립 위치만 변경).
interface OpinionScorePanelProps {
  stock: StockSummary;
  stockDetail: StockDetail | null;
  isHolding: boolean;
  signalScore: number;
}

export default function OpinionScorePanel({ stock, stockDetail, isHolding, signalScore }: OpinionScorePanelProps) {
  return (
    <div className="space-y-4">
      {/* 종합 의견 */}
      <div className="bg-surface border border-line rounded-xl p-6">
        <p className="text-xs text-faint mb-3 font-bold">종합 의견</p>
        <div className="flex items-center gap-3 flex-wrap gap-y-2">
          {/* Market Opinion (시장 기준) */}
          <div className="flex items-center gap-1.5">
            <span className={`text-lg font-black px-3 py-1 rounded-lg inline-flex items-center ${
              stockDetail?.market_opinion === '긍정적' ? 'bg-rise/10 text-rise' :
              stockDetail?.market_opinion === '부정적' ? 'bg-fall/10 text-fall' : 'bg-inset text-muted'
            }`}>
              {stockDetail?.market_opinion || '분석 중'}
            </span>
            <span className="text-xs text-faint">시장 분석</span>
          </div>
          {/* Holding Opinion (보유 기준, 보유 시에만) — 명령어 → 상태 라벨 변환 */}
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
        </div>
        <p className="text-xs text-faint mt-2 leading-relaxed">
          알고리즘 분석 결과로, 이것은 투자 추천이 아니에요. 점수와 의견은 참고용으로만 봐주세요.
        </p>
      </div>

      {/* 종합점수 + 4대 지표바 (풀폭) */}
      {stockDetail?.scoringBreakdown && (
        <ScoringBreakdownPanel breakdown={stockDetail.scoringBreakdown} />
      )}

      {/* Signal Score (종합점수 옆) */}
      <div className="bg-surface border border-line rounded-xl p-6">
        <p className="text-xs text-faint mb-1 text-center">Signal Score</p>
        <div className="text-3xl font-black text-center text-ink tabular-nums">{signalScore}</div>
        <p className="text-xs text-faint text-center mt-1">종합 신호 점수 (0~100)</p>
        <p className="text-xs text-muted text-center mt-2 leading-relaxed max-w-md mx-auto">
          위 시장 분석 10점 점수에 목표가 괴리·이평선·변동성을 더해 0~100으로 환산한 보조 지표예요.
        </p>
        <p className="text-xs text-caution text-center mt-1 leading-relaxed">
          실제 상승 확률이 아니에요.
        </p>
      </div>
    </div>
  );
}
