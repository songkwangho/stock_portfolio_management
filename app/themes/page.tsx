'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Heart } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import { useWatchlistStore } from '@/stores/useWatchlistStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Theme, ThemeStock } from '@/types/stock';

export default function ThemesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        테마 정보를 불러오는 중...
      </div>
    }>
      <ThemesContent />
    </Suspense>
  );
}

function ThemesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeThemeId = searchParams.get('id');

  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeStocks, setThemeStocks] = useState<ThemeStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [stocksLoading, setStocksLoading] = useState(false);
  const activeTheme = themes.find(t => t.theme_id === activeThemeId);

  // 3.9차 — 원스텝 관심 추가
  const addToWatchlist = useWatchlistStore(s => s.addToWatchlist);
  const watchItems = useWatchlistStore(s => s.items);
  const fetchWatchlist = useWatchlistStore(s => s.fetchWatchlist);
  const addToast = useToastStore(s => s.addToast);
  const watchedCodes = new Set(watchItems.map(w => w.code));

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  const onAddWatch = async (e: React.MouseEvent, stock: ThemeStock) => {
    e.stopPropagation();
    if (watchedCodes.has(stock.code)) {
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
      addToast('관심 종목 추가에 실패했어요.', 'error');
    }
  };

  useEffect(() => {
    stockApi.getThemes()
      .then((data: Theme[]) => setThemes(data))
      .catch(() => setThemes([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeThemeId) { setThemeStocks([]); return; }
    setStocksLoading(true);
    stockApi.getThemeStocks(activeThemeId)
      .then((data: ThemeStock[]) => setThemeStocks(data))
      .catch(() => setThemeStocks([]))
      .finally(() => setStocksLoading(false));
  }, [activeThemeId]);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-1 text-ink">테마별 종목 탐색</h2>
        <p className="text-sm text-muted">
          뉴스에서 관심 키워드를 봤다면 테마로 관련 종목을 한 번에 확인해보세요.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 bg-inset border border-line rounded-xl animate-pulse" />
          ))}
        </div>
      ) : themes.length === 0 ? (
        <div className="text-center py-12 bg-inset border border-dashed border-line-strong rounded-xl">
          <p className="text-sm text-muted">테마 데이터를 준비 중이에요.</p>
          <p className="text-xs text-faint mt-1">서버 재시작 후 자동으로 채워져요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {themes.map(theme => {
            const isActive = theme.theme_id === activeThemeId;
            return (
              <button
                key={theme.theme_id}
                onClick={() => router.push(`/themes?id=${theme.theme_id}`)}
                className={`p-4 rounded-xl border text-left transition-colors min-h-[88px] flex flex-col justify-center ${
                  isActive
                    ? 'bg-ink border-ink text-surface'
                    : 'bg-inset border-line hover:border-ink text-ink'
                }`}
              >
                <p className="text-sm font-bold leading-tight">{theme.theme_name}</p>
                <p className={`text-xs mt-0.5 tabular-nums ${isActive ? 'text-surface/70' : 'text-faint'}`}>
                  {theme.stock_count}개 종목
                </p>
              </button>
            );
          })}
        </div>
      )}

      {activeThemeId && (
        <div className="bg-surface border border-line rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-ink">
              {activeTheme?.theme_name || '테마'} 관련 종목
            </h3>
            <span className="text-xs text-muted bg-inset border border-line px-2 py-1 rounded-lg tabular-nums">
              {themeStocks.length}개
            </span>
          </div>
          <p className="text-xs text-faint mb-4 leading-relaxed">
            아래 종목들은 이 테마와 관련이 있어요. 투자 전 각 종목의 상세 분석을 꼭 확인하세요.
          </p>

          {stocksLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-inset rounded-lg animate-pulse" />
              ))}
            </div>
          ) : themeStocks.length === 0 ? (
            <p className="text-center text-sm text-muted py-8">
              아직 이 테마에 등록된 종목이 없어요.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {themeStocks.map(stock => {
                const inWatch = watchedCodes.has(stock.code);
                return (
                  <div
                    key={stock.code}
                    onClick={() => router.push(`/stock/${stock.code}?from=theme`)}
                    className="flex items-center justify-between gap-2 py-3 min-h-[44px] cursor-pointer hover:bg-inset transition-colors"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/stock/${stock.code}?from=theme`); }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{stock.name}</p>
                      <p className="text-xs text-faint tabular-nums">{stock.code} · {stock.category}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="text-right">
                        <p className="text-sm font-bold text-ink tabular-nums">
                          {stock.price ? `₩${stock.price.toLocaleString()}` : '---'}
                        </p>
                        {/* M1 — market_opinion 판정 뱃지 제거(R2). 테마 탐색은 "무엇이 이 테마에
                            속하는지"까지만 — 그중 무엇이 좋은지는 말하지 않는다. */}
                      </div>
                      <button
                        onClick={(e) => onAddWatch(e, stock)}
                        className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                          inWatch
                            ? 'text-ink bg-inset'
                            : 'text-faint hover:text-ink hover:bg-inset'
                        }`}
                        aria-label={inWatch ? '관심 종목에 있음' : '관심 종목 추가'}
                      >
                        <Heart size={16} fill={inWatch ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!activeThemeId && !loading && themes.length > 0 && (
        <div className="text-center py-12 text-muted">
          <p className="text-sm">위에서 관심 테마를 선택하면<br />관련 종목을 볼 수 있어요.</p>
        </div>
      )}
    </div>
  );
}
