'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import type { Recommendation, StockSummary } from '@/types/stock';
import { useWatchlistStore } from '@/stores/useWatchlistStore';
import { useToastStore } from '@/stores/useToastStore';

interface RecommendedStockCardProps {
  stock: Recommendation;
  onDetailClick: (stock: StockSummary) => void;
}

const RecommendedStockCard = ({ stock, onDetailClick }: RecommendedStockCardProps) => {
  const router = useRouter();
  const [showSourceInfo, setShowSourceInfo] = useState(false);
  const [reasonExpanded, setReasonExpanded] = useState(false);
  const addToWatchlist = useWatchlistStore(s => s.addToWatchlist);
  const watchlistItems = useWatchlistStore(s => s.items);
  const addToast = useToastStore(s => s.addToast);
  const reasonLong = (stock.reason?.length ?? 0) > 80;
  const inWatchlist = watchlistItems.some(w => w.code === stock.code);

  // 적정가 대비 현재가 괴리율 (양수: 현재가가 적정가보다 낮음)
  const priceGapPct = stock.currentPrice && stock.fairPrice && stock.currentPrice < stock.fairPrice
    ? Math.round((stock.fairPrice - stock.currentPrice) / stock.currentPrice * 100)
    : null;

  // 3.9차 — 원스텝 관심 추가 + 알림 안내 토스트
  const onAddWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inWatchlist) {
      addToast(`${stock.name}은(는) 이미 관심 종목에 있어요.`, 'info');
      return;
    }
    try {
      await addToWatchlist(stock.code);
      addToast(
        `${stock.name}을(를) 관심 종목에 추가했어요.`,
        'success',
        { label: '알림 설정 →', onClick: () => router.push('/alerts') },
      );
    } catch {
      addToast('관심 종목 추가에 실패했어요. 잠시 후 다시 시도해 주세요.', 'error');
    }
  };

  return (
    <div
      onClick={() => onDetailClick(stock)}
      className="bg-surface border border-line rounded-xl p-4 hover:border-line-strong transition-colors cursor-pointer flex flex-col"
    >
      {/* Header: Name + Score */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h4 className="font-bold text-base text-ink truncate">{stock.name}</h4>
          <p className="text-xs text-faint tabular-nums mt-0.5">{stock.code}</p>
        </div>
        {stock.source === 'manual' && stock.score > 0 && (
          <div
            className="flex items-center gap-1 bg-inset border border-line text-ink px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ml-3 cursor-help tabular-nums"
            title="편집팀이 매긴 종목 추천 점수예요. 100점 만점으로, 높을수록 매력적이라고 판단한 종목이에요."
          >
            <span>{stock.score}</span>
            <span className="text-faint ml-0.5">?</span>
          </div>
        )}
      </div>

      {/* 3.9차 — '왜 지금?' 결론형 이유 + 가격 차이 */}
      <div className="mb-4 flex-grow space-y-2">
        <div className="flex items-start space-x-2">
          <span className="text-xs font-bold text-ink bg-inset px-2 py-0.5 rounded shrink-0 mt-0.5">
            왜 지금?
          </span>
          <div className="min-w-0">
            <p className={`text-xs text-ink leading-relaxed ${reasonExpanded ? '' : 'line-clamp-3'}`}>
              {stock.reason}
            </p>
            {reasonLong && (
              <button
                onClick={(e) => { e.stopPropagation(); setReasonExpanded(v => !v); }}
                className="mt-1 text-xs font-bold text-ink hover:underline"
              >
                {reasonExpanded ? '접기' : '더 보기'}
              </button>
            )}
          </div>
        </div>

        {priceGapPct !== null && (
          <div className="flex items-start space-x-2">
            <span className="text-xs font-bold text-rise bg-rise/10 px-2 py-0.5 rounded shrink-0 mt-0.5">
              가격 차이
            </span>
            <p className="text-xs text-muted leading-relaxed tabular-nums">
              적정가(₩{stock.fairPrice!.toLocaleString()}) 대비 현재가가{' '}
              <span className="text-rise font-bold">{priceGapPct}% 낮아요</span>
              {' '}— 아직 반영이 덜 됐을 수 있어요.
              <span className="block text-xs text-faint mt-0.5">
                ※ 실제 수익률이 아니에요. 참고용 수치예요.
                {stock.targetPrice && stock.fairPrice === stock.targetPrice
                  ? ' 애널리스트 목표가는 6~12개월 기준이라 현재 시세와 차이가 있을 수 있어요.'
                  : ''}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Footer: Source Badge + Opinion */}
      <div className="flex items-center justify-between flex-wrap gap-y-1 mb-3">
        <div className="flex items-center space-x-1.5">
          {stock.source && (
            <span
              onClick={(e) => { e.stopPropagation(); setShowSourceInfo(!showSourceInfo); }}
              className={`text-xs font-bold px-2 py-1 rounded-lg cursor-pointer border border-line bg-inset ${
                stock.source === 'manual' ? 'text-ink' : 'text-muted'
              }`}
            >
              {stock.source === 'manual' ? '전문가 선정' : '알고리즘'}
            </span>
          )}
          {stock.market_opinion && (
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
              stock.market_opinion === '긍정적' ? 'bg-rise/10 text-rise' :
              stock.market_opinion === '부정적' ? 'bg-fall/10 text-fall' :
              'bg-inset text-muted'
            }`}>
              {stock.market_opinion}
            </span>
          )}
        </div>
      </div>
      {showSourceInfo && (
        <div className="text-xs mb-3 p-3 bg-inset rounded-lg leading-relaxed space-y-1.5">
          <p className="text-muted">
            {stock.source === 'manual'
              ? '전문가가 직접 분석하여 선정한 종목이에요. 투자 결정은 본인이 하세요.'
              : '10가지 지표를 자동 분석한 결과예요. 과거 성과가 미래를 보장하지 않아요.'}
          </p>
        </div>
      )}

      {/* 3.9차 — 다음 행동 버튼 2개 + 면책 */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(stock); }}
          className="flex-1 py-3 min-h-[44px] bg-ink hover:opacity-90 text-surface text-xs font-bold rounded-xl transition-opacity"
        >
          상세 분석 보기 →
        </button>
        <button
          onClick={onAddWatchlist}
          className={`py-3 px-4 min-h-[44px] min-w-[44px] text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1 ${
            inWatchlist
              ? 'bg-inset border border-line-strong text-ink'
              : 'bg-surface border border-line-strong text-muted hover:bg-inset hover:text-ink'
          }`}
          aria-label={inWatchlist ? '관심 종목에 있음' : '관심 종목 추가'}
        >
          <Heart size={14} fill={inWatchlist ? 'currentColor' : 'none'} />
          <span>{inWatchlist ? '추가됨' : '관심'}</span>
        </button>
      </div>
      <p className="text-xs text-faint mt-2 text-center leading-relaxed">
        투자 결정은 본인이 직접 해주세요. 실제 거래는 증권사 앱에서 진행하세요.
      </p>
    </div>
  );
};

export default RecommendedStockCard;
