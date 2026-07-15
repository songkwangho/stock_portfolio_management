'use client';

import { Zap, ShieldCheck, ArrowUpRight, RefreshCw } from 'lucide-react';
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
      <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6">
        <h3 className="text-lg font-bold mb-4 text-blue-400 flex items-center space-x-2">
          <Zap size={18} />
          <span>종합 전망 & 상세 분석</span>
        </h3>

        <div className="space-y-6 text-sm text-slate-300 leading-relaxed mb-6">
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 mb-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">종합 의견</p>
            <div className="flex items-center space-x-3 flex-wrap gap-y-2">
              {/* Market Opinion (시장 기준) */}
              <div className="flex items-center space-x-1.5">
                <span className={`text-lg font-black px-3 py-1 rounded-lg inline-flex items-center space-x-1 ${
                  stockDetail?.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
                  stockDetail?.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-400'
                }`}>
                  <span>{stockDetail?.market_opinion || '분석 중'}</span>
                  <span className="text-sm">📊</span>
                </span>
                <span className="text-xs text-slate-500">시장 분석</span>
              </div>
              {/* Holding Opinion (보유 기준, 보유 시에만) — 명령어 → 상태 라벨 변환 */}
              {isHolding && stock.avgPrice && (() => {
                const ho = stockDetail?.holding_opinion || '보유';
                const display = ho === '매도' ? '주의 필요' : ho === '추가매수' ? '추가 검토' : ho;
                return (
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-lg font-black px-3 py-1 rounded-lg border ${
                      ho === '매도' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      ho === '관망' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                      ho === '추가매수' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>{display}</span>
                    <span className="text-xs text-slate-500">내 종목 상태</span>
                  </div>
                );
              })()}
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              알고리즘 분석 결과로, 이것은 투자 추천이 아니에요. 점수와 의견은 참고용으로만 봐주세요.
            </p>
          </div>

          {/* Scoring Breakdown Visualization */}
          {stockDetail?.scoringBreakdown && (
            <ScoringBreakdownPanel breakdown={stockDetail.scoringBreakdown} />
          )}

          <div className="space-y-4">
            <div>
              <p className="font-bold text-blue-300/80 mb-2 flex items-center space-x-2">
                <ShieldCheck size={16} className="text-blue-500" />
                <span>상세 분석:</span>
              </p>
              <p className="text-slate-400 pl-6 leading-relaxed">
                {stockDetail?.analysis || `${stock.name}에 대한 시장 데이터와 기술적 지표를 종합적으로 분석하고 있습니다.`}
              </p>
            </div>
            <div>
              <p className="font-bold text-blue-300/80 mb-2 flex items-center space-x-2">
                <Zap size={16} className="text-blue-500" />
                <span>알고리즘 분석 요약:</span>
              </p>
              <p className="text-slate-400 pl-6 leading-relaxed">
                {stockDetail?.advice || '현재 시점에서는 시장 변동성을 고려한 신중한 접근이 필요합니다.'}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 mt-4 pt-3 border-t border-slate-800/50 leading-relaxed">
            이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다. 모든 투자에는 원금 손실 위험이 있습니다.
          </p>

          {stockDetail?.tossUrl && (
            <div className="mt-6 pt-6 border-t border-slate-800">
              <a href={stockDetail.tossUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all group">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">T</div>
                  <div>
                    <p className="text-xs font-bold text-white">토스증권 차트 보기</p>
                    <p className="text-xs text-slate-500">실시간 차트와 커뮤니티 반응 확인</p>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-slate-500 group-hover:text-blue-400 transition-all" />
              </a>
            </div>
          )}
        </div>

        {!isHolding && stock.fairPrice && (
          <div className="flex justify-between items-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-6">
            <div>
              <p className="text-xs text-emerald-500 uppercase tracking-widest mb-0.5">AI 추천 매수 적정가</p>
              <p className="text-xl font-black text-white">₩{stock.fairPrice.toLocaleString()}</p>
            </div>
            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Zap size={20} fill="currentColor" /></div>
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

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 mb-6">
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-widest text-center italic">Signal Score</p>
          <div className="text-3xl font-black text-center text-white">{signalScore}</div>
          <p className="text-xs text-slate-500 text-center mt-1">종합 신호 점수 (0~100)</p>
          <p className="text-xs text-slate-400 text-center mt-2 leading-relaxed">
            💡 위 시장 분석 10점 점수에 목표가 괴리·이평선·변동성을 더해 0~100으로 환산한 보조 지표예요.
          </p>
          <p className="text-xs text-amber-400/80 text-center mt-1 leading-relaxed">
            ⚠️ 실제 상승 확률이 아니에요.
          </p>
        </div>

        <button onClick={onRefresh} disabled={refreshing}
          className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center space-x-2">
          {refreshing && <RefreshCw className="animate-spin" size={14} />}
          <span>{refreshing ? '업데이트 중...' : '데이터 새로 고침'}</span>
        </button>
      </div>
    </div>
  );
}
