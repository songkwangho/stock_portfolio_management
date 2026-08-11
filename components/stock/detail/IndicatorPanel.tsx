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
    <div className="bg-surface p-6 rounded-xl border border-line">
      <h3 className="text-lg font-semibold text-ink mb-4">기술적 지표 종합 분석</h3>

      {/* M5 — "종합 기술적 신호" 판정 배지(긍정적/주의) 제거.
          RSI·MACD·볼린저 세 지표를 하나로 뭉쳐 24px 굵은 글씨 + rise/fall 색으로 통보하던 것으로,
          M1에서 앱 전역에서 걷어낸 market_opinion 배지와 형태가 같다(축만 다름).
          같은 [차트·지표] 탭 안에 남으면 톤이 어긋난다.
          설명문(description)은 개별 지표 관찰을 담고 있어 유지하고, 배지·방향색만 덜어냈다.
          아래 개별 지표 카드가 이미 항목별 풀이를 제공한다 — 종합은 사용자가 한다. */}
      <div className="p-4 rounded-xl mb-4 border bg-inset border-line">
        <p className="text-xs text-faint mb-1.5">지표별 관찰</p>
        <p className="text-sm text-muted leading-relaxed">{indicators.summary.description}</p>
      </div>

      {/* 개별 지표 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {indicators.summary.details.map((detail) => {
          const termKey: HelpTermKey | null = detail.indicator === 'RSI' ? 'rsi' : detail.indicator === 'MACD' ? 'macd' : detail.indicator === '볼린저밴드' ? 'bollinger' : null;
          return (
          <div key={detail.indicator} className="p-4 bg-inset rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-ink">{detail.indicator}</h4>
              {termKey && (
                <button onClick={() => onHelp(termKey)} className="text-faint hover:text-ink text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label={`${detail.indicator} 도움말`}>[?]</button>
              )}
            </div>
            <p className={`text-lg font-black mb-1 ${
              detail.color === 'green' ? 'text-rise' :
              detail.color === 'red' ? 'text-fall' : 'text-ink'
            }`}>{detail.signal}</p>
            <p className="text-xs text-muted leading-relaxed">{detail.description}</p>
            <div className="mt-2 pt-2 border-t border-line text-xs text-muted leading-relaxed">
              {helpTexts[detail.indicator === 'RSI' ? 'rsi' : detail.indicator === 'MACD' ? 'macd' : 'bollinger']}
            </div>
            {/* Numeric values — 게이지 채움은 무채색(방향은 위 라벨 색으로) (3.13 rule 2) */}
            <div className="mt-2 pt-2 border-t border-line">
              {detail.indicator === 'RSI' && indicators.rsi !== null && (
                <div className="flex items-center space-x-2">
                  <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-muted" style={{ width: `${indicators.rsi}%` }} />
                  </div>
                  <span className="text-xs font-bold text-muted tabular-nums">{indicators.rsi}</span>
                </div>
              )}
              {detail.indicator === 'MACD' && indicators.macd && (
                <p className="text-xs text-faint tabular-nums">MACD {indicators.macd.macdLine.toLocaleString()} / 시그널 {indicators.macd.signal.toLocaleString()}</p>
              )}
              {detail.indicator === '볼린저밴드' && indicators.bollinger && (
                <div className="flex items-center space-x-2">
                  <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-muted" style={{ width: `${Math.max(2, Math.min(100, indicators.bollinger.percentB))}%` }} />
                  </div>
                  <span className="text-xs font-bold text-muted tabular-nums">{indicators.bollinger.percentB}%</span>
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
          <div className="mt-4 p-4 bg-inset rounded-lg border border-line">
            <p className="text-xs font-bold text-ink mb-2">일부 지표는 데이터 수집 중이에요</p>
            <div className="space-y-1.5">
              {pending.map(p => (
                <p key={p.name} className="text-xs text-muted leading-relaxed tabular-nums">
                  <span className="font-bold text-ink">{p.name}</span> — 최소 {p.need}일 데이터가 필요해요. 현재 {histDays}일치 수집됨, 약 {Math.max(0, p.need - histDays)}일 후 표시돼요.
                </p>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 변동성 */}
      <div className="mt-4 p-4 bg-inset rounded-lg border border-line flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-ink mb-1">가격 변동성</h4>
          <p className="text-xs text-faint">숫자가 클수록 가격이 많이 움직여요</p>
        </div>
        <p className="text-xl font-bold text-ink tabular-nums">{volatility !== null ? `±${volatility}%` : '---'}</p>
      </div>
    </div>
  );
}
