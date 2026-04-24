'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { stockApi } from '@/lib/stockApi';
import { getThemeMeta } from '@/lib/themesMeta';
import type { Theme, ThemeStock } from '@/types/stock';

export default function ThemesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
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
        <h2 className="text-2xl font-bold mb-1">테마별 종목 탐색</h2>
        <p className="text-sm text-slate-400">
          뉴스에서 관심 키워드를 봤다면 테마로 관련 종목을 한 번에 확인해보세요.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-900/50 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : themes.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <p className="text-3xl mb-3">🗂️</p>
          <p className="text-sm text-slate-400">테마 데이터를 준비 중이에요.</p>
          <p className="text-xs text-slate-500 mt-1">서버 재시작 후 자동으로 채워져요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {themes.map(theme => {
            const meta = getThemeMeta(theme.theme_id);
            const isActive = theme.theme_id === activeThemeId;
            return (
              <button
                key={theme.theme_id}
                onClick={() => router.push(`/themes?id=${theme.theme_id}`)}
                className={`p-4 rounded-2xl border text-left transition-all min-h-[88px] flex flex-col justify-between ${
                  isActive
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-600 text-slate-300'
                }`}
              >
                <span className="text-2xl">{meta.emoji}</span>
                <div>
                  <p className="text-sm font-bold leading-tight">{theme.theme_name}</p>
                  <p className={`text-xs mt-0.5 ${isActive ? 'text-blue-200' : 'text-slate-500'}`}>
                    {theme.stock_count}개 종목
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {activeThemeId && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-bold">
              {getThemeMeta(activeThemeId).emoji} {activeTheme?.theme_name || '테마'} 관련 종목
            </h3>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">
              {themeStocks.length}개
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            💡 아래 종목들은 이 테마와 관련이 있어요. 투자 전 각 종목의 상세 분석을 꼭 확인하세요.
          </p>

          {stocksLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-slate-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : themeStocks.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">
              아직 이 테마에 등록된 종목이 없어요.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {themeStocks.map(stock => (
                <button
                  key={stock.code}
                  onClick={() => router.push(`/stock/${stock.code}?from=theme`)}
                  className="flex items-center justify-between p-4 bg-slate-950/50 hover:bg-slate-800/50 border border-slate-800 rounded-2xl transition-all text-left min-h-[44px]"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center font-bold text-blue-400 text-sm shrink-0">
                      {stock.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{stock.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{stock.code} · {stock.category}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-bold text-white">
                      {stock.price ? `₩${stock.price.toLocaleString()}` : '---'}
                    </p>
                    {stock.market_opinion && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-400' :
                        stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>{stock.market_opinion}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!activeThemeId && !loading && themes.length > 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-3xl mb-3">☝️</p>
          <p className="text-sm">위에서 관심 테마를 선택하면<br />관련 종목을 볼 수 있어요.</p>
        </div>
      )}
    </div>
  );
}
