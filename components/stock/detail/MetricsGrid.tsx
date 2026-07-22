'use client';

import type { StockDetail, SectorComparison } from '@/types/stock';
import type { HelpTermKey } from '@/components/ui/HelpBottomSheet';

// PER/PBR/ROE/목표가/PEG 상세 카드 (3.12차 S4 분리). onHelp 콜백으로 도움말 배선. 본문 이동만.
interface MetricsGridProps {
  stockDetail: StockDetail;
  category: string;   // stock.category 폴백 (stockDetail.category 없을 때)
  sectorData: SectorComparison | null;
  onHelp: (t: HelpTermKey) => void;
}

export default function MetricsGrid({ stockDetail, category, sectorData, onHelp }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <div className="p-4 bg-inset rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-bold text-faint">PER (주가수익비율)</h4>
          <button onClick={() => onHelp('per')} className="text-faint hover:text-ink text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="PER 도움말">[?]</button>
        </div>
        <p className={`text-xl font-bold tabular-nums ${stockDetail?.per != null && stockDetail.per <= 0 ? 'text-caution' : 'text-ink'}`}>
          {stockDetail?.per == null ? '---'
            : stockDetail.per < 0 ? '적자'
            : stockDetail.per === 0 ? '이익 없음'
            : `${stockDetail.per}배`}
        </p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {stockDetail?.per && stockDetail.per < 0
            ? '현재 이익이 마이너스인 기업이에요'
            : stockDetail?.per && stockDetail.per < 15
            ? '업종 평균보다 저렴한 편이에요'
            : stockDetail?.per && stockDetail.per < 30
            ? '적정 수준이에요'
            : stockDetail?.per ? '고평가 구간이에요' : '데이터 없음'}
        </p>
        {/* 업종별 PER 맥락 — 카드 높이 균일 위해 한 줄로 압축(구분선 제거) (3.13 PART 1-1) */}
        {(() => {
          const cat = stockDetail?.category || category;
          let hint = '';
          if (cat?.includes('기술') || cat?.includes('IT')) hint = 'IT는 PER 20~40배도 정상';
          else if (cat?.includes('금융') || cat?.includes('지주')) hint = '금융은 PER 5~15배가 일반적';
          else if (cat?.includes('바이오') || cat?.includes('헬스')) hint = '바이오는 R&D로 일시 적자 잦음';
          else if (cat?.includes('에너지') || cat?.includes('소재')) hint = '에너지·소재는 원자재 영향 큼';
          if (!hint) return null;
          return <p className="text-xs text-faint mt-1 leading-relaxed">{hint}</p>;
        })()}
        {/* 섹터 대비 PER 게이지 — 업종 중앙값 대비 현재가 위치 (6-2) */}
        {sectorData && stockDetail?.per !== null && stockDetail?.per !== undefined && stockDetail.per > 0 && sectorData.medians.per && (
          <div className="mt-2 pt-2 border-t border-line">
            <p className="text-xs text-faint mb-1 tabular-nums">업종 중앙값 {sectorData.medians.per}배 대비</p>
            <div className="flex items-center space-x-2">
              <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-muted"
                  style={{ width: `${Math.min(100, (stockDetail.per / (sectorData.medians.per * 2)) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-muted">
                {stockDetail.per < sectorData.medians.per ? '업종 평균보다 저렴' : '업종 평균보다 높음'}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 bg-inset rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-bold text-faint">PBR (주가순자산비율)</h4>
          <button onClick={() => onHelp('pbr')} className="text-faint hover:text-ink text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="PBR 도움말">[?]</button>
        </div>
        <p className="text-xl font-bold text-ink tabular-nums">{stockDetail?.pbr ? `${stockDetail.pbr}배` : '---'}</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {stockDetail?.pbr && stockDetail.pbr <= 1
            ? '자산 대비 저평가 상태예요'
            : stockDetail?.pbr && stockDetail.pbr <= 3
            ? '적정 수준이에요'
            : stockDetail?.pbr ? '자산 대비 비싼 편이에요' : '데이터 없음'}
        </p>
      </div>
      <div className="p-4 bg-inset rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-bold text-faint">ROE (자기자본이익률)</h4>
          <button onClick={() => onHelp('roe')} className="text-faint hover:text-ink text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="ROE 도움말">[?]</button>
        </div>
        <p className="text-xl font-bold text-ink tabular-nums">{stockDetail?.roe ? `${stockDetail.roe}%` : '---'}</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {stockDetail?.roe
            ? `자기자본으로 ${stockDetail.roe}%를 벌었어요. ${stockDetail.roe >= 15 ? '우량 기업이에요!' : stockDetail.roe >= 10 ? '양호한 수준이에요' : '개선이 필요해요'}`
            : '데이터 없음'}
        </p>
      </div>
      <div className="p-4 bg-inset rounded-lg">
        <h4 className="text-xs font-bold mb-1 text-faint">목표가</h4>
        <p className="text-xl font-bold text-ink tabular-nums">{stockDetail?.targetPrice ? `₩${stockDetail.targetPrice.toLocaleString()}` : '---'}</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {stockDetail?.targetPrice && stockDetail?.price
            ? stockDetail.price < stockDetail.targetPrice
              ? `애널리스트 목표가 기준 현재가 대비 +${((stockDetail.targetPrice - stockDetail.price) / stockDetail.price * 100).toFixed(0)}%`
              : '현재가가 목표가에 도달했어요'
            : '증권사 애널리스트 평균 예상가'}
        </p>
      </div>
      {/* 3.8차 PEG 카드 — EPS 성장률로 보정한 PER */}
      {(() => {
        const epsCur = stockDetail?.eps_current;
        const epsPrev = stockDetail?.eps_previous;
        const per = stockDetail?.per;
        const growth = (epsCur != null && epsPrev != null && epsPrev !== 0)
          ? ((epsCur - epsPrev) / Math.abs(epsPrev) * 100)
          : null;
        const peg = (growth !== null && growth > 0 && per != null && per > 0)
          ? +(per / growth).toFixed(2)
          : null;
        return (
          <div className="p-4 bg-inset rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-bold text-faint">PEG (성장 보정)</h4>
              <button onClick={() => onHelp('peg')} className="text-faint hover:text-ink text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="PEG 도움말">[?]</button>
            </div>
            <p className="text-xl font-bold text-ink tabular-nums">{peg !== null ? `${peg}배` : '---'}</p>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              {peg === null
                ? 'EPS 성장률 데이터 부족 또는 마이너스 성장'
                : peg < 1
                ? '성장 대비 저평가예요 (PEG < 1)'
                : peg < 2
                ? '적정 수준이에요 (PEG 1~2)'
                : '성장 대비 고평가예요 (PEG > 2)'}
            </p>
            {growth !== null && (
              <p className="text-xs text-faint mt-1 tabular-nums">
                EPS 성장률: {growth > 0 ? '+' : ''}{growth.toFixed(1)}%
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
