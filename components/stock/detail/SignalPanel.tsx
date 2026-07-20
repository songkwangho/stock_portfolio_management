'use client';

import Card from '@/components/ui/Card';
import type { SignalResult } from '@/types/stock';

// 관찰형 신호 요약 패널 (3.11차) + stale 경고(3.12차 P2). S3에서 분리.
// stale이면 caution 배너, 신호 있으면 패널, 둘 다 아니면 미표시.
interface SignalPanelProps {
  signals: SignalResult | null;
}

export default function SignalPanel({ signals }: SignalPanelProps) {
  if (!signals) return null;

  // 3.12차 P2 — stale 종목(최근 데이터 미수집) caution 경고. 신호 패널 대신 노출.
  if (signals.stale) {
    return (
      <div className="p-3 rounded-lg bg-caution/10 border border-caution/20 mb-6">
        <p className="text-xs text-caution leading-relaxed">
          이 종목은 최근 데이터가 수집되지 않았어요. 거래가 중단됐거나 상장폐지된 종목일 수 있으니 증권사 앱에서 직접 확인해 주세요.
        </p>
      </div>
    );
  }

  if (signals.signals.length === 0) return null;

  return (
    <Card variant="secondary" padding="base" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-ink">신호 요약</h3>
        <span className="text-xs text-faint">{signals.asOf}</span>
      </div>

      {/* 합의 요약 — 긍정/주의 개수 + 서술 */}
      <div className={`p-3 rounded-lg mb-3 border ${
        signals.consensus.caution > signals.consensus.positive
          ? 'bg-caution/10 border-caution/20'
          : signals.consensus.positive > signals.consensus.caution
          ? 'bg-rise/10 border-rise/20'
          : 'bg-inset border-line'
      }`}>
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-xs font-bold text-rise tabular-nums">긍정 {signals.consensus.positive}</span>
          <span className="text-xs font-bold text-caution tabular-nums">주의 {signals.consensus.caution}</span>
        </div>
        <p className="text-sm text-muted leading-relaxed">{signals.consensus.summary}</p>
      </div>

      {/* 개별 신호 리스트 */}
      <div className="space-y-2">
        {signals.signals.map(sig => (
          <div key={sig.id} className="flex items-start gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
              sig.type === 'positive' ? 'bg-rise/10 text-rise' :
              sig.type === 'caution' ? 'bg-caution/10 text-caution' :
              'bg-inset border border-line text-muted'
            }`}>{sig.label}</span>
            <p className="text-xs text-muted leading-relaxed">{sig.description}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-faint mt-3 leading-relaxed border-t border-line pt-2">
        ※ 어제 종가 기준 관찰 결과예요. 투자 권유가 아니며, 실제 거래는 증권사 앱에서 직접 확인 후 진행하세요.
      </p>
    </Card>
  );
}
