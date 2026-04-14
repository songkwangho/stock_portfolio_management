'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, Bell, X, Trash2 } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import { useAlertStore } from '@/stores/useAlertStore';
import { getDataFreshnessShort } from '@/lib/dataFreshness';
import type { StockSummary, MarketIndex } from '@/types/stock';

const ALERT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string; priority: string }> = {
  sell_signal: { label: '가격 하락 경고', icon: '🔴', color: 'text-red-400 bg-red-500/10', priority: 'high' },
  sma5_break: { label: '단기 하락 알림', icon: '📉', color: 'text-red-400 bg-red-500/10', priority: 'medium' },
  sma5_touch: { label: '가격 지지 알림', icon: '💡', color: 'text-emerald-400 bg-emerald-500/10', priority: 'medium' },
  target_near: { label: '목표가 근접 알림', icon: '🎯', color: 'text-yellow-400 bg-yellow-500/10', priority: 'high' },
  undervalued: { label: '저평가 분석 결과', icon: '💎', color: 'text-blue-400 bg-blue-500/10', priority: 'low' },
};

interface Props {
  nickname: string;
}

export default function HeaderBar({ nickname }: Props) {
  const router = useRouter();
  const { alerts, unreadCount, fetchAlerts, fetchUnreadCount, markAllRead, deleteAlert } = useAlertStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);

  useEffect(() => {
    const fetchIndices = async () => {
      try { setMarketIndices(await stockApi.getMarketIndices()); } catch {}
    };
    fetchUnreadCount();
    fetchIndices();
    const interval = setInterval(() => { fetchUnreadCount(); fetchIndices(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

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
    router.push(`/stock/${stock.code}`);
  };

  const handleToggleAlerts = async () => {
    if (!showAlerts) {
      await fetchAlerts();
      await markAllRead();
    }
    setShowAlerts(!showAlerts);
  };

  return (
    <header className="h-16 md:h-20 border-b border-slate-800/40 px-4 md:px-10 flex items-center justify-between z-10">
      <div className="flex items-center space-x-6">
        {marketIndices.length > 0 && (
          <div className="hidden md:flex items-center space-x-4">
            {marketIndices.map(idx => (
              <div key={idx.symbol} className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-500">{idx.symbol}</span>
                <span className="text-xs font-bold text-white">{idx.value?.toLocaleString() || '---'}</span>
                {idx.changeRate && (
                  <span className={`text-xs font-bold ${idx.positive ? 'text-emerald-500' : 'text-red-500'}`}>
                    {idx.positive ? '▲' : '▼'} {idx.changeRate}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <div className="flex items-center bg-slate-900/40 border border-slate-800/60 rounded-2xl px-3 md:px-5 py-2.5 w-full md:w-[420px] focus-within:border-blue-500/50 transition-all backdrop-blur-sm">
            <Search size={18} className="text-slate-500 mr-3" />
            <input
              type="text"
              placeholder="종목명 또는 코드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm w-full placeholder:text-slate-600"
            />
            {isSearching && <RefreshCw size={14} className="animate-spin text-slate-500 ml-2" />}
          </div>

          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50">
              {searchResults.map((stock) => (
                <button
                  key={stock.code}
                  onClick={() => handleSearchSelect(stock)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold">{stock.name}</p>
                    <p className="text-xs text-slate-500">{stock.code}</p>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    {stock.market_opinion && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-400' :
                        stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>● {stock.market_opinion}</span>
                    )}
                    <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase font-bold">
                      {stock.category}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 p-5">
              <p className="text-sm text-slate-300 leading-relaxed mb-3">
                '<span className="font-bold text-white">{searchQuery}</span>' 종목을 찾을 수 없어요.
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                현재 97개 주요 종목만 지원해요. 전체 목록에서 찾아보거나 종목코드로 직접 추가할 수 있어요.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { router.push('/stocks'); setSearchQuery(''); setSearchResults([]); }}
                  className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  전체 종목 보기 →
                </button>
                <button
                  onClick={() => { router.push('/settings'); setSearchQuery(''); setSearchResults([]); }}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors"
                >
                  종목코드로 추가 →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-5">
        <div className="relative">
          <button
            title="알림 확인"
            onClick={handleToggleAlerts}
            className="bg-slate-900/50 p-2.5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all relative"
          >
            <Bell size={20} className="text-slate-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-slate-950 flex items-center justify-center text-xs font-bold text-white px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showAlerts && (
            <>
              <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setShowAlerts(false)} />
              <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 md:absolute md:inset-auto md:top-full md:right-0 md:mt-2 md:w-[400px] md:max-h-[80vh] md:bg-slate-900 md:border md:border-slate-800 md:rounded-2xl md:shadow-2xl md:overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                  <h4 className="text-base md:text-sm font-bold">알림</h4>
                  <button onClick={() => setShowAlerts(false)} className="text-slate-500 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="알림 닫기">
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-auto md:max-h-96">
                  {alerts.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-2xl mb-2">🔔</p>
                      <p className="text-slate-400 font-bold mb-1">아직 알림이 없어요</p>
                      <p className="text-slate-600 text-xs">보유·관심 종목에 주요 변화가 생기면 알려드려요</p>
                    </div>
                  ) : (
                    alerts.map((alert) => {
                      const typeInfo = ALERT_TYPE_LABELS[alert.type] || { label: alert.type, icon: '📋', color: 'text-slate-400 bg-slate-500/10', priority: 'low' };
                      return (
                        <div key={alert.id} className={`px-5 py-3 border-b border-slate-800/50 ${typeInfo.priority === 'high' ? 'border-l-2 border-l-red-500/50' : ''}`}>
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center space-x-2 flex-wrap">
                              <span className="text-sm">{typeInfo.icon}</span>
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
                              <span className="text-xs text-slate-500 font-bold">{alert.name}</span>
                              {alert.source === 'holding' ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">보유 중</span>
                              ) : alert.source === 'watchlist' ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">관심 종목</span>
                              ) : (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400">알림</span>
                              )}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteAlert(alert.id); }}
                              className="text-red-400/60 active:text-red-400 transition-all p-1 min-w-[32px] min-h-[32px] flex items-center justify-center"
                              aria-label="알림 삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed pl-7">{alert.message}</p>
                          <p className="text-xs text-slate-600 mt-1 pl-7">{getDataFreshnessShort(alert.created_at)}</p>
                          <div className="flex items-center space-x-2 pl-7 mt-2">
                            <button
                              onClick={() => { router.push(`/stock/${alert.code}`); setShowAlerts(false); }}
                              className="text-xs font-bold px-4 py-2 min-h-[44px] bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg transition-colors"
                            >
                              지금 확인하기
                            </button>
                            <button
                              onClick={() => setShowAlerts(false)}
                              className="text-xs font-bold px-4 py-2 min-h-[44px] text-slate-400 hover:text-white transition-colors"
                            >
                              나중에 볼게요
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="h-6 w-px bg-slate-800"></div>
        <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => router.push('/portfolio')}>
          <div className="text-right">
            <p className="text-sm font-bold leading-none mb-1 group-hover:text-blue-400 transition-colors">{nickname || '투자자'}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-tighter">내 포트폴리오</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center font-bold text-blue-400">{(nickname || '투자자')[0]}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
