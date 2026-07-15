'use client';

import { helpTexts } from '@/lib/stockDetail/helpTexts';
import type { TechnicalIndicators } from '@/types/stock';
import type { HelpTermKey } from '@/components/ui/HelpBottomSheet';

// 기술적 지표 종합(RSI/MACD/볼린저) + 가용성 안내 + 변동성 (3.12차 S4 분리).
// onHelp 콜백 배선. volatility는 셸 소유(사이드바 computeProbability와 공유)라 prop. 본문 이동만.
interface IndicatorPanelProps {
  indicators: TechnicalIndicators | null;
  volatility: number | null;
  onHelp: (t: HelpTermKey) => void;
}

export default function IndicatorPanel({ indicators, volatility, onHelp }: IndicatorPanelProps) {
  if (!indicators?.summary) return null;
  return (
    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
      <h3 className="text-lg font-semibold mb-4">기술적 지표 종합 분석</h3>

      {/* 종합 신호 - 큰 카드 */}
      <div className={`p-5 rounded-2xl mb-6 border ${
        indicators.summary.signal === '긍정적' ? 'bg-emerald-500/5 border-emerald-500/20' :
        indicators.summary.signal === '주의' ? 'bg-red-500/5 border-red-500/20' :
        'bg-blue-500/5 border-blue-500/20'
      }`}>
        <div className="flex items-center space-x-3 mb-2">
          <span className={`text-2xl font-black ${
            indicators.summary.signal === '긍정적' ? 'text-emerald-400' :
            indicators.summary.signal === '주의' ? 'text-red-400' : 'text-blue-400'
          }`}>{indicators.summary.signal}</span>
          <span className="text-xs text-slate-500">종합 기술적 신호</span>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">{indicators.summary.description}</p>
      </div>

      {/* 개별 지표 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {indicators.summary.details.map((detail) => {
          const termKey: HelpTermKey | null = detail.indicator === 'RSI' ? 'rsi' : detail.indicator === 'MACD' ? 'macd' : detail.indicator === '볼린저밴드' ? 'bollinger' : null;
          return (
          <div key={detail.indicator} className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-300">{detail.indicator}</h4>
              {termKey && (
                <button onClick={() => onHelp(termKey)} className="text-slate-600 hover:text-blue-400 text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label={`${detail.indicator} 도움말`}>[?]</button>
              )}
            </div>
            <p className={`text-lg font-black mb-1 ${
              detail.color === 'green' ? 'text-emerald-400' :
              detail.color === 'red' ? 'text-red-400' : 'text-blue-400'
            }`}>{detail.signal}</p>
            <p className="text-xs text-slate-500 leading-relaxed">{detail.description}</p>
            <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-300 leading-relaxed">
              {helpTexts[detail.indicator === 'RSI' ? 'rsi' : detail.indicator === 'MACD' ? 'macd' : 'bollinger']}
            </div>
            {/* Numeric values */}
            <div className="mt-2 pt-2 border-t border-slate-800/50">
              {detail.indicator === 'RSI' && indicators.rsi !== null && (
                <div className="flex items-center space-x-2">
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${indicators.rsi > 70 ? 'bg-red-500' : indicators.rsi < 30 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${indicators.rsi}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-400">{indicators.rsi}</span>
                </div>
              )}
              {detail.indicator === 'MACD' && indicators.macd && (
                <p className="text-xs text-slate-600">MACD {indicators.macd.macdLine.toLocaleString()} / 시그널 {indicators.macd.signal.toLocaleString()}</p>
              )}
              {detail.indicator === '볼린저밴드' && indicators.bollinger && (
                <div className="flex items-center space-x-2">
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${indicators.bollinger.percentB > 80 ? 'bg-red-500' : indicators.bollinger.percentB < 20 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.max(2, Math.min(100, indicators.bollinger.percentB))}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-400">{indicators.bollinger.percentB}%</span>
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {/* 지표 가용성 안내 — 히스토리 부족으로 일부 지표 미계산 시 (sma_available과 동일 패턴) */}
      {(() => {
        const histDays = indicators.history_days ?? 0;
        const pending: { name: string; need: number }[] = [];
        if (indicators.rsi_available === false) pending.push({ name: 'RSI', need: 15 });
        if (indicators.macd_available === false) pending.push({ name: 'MACD', need: 26 });
        if (indicators.bollinger_available === false) pending.push({ name: '볼린저밴드', need: 20 });
        if (pending.length === 0) return null;
        return (
          <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <p className="text-xs font-bold text-slate-300 mb-2">⏳ 일부 지표는 데이터 수집 중이에요</p>
            <div className="space-y-1.5">
              {pending.map(p => (
                <p key={p.name} className="text-xs text-slate-500 leading-relaxed">
                  <span className="font-bold text-slate-400">{p.name}</span> — 최소 {p.need}일 데이터가 필요해요. 현재 {histDays}일치 수집됨, 약 {Math.max(0, p.need - histDays)}일 후 표시돼요.
                </p>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 변동성 */}
      <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800/50 flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-slate-300 mb-1">가격 변동성</h4>
          <p className="text-xs text-slate-500">숫자가 클수록 가격이 많이 움직여요</p>
        </div>
        <p className="text-xl font-bold">{volatility !== null ? `±${volatility}%` : '---'}</p>
      </div>
    </div>
  );
}
