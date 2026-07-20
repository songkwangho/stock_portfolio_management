'use client';
import type { ScoringBreakdown } from '@/types/stock';

interface ScoringBreakdownPanelProps {
  breakdown: ScoringBreakdown;
}

// 해석 기준: 영역 점수 / 만점 비율 (80%↑ 매우 좋음, 60%↑ 적정, 25%↑ 약함, 그 외 부정)
const CATEGORY_LABELS: { key: string; label: string; max: number; descFn: (score: number, detail: ScoringBreakdown['detail']) => string }[] = [
  {
    key: 'valuation', label: '밸류에이션', max: 3,
    descFn: (score, _d) => {
      const pct = score / 3;
      if (pct >= 0.8) return '업종 대비 매우 저렴한 편이에요';
      if (pct >= 0.6) return '업종 대비 적정 수준이에요';
      if (pct >= 0.25) return '업종 대비 다소 비싼 편이에요';
      return '업종 대비 많이 비싼 편이에요';
    }
  },
  {
    key: 'technical', label: '기술지표', max: 3,
    descFn: (score, _d) => {
      const pct = score / 3;
      if (pct >= 0.8) return '기술 지표가 강한 상승 흐름을 보이고 있어요';
      if (pct >= 0.6) return '보통 수준의 기술적 신호예요';
      if (pct >= 0.25) return '약한 기술적 신호예요';
      return '기술 지표가 하락 흐름을 보이고 있어요';
    }
  },
  {
    key: 'supplyDemand', label: '수급', max: 2,
    descFn: (score, d) => {
      if (!d?.supplyDemand) return '데이터 부족';
      const fc = d.supplyDemand.foreignConsecutive || 0;
      const ic = d.supplyDemand.instConsecutive || 0;
      const pct = score / 2;
      if (pct >= 0.8) return `외국인·기관이 사고 있어요 (외 ${fc}일, 기관 ${ic}일)`;
      if (pct >= 0.6) return `일부 매수세가 있어요 (외 ${fc}일, 기관 ${ic}일)`;
      if (pct >= 0.25) return '소규모 매수세가 있어요';
      return '뚜렷한 수급 신호가 없어요';
    }
  },
  {
    key: 'trend', label: '추세', max: 2,
    descFn: (score, d) => {
      const pct = score / 2;
      if (pct >= 0.8) return '상승 흐름이에요 (이평선 정배열)';
      if (pct >= 0.6) return '5일선 위이지만 완전한 상승세는 아니에요';
      if (pct >= 0.25) return '20일선은 지지하지만 5일선 아래예요';
      return d?.trend?.reason || '하락 추세예요';
    }
  },
];

const ScoringBreakdownPanel = ({ breakdown }: ScoringBreakdownPanelProps) => {
  const { total, per_negative, low_confidence } = breakdown;

  const scoreColor = total >= 7 ? 'text-rise' : total >= 4 ? 'text-ink' : 'text-fall';
  const scoreLabel = total >= 7 ? '긍정적' : total >= 4 ? '중립적' : '부정적';

  return (
    <div className="bg-surface p-4 rounded-xl border border-line">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted font-bold">종합점수</p>
        <div className="flex items-center space-x-2">
          <span className={`text-2xl font-black tabular-nums ${scoreColor}`}>{total}</span>
          <span className="text-sm text-faint tabular-nums">/10</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            total >= 7 ? 'bg-rise/10 text-rise' :
            total >= 4 ? 'bg-inset border border-line text-muted' :
            'bg-fall/10 text-fall'
          }`}>{scoreLabel}</span>
        </div>
      </div>
      <p className="text-xs text-muted mb-3 leading-relaxed">10점에 가까울수록 긍정적인 신호예요. 높은 점수가 수익을 보장하지는 않아요.</p>

      {/* 17차 P4-보완: 7/4점 임계값은 백테스팅 검증 전 임시값 — 사용자에게 고지 (CLAUDE.md Phase 4-1) */}
      <div className="mb-4 p-2.5 bg-caution/5 border border-caution/20 rounded-lg">
        <p className="text-xs text-caution leading-relaxed">
          <span className="font-bold">이 점수 기준은 실증 검증 전이에요.</span> 과거 데이터로 최적화하기 전 임시 기준이니 참고용으로만 봐주세요.
        </p>
      </div>

      {/* Score Bars */}
      <div className="space-y-3">
        {CATEGORY_LABELS.map(({ key, label, max, descFn }) => {
          const value = breakdown[key as keyof ScoringBreakdown] as number;
          const pct = Math.min(100, (value / max) * 100);
          const barColor = pct >= 66 ? 'bg-rise' : pct >= 33 ? 'bg-muted' : 'bg-fall';

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-muted">{label}</span>
                <span className="text-xs font-bold text-muted tabular-nums">{value}/{max}</span>
              </div>
              <div className="h-2 bg-line rounded-full overflow-hidden mb-1">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-faint">{descFn(value, breakdown.detail)}</p>
            </div>
          );
        })}
      </div>

      {/* Flags */}
      {(per_negative || low_confidence) && (
        <div className="mt-3 pt-3 border-t border-line space-y-1">
          {per_negative && (
            <p className="text-xs text-caution">이 기업은 현재 적자 상태예요 (PER 음수). 밸류에이션 점수가 낮게 나올 수 있어요.</p>
          )}
          {low_confidence && (
            <p className="text-xs text-caution">같은 업종 종목이 적어서 비교 정확도가 낮을 수 있어요.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ScoringBreakdownPanel;
