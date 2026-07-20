'use client';

import { ArrowUpRight, RefreshCw } from 'lucide-react';
import ScoringBreakdownPanel from '@/components/stock/ScoringBreakdownPanel';
import PortfolioAddForm from '@/components/stock/detail/PortfolioAddForm';
import type { StockSummary, StockDetail, AddHoldingPayload } from '@/types/stock';

// 우측 사이드바 — 종합의견/스코어링/상세분석/적정가/추가폼/신호점수/새로고침 (3.12차 S6 분리).
// refresh fetch는 셸이 소유(onRefresh 콜백). computeProbability 결과는 signalScore로 주입.
interface RightSidebarProps {
  stock: StockSummary;
  stockDetail: StockDetail | null;
  isHolding: boolean;
  signalScore: number;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onAdd: (payload: AddHoldingPayload) => Promise<void>;
  holdingsEmpty: boolean;
  onAddSuccess: (wasFirstStock: boolean) => void;
}

export default function RightSidebar({
  stock, stockDetail, isHolding, signalScore, refreshing, onRefresh, onAdd, holdingsEmpty, onAddSuccess,
}: RightSidebarProps) {
  return (
    <div className="space-y-6">
      <div className="bg-surface border border-line-strong shadow-sm rounded-xl p-6">
        <h3 className="text-lg font-bold mb-4 text-ink">종합 전망 & 상세 분석</h3>

        <div className="space-y-6 text-sm text-muted leading-relaxed mb-6">
          <div className="bg-inset rounded-xl p-4 mb-4">
            <p className="text-xs text-faint mb-2 font-bold">종합 의견</p>
            <div className="flex items-center space-x-3 flex-wrap gap-y-2">
              {/* Market Opinion (시장 기준) */}
              <div className="flex items-center space-x-1.5">
                <span className={`text-lg font-black px-3 py-1 rounded-lg inline-flex items-center ${
                  stockDetail?.market_opinion === '긍정적' ? 'bg-rise/10 text-rise' :
                  stockDetail?.market_opinion === '부정적' ? 'bg-fall/10 text-fall' : 'bg-inset text-muted'
                }`}>
                  <span>{stockDetail?.market_opinion || '분석 중'}</span>
                </span>
                <span className="text-xs text-faint">시장 분석</span>
              </div>
              {/* Holding Opinion (보유 기준, 보유 시에만) — 명령어 → 상태 라벨 변환 */}
              {isHolding && stock.avgPrice && (() => {
                const ho = stockDetail?.holding_opinion || '보유';
                const display = ho === '매도' ? '주의 필요' : ho === '추가매수' ? '추가 검토' : ho;
                return (
                  <div className="flex items-center space-x-1.5">
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

          {/* Scoring Breakdown Visualization */}
          {stockDetail?.scoringBreakdown && (
            <ScoringBreakdownPanel breakdown={stockDetail.scoringBreakdown} />
          )}

          <div className="space-y-4">
            <div>
              <p className="font-bold text-ink mb-2">상세 분석:</p>
              <p className="text-muted leading-relaxed">
                {stockDetail?.analysis || `${stock.name}에 대한 시장 데이터와 기술적 지표를 종합적으로 분석하고 있습니다.`}
              </p>
            </div>
            <div>
              <p className="font-bold text-ink mb-2">알고리즘 분석 요약:</p>
              <p className="text-muted leading-relaxed">
                {stockDetail?.advice || '현재 시점에서는 시장 변동성을 고려한 신중한 접근이 필요합니다.'}
              </p>
            </div>
          </div>

          <p className="text-xs text-faint mt-4 pt-3 border-t border-line leading-relaxed">
            이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다. 모든 투자에는 원금 손실 위험이 있습니다.
          </p>

          {stockDetail?.tossUrl && (
            <div className="mt-6 pt-6 border-t border-line">
              <a href={stockDetail.tossUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-inset border border-line rounded-xl transition-colors group hover:border-ink">
                <div>
                  <p className="text-xs font-bold text-ink">토스증권 차트 보기</p>
                  <p className="text-xs text-muted">실시간 차트와 커뮤니티 반응 확인</p>
                </div>
                <ArrowUpRight size={16} className="text-muted group-hover:text-ink transition-colors" />
              </a>
            </div>
          )}
        </div>

        {!isHolding && stock.fairPrice && (
          <div className="flex justify-between items-center p-4 bg-inset rounded-xl border border-line mb-6">
            <div>
              <p className="text-xs text-muted mb-0.5">AI 추천 매수 적정가</p>
              <p className="text-xl font-black text-ink tabular-nums">₩{stock.fairPrice.toLocaleString()}</p>
            </div>
          </div>
        )}

        {!isHolding && (
          <PortfolioAddForm
            code={stock.code}
            name={stockDetail?.name || stock.name}
            defaultAvgPrice={stockDetail?.price}
            holdingsEmpty={holdingsEmpty}
            onAdd={onAdd}
            onSuccess={onAddSuccess}
          />
        )}

        <div className="p-4 bg-inset rounded-xl mb-6">
          <p className="text-xs text-faint mb-1 text-center">Signal Score</p>
          <div className="text-3xl font-black text-center text-ink tabular-nums">{signalScore}</div>
          <p className="text-xs text-faint text-center mt-1">종합 신호 점수 (0~100)</p>
          <p className="text-xs text-muted text-center mt-2 leading-relaxed">
            위 시장 분석 10점 점수에 목표가 괴리·이평선·변동성을 더해 0~100으로 환산한 보조 지표예요.
          </p>
          <p className="text-xs text-caution text-center mt-1 leading-relaxed">
            실제 상승 확률이 아니에요.
          </p>
        </div>

        <button onClick={onRefresh} disabled={refreshing}
          className="w-full py-3 min-h-[44px] bg-ink text-surface rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center space-x-2">
          {refreshing && <RefreshCw className="animate-spin" size={14} />}
          <span>{refreshing ? '업데이트 중...' : '데이터 새로 고침'}</span>
        </button>
      </div>
    </div>
  );
}
