'use client';
import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import StockSearchInput from '@/components/stock/StockSearchInput';
import { useWatchlistStore } from '@/stores/useWatchlistStore';
import type { StockSummary } from '@/types/stock';

interface WatchlistContentProps {
  onDetailClick: (stock: StockSummary) => void;
}

const WatchlistContent = ({ onDetailClick }: WatchlistContentProps) => {
  const { items, fetchWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlistStore();

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  return (
    <div className="space-y-4">
      <StockSearchInput
        placeholder="관심종목 추가 (종목명/코드 검색)"
        onSelect={async (s) => {
          try { await addToWatchlist(s.code); } catch {}
        }}
      />
      {items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(item => (
            <div key={item.code} className="bg-surface border border-line rounded-xl p-5 flex items-center justify-between group">
              <div className="cursor-pointer min-w-0" onClick={() => onDetailClick({ code: item.code, name: item.name, category: item.category })}>
                <p className="font-bold text-ink transition-colors group-hover:underline truncate">{item.name}</p>
                <p className="text-xs text-faint tabular-nums">{item.code}</p>
                <p className="text-sm font-bold text-ink tabular-nums mt-1">{item.price ? `₩${item.price.toLocaleString()}` : '---'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.market_opinion && (
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                    item.market_opinion === '긍정적' ? 'bg-rise/10 text-rise' :
                    item.market_opinion === '부정적' ? 'bg-fall/10 text-fall' : 'bg-inset text-muted'
                  }`}>{item.market_opinion}</span>
                )}
                <button onClick={() => removeFromWatchlist(item.code)}
                  className="p-2 text-muted hover:text-ink min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="관심종목에서 삭제">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-inset border border-dashed border-line-strong rounded-xl">
          <p className="text-ink font-bold text-lg mb-2">관심 종목이 없어요</p>
          <p className="text-muted text-sm">마음에 드는 종목을 추가하면 한 곳에서 볼 수 있어요</p>
        </div>
      )}
    </div>
  );
};

export default WatchlistContent;
