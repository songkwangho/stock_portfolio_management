'use client';

import { useRouter } from 'next/navigation';
import WatchlistContent from '@/components/portfolio/WatchlistContent';
import type { StockSummary } from '@/types/stock';

export default function WatchlistPage() {
  const router = useRouter();
  const onDetailClick = (stock: StockSummary) => {
    router.push(`/stock/${stock.code}?from=watchlist`);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2">관심종목</h2>
        <p className="text-slate-500 text-sm">매수하지 않았지만 눈여겨보고 싶은 종목들을 모아 관리하세요.</p>
      </div>
      <WatchlistContent onDetailClick={onDetailClick} />
    </div>
  );
}
