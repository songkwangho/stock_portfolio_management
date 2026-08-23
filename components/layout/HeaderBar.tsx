'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, RefreshCw, Bell } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import { useAlertStore } from '@/stores/useAlertStore';
import { useMarketStore } from '@/stores/useMarketStore';
import type { StockSummary } from '@/types/stock';

interface Props {
  nickname: string;
}

export default function HeaderBar({ nickname }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadCount, fetchUnreadCount } = useAlertStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const marketIndices = useMarketStore(s => s.indices);
  const fetchIndices = useMarketStore(s => s.fetchIndices);

  // 라우트 변경 시 검색 입력·드롭다운 초기화 — 잔재 오버레이 방지
  useEffect(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, [pathname]);

  useEffect(() => {
    fetchUnreadCount();
    fetchIndices();
    const alertsInterval = setInterval(fetchUnreadCount, 60000);     // 1분 — 알림
    const indicesInterval = setInterval(() => fetchIndices(true), 300000); // 5분 — 시장지수
    return () => { clearInterval(alertsInterval); clearInterval(indicesInterval); };
  }, [fetchUnreadCount, fetchIndices]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try { setSearchResults(await stockApi.searchStocks(searchQuery)); }
        catch (e) { console.error(e); }
        finally { setIsSearching(false); }
      } else setSearchResults([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSelect = (stock: StockSummary) => {
    setSearchQuery('');
    setSearchResults([]);
    router.push(`/stock/${stock.code}?from=search`);
  };

  return (
    // D4 — md~xl 전 대역에서 헤더 내용이 가용폭을 넘고 있었다(사이드바가 272px를 먹는다).
    // 실측 넘침: 768 +388 · 860 +296 · 940 +216 · 1024 +132 · 1100 +56 (1280부터 정상).
    // 검색창 고정 420px + 지수 213px + 우측 프로필이 동시에 들어갈 폭이 아니다 →
    // 장식(지수·프로필)은 여유가 생기는 폭으로 미루고, 검색창은 단계적으로 넓힌다.
    <header className="h-16 md:h-20 bg-surface border-b border-line px-4 md:px-10 flex items-center justify-between gap-3 z-10">
      <div className="flex items-center space-x-6 min-w-0">
        {marketIndices.length > 0 && (
          <div className="hidden lg:flex items-center space-x-4 shrink-0">
            {marketIndices.map(idx => (
              <div key={idx.symbol} className="flex items-center space-x-2 tabular-nums">
                <span className="text-xs font-bold text-faint">{idx.symbol}</span>
                <span className="text-xs font-bold text-ink">{idx.value?.toLocaleString() || '---'}</span>
                {idx.changeRate && (
                  <span className={`text-xs font-bold ${idx.positive ? 'text-rise' : 'text-fall'}`}>
                    {idx.positive ? '▲' : '▼'} {idx.changeRate}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <div className="flex items-center bg-surface border border-line-strong rounded-xl px-3 md:px-5 py-2.5 w-full md:w-[220px] lg:w-[260px] xl:w-[420px] focus-within:border-ink transition-colors">
            <Search size={18} className="text-faint mr-3" />
            <input
              type="text"
              placeholder="종목명 또는 코드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm w-full placeholder:text-faint text-ink"
            />
            {isSearching && <RefreshCw size={14} className="animate-spin text-faint ml-2" />}
          </div>

          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 w-full mt-2 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-50">
              {searchResults.map((stock) => (
                <button
                  key={stock.code}
                  onClick={() => handleSearchSelect(stock)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-inset transition-colors border-b border-line last:border-0"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-ink">{stock.name}</p>
                    <p className="text-xs text-faint tabular-nums">{stock.code}</p>
                  </div>
                  {/* M1 — market_opinion 판정 뱃지 제거. 검색 결과에서 종목을 고르는 단계에
                      "긍정적/부정적"을 붙이면 선택 자체를 유도한다(R2). 업종만 남긴다. */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs bg-inset text-muted border border-line px-2 py-0.5 rounded uppercase font-bold">
                      {stock.category}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 w-full mt-2 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-50 p-5">
              <p className="text-sm text-ink leading-relaxed mb-3">
                '<span className="font-bold">{searchQuery}</span>' 종목을 찾을 수 없어요.
              </p>
              <p className="text-xs text-muted leading-relaxed mb-4">
                주요 종목만 지원해요. 전체 목록에서 찾아보거나 종목코드로 직접 추가할 수 있어요.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { router.push('/stocks'); setSearchQuery(''); setSearchResults([]); }}
                  className="py-2.5 bg-ink hover:opacity-90 text-surface text-xs font-bold rounded-lg transition-opacity"
                >
                  전체 종목 보기 →
                </button>
                <button
                  onClick={() => { router.push('/settings'); setSearchQuery(''); setSearchResults([]); }}
                  className="py-2.5 bg-surface border border-line-strong hover:bg-inset text-ink text-xs font-bold rounded-lg transition-colors"
                >
                  종목코드로 추가 →
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-line">
                <p className="text-xs text-muted mb-2">이런 종목은 어때요?</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { code: '005930', name: '삼성전자' },
                    { code: '000660', name: 'SK하이닉스' },
                    { code: '035420', name: 'NAVER' },
                  ].map(s => (
                    <button
                      key={s.code}
                      onClick={() => { router.push(`/stock/${s.code}?from=search`); setSearchQuery(''); setSearchResults([]); }}
                      className="px-3 py-1.5 bg-inset border border-line hover:bg-paper text-ink text-xs rounded-lg transition-colors"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-5 shrink-0">
        <button
          title="알림"
          onClick={() => router.push('/alerts')}
          className="bg-surface p-2.5 rounded-xl border border-line hover:border-line-strong transition-colors relative"
        >
          <Bell size={20} className="text-muted" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-ink rounded-full border-2 border-surface flex items-center justify-center text-xs font-bold text-surface px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <div className="h-6 w-px bg-line hidden xl:block"></div>
        <div className="hidden xl:flex items-center space-x-3 cursor-pointer group" onClick={() => router.push('/portfolio')}>
          <div className="text-right">
            <p className="text-sm font-bold leading-none mb-1 text-ink">{nickname || '투자자'}</p>
            <p className="text-xs text-faint font-medium">내 포트폴리오</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-inset border border-line flex items-center justify-center font-bold text-muted">{(nickname || '투자자')[0]}</div>
        </div>
      </div>
    </header>
  );
}
