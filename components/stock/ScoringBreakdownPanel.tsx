'use client';
import { useState } from 'react';
import type { ScoringBreakdown } from '@/types/stock';

interface ScoringBreakdownPanelProps {
  breakdown: ScoringBreakdown;
  bare?: boolean; // true면 카드 래퍼 없이 렌더 — 상위 카드에 병합 (3.13 밀도 2차)
}

// 항목별 문구. 방향 verdict('상승 흐름이에요')를 쓰지 않고 위치·정도까지만 말한다.
// 테스트가 점수→문구 매핑과 금지어를 검사할 수 있게 export 한다
// (trend 분기가 계산과 어긋나 있던 버그를 잡은 뒤 회귀 방지용으로 고정).
export const CATEGORY_LABELS: { key: string; label: string; max: number; descFn: (score: number, detail: ScoringBreakdown['detail']) => string }[] = [
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
    // 방향단정 제거 — 항목 점수는 RSI·MACD·볼린저를 합산한 값이라 '상승/하락 흐름'을 단정할
    // 근거가 못 된다. 몇 개 항목이 어느 쪽으로 기울었는지(정도)까지만 말한다.
    descFn: (score, _d) => {
      const pct = score / 3;
      if (pct >= 0.8) return '기술 지표 대부분이 위쪽으로 기울어 있어요';
      if (pct >= 0.6) return '기술 지표가 반반에 가까워요';
      if (pct >= 0.25) return '기술 지표 상당수가 아래쪽으로 기울어 있어요';
      return '기술 지표 대부분이 아래쪽으로 기울어 있어요';
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
    // 방향단정 제거 — 이 항목은 이평선 배열·주가 위치로만 결정되므로 그 위치를 그대로 말한다
    // ('상승 흐름이에요'/'하락 추세예요' verdict 없이).
    //
    // ⚠️ 동시에 **표시-계산 불일치 버그**를 고친다. 기존 코드는 pct(=score/2) 구간으로 문구를
    // 골랐는데, calculateTrendScore가 내는 값은 {2.0, 1.0, 0.5, 0.0} 이산값뿐이라
    //   · pct>=0.6 분기는 도달 불가(0.5 < 0.6)였고
    //   · total=1.0('주가 > 5일선, 역배열')과 '이평선 데이터 부족'이 둘 다 pct=0.5로 떨어져
    //     "20일선은 지지하지만 5일선 아래예요" — **위치가 정반대인 문구**가 표시되고 있었다.
    // 그래서 구간이 아니라 점수값에 정확히 대응시키고, 1.0 충돌은 서버 reason으로 가른다.
    descFn: (score, d) => {
      if (d?.trend?.reason === '이평선 데이터 부족') return '이동평균 데이터를 모으는 중이에요';
      if (score >= 2) return '주가가 5일선 위, 5일선이 20일선 위에 있어요 (정배열)';
      if (score >= 1) return '주가는 5일선 위지만, 5일선이 20일선 아래에 있어요';
      if (score >= 0.5) return '주가가 5일선 아래, 20일선 위에 있어요';
      return '주가가 5일선·20일선 모두 아래에 있어요';
    }
  },
];

const ScoringBreakdownPanel = ({ breakdown, bare = false }: ScoringBreakdownPanelProps) => {
  const { per_negative, low_confidence } = breakdown;
  const [showTempNote, setShowTempNote] = useState(false);

  // B1 — 총점(N/10)과 등급 배지(긍정적/중립적/부정적) 제거.
  // 네 항목을 하나로 합친 숫자와 등급은 "결론 통보"라, 여러 관점을 스스로 저울질하게 하는 방향과 어긋난다.
  // 항목별 점수는 **재료 분포**로 남긴다(어느 항목이 세고 약한지 비교용).
  // 서버의 total 계산 자체는 추천·스크리너의 내부 랭킹이 쓰고 있어 그대로 둔다(노출만 제거).
  return (
    <div className={bare ? undefined : 'bg-surface p-4 rounded-xl border border-line'}>
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs text-muted font-bold">항목별 점수</p>
        <button onClick={() => setShowTempNote(v => !v)} className="text-xs font-bold px-1.5 py-0.5 rounded bg-caution/10 text-caution" aria-label="점수 기준 안내">임시 기준</button>
      </div>
      <p className="text-xs text-muted mb-3 leading-relaxed">네 항목을 따로 본 점수예요. 어느 쪽이 세고 약한지 비교하는 재료로만 봐주세요.</p>

      {/* 17차 P4-보완: 임계값 임시값 고지 — 큰 amber 박스 → '임시 기준' 뱃지 클릭 시 전문 (3.13 밀도 3차 TASK 3, 고지 텍스트 보존) */}
      {showTempNote && (
        <p className="text-xs text-caution mb-3 leading-relaxed">
          <span className="font-bold">이 점수 기준은 실증 검증 전이에요.</span> 과거 데이터로 최적화하기 전 임시 기준이니 참고용으로만 봐주세요.
          점수가 높다고 오르는 것도, 낮다고 내리는 것도 아니에요.
        </p>
      )}

      {/* Score Bars */}
      <div className="space-y-2">
        {CATEGORY_LABELS.map(({ key, label, max, descFn }) => {
          const value = breakdown[key as keyof ScoringBreakdown] as number;
          const pct = Math.min(100, (value / max) * 100);
          // 점수는 "방향"이 아니라 "범주" → 무채색 ramp (파이와 동일 원칙, 3.13 TASK 2).
          // rise(빨강) 채움은 하락 종목에서도 "상승 중"으로 오독됨. 막대 길이가 크기를 표현.
          const barColor = pct >= 66 ? 'bg-ink' : pct >= 33 ? 'bg-muted' : 'bg-faint';

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
