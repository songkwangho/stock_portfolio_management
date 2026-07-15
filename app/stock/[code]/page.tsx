'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, Trash2, Zap, ShieldCheck, Plus, ArrowUpRight
} from 'lucide-react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, ReferenceDot
} from 'recharts';
import { stockApi } from '@/lib/stockApi';
import type { StockSummary, StockDetail, Holding, ChartDataPoint, TechnicalIndicators, NewsItem, FinancialData, SectorComparison, HistoryEntry, StockThemeTag, SignalResult } from '@/types/stock';
import ScoringBreakdownPanel from '@/components/stock/ScoringBreakdownPanel';
import HelpBottomSheet, { type HelpTermKey } from '@/components/ui/HelpBottomSheet';
import InvestorChart from '@/components/stock/detail/InvestorChart';
import FinancialsTable from '@/components/stock/detail/FinancialsTable';
import NewsList from '@/components/stock/detail/NewsList';
import ConclusionCard from '@/components/stock/detail/ConclusionCard';
import StatsGrid from '@/components/stock/detail/StatsGrid';
import SignalPanel from '@/components/stock/detail/SignalPanel';
import SectorCompare from '@/components/stock/detail/SectorCompare';
import MetricsGrid from '@/components/stock/detail/MetricsGrid';
import IndicatorPanel from '@/components/stock/detail/IndicatorPanel';
import { helpTexts } from '@/lib/stockDetail/helpTexts';
import { getDataFreshnessLabel } from '@/lib/dataFreshness';
import { getThemeMeta } from '@/lib/themesMeta';
import { usePortfolioStore } from '@/stores/usePortfolioStore';
import { useToastStore } from '@/stores/useToastStore';

export default function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        <div className="w-4 h-4 mr-2 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        종목 정보를 불러오는 중이에요...
      </div>
    }>
      <StockDetailContent code={code} />
    </Suspense>
  );
}

function StockDetailContent({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from'); // holding | recommendation | watchlist | major | alerts | search
  const onBack = () => router.back();
  const onAdd = usePortfolioStore(s => s.addHolding);
  const onUpdate = usePortfolioStore(s => s.updateHolding);
  const onDeleteHolding = usePortfolioStore(s => s.deleteHolding);
  const onDeleteStock = usePortfolioStore(s => s.deleteStock);
  const holdings = usePortfolioStore(s => s.holdings);
  const addToast = useToastStore(s => s.addToast);
  const holdingMatch = holdings.find(h => h.code === code);
  const isHolding = !!holdingMatch || from === 'holding';

  // 진입 컨텍스트 → 초기 카테고리 결정 (보유 여부는 store로 재검증)
  const categoryFromContext =
    isHolding ? '보유 종목' :
    from === 'recommendation' ? '추천 종목' :
    from === 'watchlist' ? '관심 종목' :
    from === 'major' ? '주요 종목' :
    from === 'alerts' ? '알림 종목' :
    from === 'theme' ? '테마 종목' :
    from === 'search' ? '검색 결과' : '';

  const stock: StockSummary = holdingMatch
    ? { code, name: holdingMatch.name, category: '보유 종목', avgPrice: holdingMatch.avgPrice, quantity: holdingMatch.quantity, currentPrice: holdingMatch.currentPrice, value: holdingMatch.value, market_opinion: holdingMatch.market_opinion }
    : { code, name: code, category: categoryFromContext };

  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ avgPrice: '0', weight: '5', quantity: '0' });
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ avgPrice: '', quantity: '', weight: '' });
  const [adding, setAdding] = useState(false);
  const [volatility, setVolatility] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [helpTerm, setHelpTerm] = useState<HelpTermKey | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [financials, setFinancials] = useState<FinancialData | null>(null);
  const [sectorData, setSectorData] = useState<SectorComparison | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [extraChartData, setExtraChartData] = useState<HistoryEntry[]>([]);
  // 3.7차 — 소속 테마 태그 (지연 로딩)
  const [stockThemes, setStockThemes] = useState<StockThemeTag[]>([]);
  // 3.11차 — 관찰형 매수/매도 신호 (지연 로딩)
  const [signals, setSignals] = useState<SignalResult | null>(null);

  // 종목 진입 시 스크롤 최상단으로 강제 — 이전 페이지 스크롤 위치 잔재 방지
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [code]);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        // Phase 1: 핵심 데이터 먼저 (가격 + 차트 + 지표)
        const [data, vol, ind] = await Promise.all([
          stockApi.getCurrentPrice(stock.code),
          stockApi.getVolatility(stock.code),
          stockApi.getIndicators(stock.code),
        ]);
        setStockDetail(data);
        setVolatility(vol.volatility);
        setIndicators(ind);

        // Phase 2: 보조 데이터 지연 로딩 (뉴스 + 재무 + 섹터 + 테마)
        stockApi.getNews(stock.code).then(setNews).catch(() => {});
        stockApi.getFinancials(stock.code).then(setFinancials).catch(() => {});
        stockApi.getStockThemes(stock.code).then(setStockThemes).catch(() => {});
        stockApi.getSignals(stock.code).then(setSignals).catch(() => {});
        const cat = data?.category || stock.category;
        if (cat) {
          stockApi.getSectorComparison(cat).then(setSectorData).catch(() => {});
        }
      } catch (error) {
        console.error('Failed to fetch stock detail:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [stock.code]);

  useEffect(() => {
    if (stockDetail?.price) {
      setAddForm({ avgPrice: stockDetail.price.toString(), weight: '5', quantity: '0' });
    }
  }, [stockDetail?.price]);

  // Fetch weekly/monthly chart data when timeframe changes
  useEffect(() => {
    if (chartTimeframe !== 'daily') {
      stockApi.getChartData(stock.code, chartTimeframe as 'weekly' | 'monthly')
        .then(setExtraChartData).catch(() => setExtraChartData([]));
    }
  }, [chartTimeframe, stock.code]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <RefreshCw className="animate-spin mb-3 text-blue-400" size={24} />
        <p className="text-sm text-slate-300 font-semibold mb-1">종목 정보를 불러오는 중이에요...</p>
        <p className="text-xs text-slate-500">보통 3~5초 소요돼요</p>
      </div>
    );
  }

  const historyData = chartTimeframe === 'daily'
    ? (stockDetail?.history || [])
    : extraChartData;

  const fullChartData: ChartDataPoint[] = historyData.map((d, i, arr) => {
    const sma5 = i >= 4 ? Math.round(arr.slice(i - 4, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 5) : null;
    const sma20 = i >= 19 ? Math.round(arr.slice(i - 19, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 20) : null;
    const formatDate = chartTimeframe === 'monthly'
      ? d.date.slice(2, 4) + '/' + d.date.slice(4, 6)
      : d.date.slice(4, 6) + '/' + d.date.slice(6, 8);
    return {
      name: formatDate,
      rawDate: d.date,   // 신호 마커 매칭용 원본 날짜 보존
      price: d.price,
      open: d.open,
      high: d.high,
      low: d.low,
      volume: d.volume,
      sma5,
      sma20,
    };
  });

  const sliceCount = chartTimeframe === 'monthly' ? 12 : 20;
  const chartData = fullChartData.slice(-sliceCount);
  const latest = chartData[chartData.length - 1] || { price: 0, sma5: null, sma20: null, open: 0, high: 0, low: 0, volume: 0 };
  const prev = chartData[chartData.length - 2] || { price: 0, sma5: null, sma20: null };
  const latestPrice = stockDetail?.price || latest.price;

  const trend = (latest.sma5 !== null && latestPrice > latest.sma5) ? '상승' : '하락';
  const profitRate = isHolding && stock.avgPrice ? ((latestPrice - stock.avgPrice) / stock.avgPrice * 100).toFixed(2) : null;

  const computeProbability = (): number => {
    let score = 50;
    const tp = stockDetail?.targetPrice;
    if (tp && latestPrice > 0) {
      const upside = (tp - latestPrice) / latestPrice;
      score += Math.min(20, Math.max(-20, Math.round(upside * 100)));
    }
    if (latest.sma5 !== null && latest.sma20 !== null && latest.sma5 > latest.sma20) score += 10;
    if (latest.sma5 !== null && latestPrice > latest.sma5) score += 5;
    if (latest.price > prev.price) score += 5;
    if (volatility !== null && volatility < 3) score += 5;
    return Math.max(10, Math.min(99, score));
  };

  // Volume chart data with color
  const volumeData = chartData.map(d => ({
    name: d.name,
    volume: d.volume || 0,
    isUp: (d.price || 0) >= (d.open || 0),
  }));

  // Candlestick: we use a bar chart with custom shape
  // We need min/max for Y axis
  const allPrices = chartData.flatMap(d => [d.open || 0, d.high || 0, d.low || 0, d.price || 0]).filter(p => p > 0);
  const priceMin = Math.min(...allPrices) * 0.98;
  const priceMax = Math.max(...allPrices) * 1.02;

  return (
    <div className="animate-in fade-in slide-in-from-left-4 duration-500 space-y-8">
      <button onClick={onBack} className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors mb-4 px-4 py-2.5 min-h-[44px]">
        <ArrowLeft size={20} />
        <span>돌아가기</span>
      </button>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded uppercase">{stock.category}</span>
              {!isHolding && (
                <button onClick={async () => {
                  if (window.confirm('이 종목을 전체 목록에서 삭제하시겠습니까?')) {
                    try {
                      if (holdingMatch) {
                        await onDeleteHolding(stock.code);
                      } else {
                        await onDeleteStock(stock.code);
                      }
                      addToast(`${stock.name} 종목이 삭제되었습니다.`, 'success');
                      onBack();
                    } catch {
                      addToast('종목 삭제에 실패했습니다.', 'error');
                    }
                  }
                }} className="flex items-center space-x-1 text-slate-500 hover:text-red-500 transition-colors px-4 py-2.5 min-h-[44px]" title="종목 전체 삭제">
                  <Trash2 size={16} />
                  <span className="text-xs">삭제</span>
                </button>
              )}
            </div>
            <h2 className="text-4xl font-bold">{stockDetail?.name || stock.name}</h2>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
              <p className="text-slate-500 font-mono">{stock.code}</p>
              {stockDetail?.last_updated && (
                <span className="text-xs text-slate-600 whitespace-nowrap">
                  {getDataFreshnessLabel(stockDetail.last_updated)}
                </span>
              )}
            </div>
            {stockThemes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {stockThemes.map(t => (
                  <button
                    key={t.theme_id}
                    onClick={() => router.push(`/themes?id=${t.theme_id}`)}
                    className="text-xs font-bold px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors"
                    title={`${t.theme_name} 테마 보기`}
                  >
                    {getThemeMeta(t.theme_id).emoji} {t.theme_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 mb-1">현재가</p>
            <div className={`text-4xl font-black ${trend === '상승' ? 'text-emerald-500' : 'text-red-500'}`}>
              ₩{latestPrice.toLocaleString()}
            </div>
            {isHolding && (
              <div className="mt-1 flex items-center space-x-3">
                <p className={`text-sm font-bold ${parseFloat(profitRate || '0') >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  수익률: {profitRate}% (매수가: ₩{stock.avgPrice?.toLocaleString()})
                </p>
                {!editMode && (
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setEditForm({
                        avgPrice: String(stock.avgPrice || ''),
                        quantity: String(stock.quantity || '0'),
                        weight: String(stock.value || '5'),
                      });
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-bold bg-blue-500/10 px-4 py-2.5 min-h-[44px] rounded-lg transition-colors"
                  >
                    보유 정보 수정
                  </button>
                )}
              </div>
            )}
            {isHolding && editMode && onUpdate && (
              <div className="mt-3 p-4 bg-slate-900/50 border border-blue-500/20 rounded-2xl animate-in fade-in duration-200">
                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-3">보유 정보 수정</p>
                <div className="flex items-end space-x-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">매수가 (원)</label>
                    <input
                      type="number"
                      value={editForm.avgPrice}
                      onChange={(e) => setEditForm({ ...editForm, avgPrice: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">수량 (주)</label>
                    <input
                      type="number"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-slate-500 mb-1 block">비중 (%)</label>
                    <input
                      type="number"
                      value={editForm.weight}
                      onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      await onUpdate({
                        code: stock.code,
                        name: stock.name,
                        avgPrice: parseInt(editForm.avgPrice),
                        quantity: parseInt(editForm.quantity || '0'),
                        value: parseInt(editForm.weight || '5'),
                      });
                      setEditMode(false);
                    }}
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors min-h-[44px]"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-3 text-slate-500 hover:text-white text-sm rounded-xl transition-colors min-h-[44px]"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 결론 카드 (3.12차 S3: ConclusionCard 분리) */}
        {stockDetail && <ConclusionCard stockDetail={stockDetail} isHolding={isHolding} holdingMatch={holdingMatch} />}

        {/* "한눈에 보기" 9지표 + 52주 게이지 (3.12차 S3: StatsGrid 분리) */}
        {stockDetail && <StatsGrid stockDetail={stockDetail} />}

        {/* 관찰형 신호 요약 + stale 경고 (3.12차 S3: SignalPanel 분리) */}
        <SignalPanel signals={signals} />

        {/* 3.9차β — 모바일 전용 빠른 진입: 긍정적 미보유 종목에 한해 포트폴리오 추가 폼으로 스크롤.
            PC는 우측 사이드바에 폼이 즉시 보이므로 lg 이상에서 숨김. */}
        {!isHolding && stockDetail?.market_opinion === '긍정적' && (
          <div className="lg:hidden mb-4">
            <button
              onClick={() => document.getElementById('portfolio-add-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="w-full py-3 min-h-[44px] bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-sm font-bold rounded-2xl transition-colors"
            >
              + 포트폴리오에 추가하기 ↓
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* Candlestick + Volume Chart */}
            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
              <h3 className="text-lg font-semibold mb-2 flex items-center justify-between">
                <span>주가 차트</span>
                <div className="flex items-center space-x-1">
                  {/* 캔들 차트 토글: Recharts 커스텀 shape의 wick 좌표 버그로 비활성.
                      Sprint 3 [M2] lightweight-charts 전환 시 재도입 예정. */}
                  {(['daily', 'weekly', 'monthly'] as const).map(tf => (
                    <button key={tf} onClick={() => setChartTimeframe(tf)}
                      className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-bold transition-colors ${
                        chartTimeframe === tf ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}>
                      {tf === 'daily' ? '일봉' : tf === 'weekly' ? '주봉' : '월봉'}
                    </button>
                  ))}
                </div>
              </h3>
              {/* 16차 5-6: SMA 의미를 한 줄로 더 구체적으로 설명 — 초보자가 "평균선"의 의미와 해석 규칙을 모르는 경우 대비 */}
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-4 text-xs text-blue-300 leading-relaxed">
                <p className="font-bold mb-1">💡 이평선(이동평균선) 보는 법</p>
                <p>
                  <span className="text-blue-400 font-bold">파란선</span>(5일 평균, 단기 흐름) /
                  <span className="text-yellow-400 font-bold"> 노란선</span>(20일 평균, 중기 흐름). <br />
                  주가 &gt; 파란선 = 단기 상승 흐름 · 파란선 &gt; 노란선 = 정배열(긍정적 추세).
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[priceMin, priceMax]} tickFormatter={(v) => `₩${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
                      formatter={((value: unknown, name: unknown) => {
                        const labels: Record<string, string> = { price: '종가', open: '시가', high: '고가', low: '저가', sma5: '5일 평균', sma20: '20일 평균' };
                        const n = (name as string) || '';
                        const v = typeof value === 'number' ? value : null;
                        return [`₩${v?.toLocaleString() || '---'}`, labels[n] || n];
                      }) as never} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="price" name="종가" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sma5" name="5일 평균" stroke="#10b981" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="sma20" name="20일 평균" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                    {/* 3.11차 — 골든/데드크로스 발생일 마커. rawDate로 매칭, 보이는 구간 밖이면 미표시. */}
                    {signals?.signals
                      .filter(s => s.date && (s.label === '골든크로스' || s.label === '데드크로스'))
                      .map(s => {
                        const idx = chartData.findIndex(d => d.rawDate === s.date);
                        if (idx < 0) return null;
                        return (
                          <ReferenceDot key={s.id} x={chartData[idx].name} y={chartData[idx].price}
                            r={5} fill={s.type === 'positive' ? '#10b981' : '#ef4444'}
                            stroke="#0f172a" strokeWidth={2} />
                        );
                      })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {/* 크로스 마커가 보이는 구간에 있을 때만 범례 노출 */}
              {signals?.signals.some(s => s.date && (s.label === '골든크로스' || s.label === '데드크로스') && chartData.some(d => d.rawDate === s.date)) && (
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> 골든크로스
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> 데드크로스
                  </span>
                </div>
              )}

              {/* Volume Bar */}
              <h4 className="text-sm font-semibold mt-6 mb-2 flex items-center space-x-2">
                <span className="text-slate-400">거래량</span>
              </h4>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-3 text-xs text-blue-300 leading-relaxed">
                {helpTexts.volume}
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} hide />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => {
                      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}백만`;
                      if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
                      return v.toLocaleString();
                    }} />
                    <Bar dataKey="volume" isAnimationActive={false}>
                      {volumeData.map((entry, index) => (
                        <Cell key={index} fill={entry.isUp ? '#10b98140' : '#ef444440'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* 3.11차 — 거래량 흐름 한 줄 해석 (관찰형) */}
              {volumeData.length >= 5 && (() => {
                const window = volumeData.slice(-20);
                const avg20 = window.length > 0 ? window.reduce((a, b) => a + b.volume, 0) / window.length : 0;
                const latest = volumeData[volumeData.length - 1]?.volume || 0;
                const ratio = avg20 > 0 ? latest / avg20 : 1;
                let msg = '';
                if (ratio >= 2) msg = '📊 최근 거래량이 평소의 2배 이상이에요. 관심이 크게 늘었어요.';
                else if (ratio >= 1.3) msg = '📊 거래량이 평소보다 늘고 있어요.';
                else if (ratio <= 0.5) msg = '📊 거래량이 평소보다 줄었어요. 관심이 식은 편이에요.';
                else msg = '📊 거래량은 평소 수준이에요.';
                return <p className="text-xs text-slate-400 mt-2 leading-relaxed">{msg}</p>;
              })()}
            </div>

            {/* Metrics Grid (3.12차 S4: MetricsGrid 분리) */}
            {stockDetail && <MetricsGrid stockDetail={stockDetail} category={stock.category} sectorData={sectorData} onHelp={setHelpTerm} />}

            {/* 기술적 지표 종합 (3.12차 S4: IndicatorPanel 분리) */}
            <IndicatorPanel indicators={indicators} volatility={volatility} onHelp={setHelpTerm} />

            {/* Investor Trading Trends — 아코디언 (3.12차 S2: InvestorChart 분리) */}
            {stockDetail && <InvestorChart stockDetail={stockDetail} onHelp={setHelpTerm} />}

            {/* Financial Statements — 아코디언 (3.12차 S2: FinancialsTable 분리) */}
            <FinancialsTable financials={financials} />

            {/* 같은 업종 비교 (3.12차 S3: SectorCompare 분리) */}
            <SectorCompare sectorData={sectorData} currentCode={stock.code} />

            {/* News (Phase 2 지연 로딩) — 3.12차 S2: NewsList 분리 */}
            <NewsList news={news} />
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 text-blue-400 flex items-center space-x-2">
                <Zap size={18} />
                <span>종합 전망 & 상세 분석</span>
              </h3>

              <div className="space-y-6 text-sm text-slate-300 leading-relaxed mb-6">
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 mb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">종합 의견</p>
                  <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                    {/* Market Opinion (시장 기준) */}
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-lg font-black px-3 py-1 rounded-lg inline-flex items-center space-x-1 ${
                        stockDetail?.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
                        stockDetail?.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-400'
                      }`}>
                        <span>{stockDetail?.market_opinion || '분석 중'}</span>
                        <span className="text-sm">📊</span>
                      </span>
                      <span className="text-xs text-slate-500">시장 분석</span>
                    </div>
                    {/* Holding Opinion (보유 기준, 보유 시에만) — 명령어 → 상태 라벨 변환 */}
                    {isHolding && stock.avgPrice && (() => {
                      const ho = stockDetail?.holding_opinion || '보유';
                      const display = ho === '매도' ? '주의 필요' : ho === '추가매수' ? '추가 검토' : ho;
                      return (
                        <div className="flex items-center space-x-1.5">
                          <span className={`text-lg font-black px-3 py-1 rounded-lg border ${
                            ho === '매도' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            ho === '관망' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                            ho === '추가매수' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}>{display}</span>
                          <span className="text-xs text-slate-500">내 종목 상태</span>
                        </div>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    알고리즘 분석 결과로, 이것은 투자 추천이 아니에요. 점수와 의견은 참고용으로만 봐주세요.
                  </p>
                </div>

                {/* Scoring Breakdown Visualization */}
                {stockDetail?.scoringBreakdown && (
                  <ScoringBreakdownPanel breakdown={stockDetail.scoringBreakdown} />
                )}

                <div className="space-y-4">
                  <div>
                    <p className="font-bold text-blue-300/80 mb-2 flex items-center space-x-2">
                      <ShieldCheck size={16} className="text-blue-500" />
                      <span>상세 분석:</span>
                    </p>
                    <p className="text-slate-400 pl-6 leading-relaxed">
                      {stockDetail?.analysis || `${stock.name}에 대한 시장 데이터와 기술적 지표를 종합적으로 분석하고 있습니다.`}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold text-blue-300/80 mb-2 flex items-center space-x-2">
                      <Zap size={16} className="text-blue-500" />
                      <span>알고리즘 분석 요약:</span>
                    </p>
                    <p className="text-slate-400 pl-6 leading-relaxed">
                      {stockDetail?.advice || '현재 시점에서는 시장 변동성을 고려한 신중한 접근이 필요합니다.'}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 mt-4 pt-3 border-t border-slate-800/50 leading-relaxed">
                  이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다. 모든 투자에는 원금 손실 위험이 있습니다.
                </p>

                {stockDetail?.tossUrl && (
                  <div className="mt-6 pt-6 border-t border-slate-800">
                    <a href={stockDetail.tossUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all group">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">T</div>
                        <div>
                          <p className="text-xs font-bold text-white">토스증권 차트 보기</p>
                          <p className="text-xs text-slate-500">실시간 차트와 커뮤니티 반응 확인</p>
                        </div>
                      </div>
                      <ArrowUpRight size={16} className="text-slate-500 group-hover:text-blue-400 transition-all" />
                    </a>
                  </div>
                )}
              </div>

              {!isHolding && stock.fairPrice && (
                <div className="flex justify-between items-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-6">
                  <div>
                    <p className="text-xs text-emerald-500 uppercase tracking-widest mb-0.5">AI 추천 매수 적정가</p>
                    <p className="text-xl font-black text-white">₩{stock.fairPrice.toLocaleString()}</p>
                  </div>
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Zap size={20} fill="currentColor" /></div>
                </div>
              )}

              {!isHolding && (
                <div id="portfolio-add-form" className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 mb-6 scroll-mt-20">
                  <h4 className="text-sm font-bold mb-4 flex items-center space-x-2">
                    <Plus size={16} className="text-blue-400" />
                    <span>내 포트폴리오에 추가</span>
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-slate-300 mb-1 block font-bold">평균 매수가 (₩)</label>
                        <input type="number" title="여러 번 나눠 샀다면 평균을 입력해요" value={addForm.avgPrice}
                          onChange={(e) => setAddForm({ ...addForm, avgPrice: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300 mb-1 block font-bold">보유 수량 (주)</label>
                        <input type="number" title="증권사 앱에서 확인할 수 있어요" value={addForm.quantity}
                          onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300 mb-1 block font-bold">총 자산의 몇 %예요?</label>
                        <input type="number" placeholder="선택" title="총 자산(현금+주식 전체) 중 이 종목이 차지하는 비중" value={addForm.weight}
                          onChange={(e) => setAddForm({ ...addForm, weight: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      평균 매수가: 여러 번 나눠 샀다면 평균을 입력해요. 수량은 증권사 앱에서 확인 가능. <span className="text-slate-400">비중은 잘 모르겠으면 비워두세요.</span>
                    </p>
                    {addForm.quantity !== '0' && addForm.avgPrice !== '0' && (
                      <p className="text-xs text-slate-500">
                        총 투자금액: ₩{(parseInt(addForm.quantity || '0') * parseInt(addForm.avgPrice || '0')).toLocaleString()}
                      </p>
                    )}
                    <button onClick={async () => {
                      setAdding(true);
                      // 첫 종목인지 미리 스냅샷 — addHolding이 holdings를 갱신하기 전에 확인
                      const wasFirstStock = holdings.length === 0
                        && !localStorage.getItem('onboarding_first_stock_guided');
                      try {
                        await onAdd({ code: stock.code, name: stockDetail?.name || stock.name,
                          avgPrice: parseInt(addForm.avgPrice), value: parseInt(addForm.weight),
                          quantity: parseInt(addForm.quantity || '0') });
                        if (wasFirstStock) {
                          // StockDetailView(추천/검색에서 진입한 케이스)에서 첫 종목 추가 시:
                          // HoldingsAnalysisPage로 이동하면서 첫 종목 가이드 카드 노출 트리거.
                          // 현재 페이지에 머무르면 사용자는 분석 결과·원금 비중을 확인할 새 진입점을 놓치게 된다.
                          router.push('/portfolio?focus=first-stock-guide');
                        } else {
                          onBack();
                        }
                      } catch (err) { console.error('Failed to add:', err); } finally { setAdding(false); }
                    }} disabled={adding}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 min-h-[44px]">
                      {adding ? '추가 중...' : '포트폴리오 등록'}
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 mb-6">
                <p className="text-xs text-slate-500 mb-1 uppercase tracking-widest text-center italic">Signal Score</p>
                <div className="text-3xl font-black text-center text-white">{computeProbability()}</div>
                <p className="text-xs text-slate-500 text-center mt-1">종합 신호 점수 (0~100)</p>
                <p className="text-xs text-slate-400 text-center mt-2 leading-relaxed">
                  💡 위 시장 분석 10점 점수에 목표가 괴리·이평선·변동성을 더해 0~100으로 환산한 보조 지표예요.
                </p>
                <p className="text-xs text-amber-400/80 text-center mt-1 leading-relaxed">
                  ⚠️ 실제 상승 확률이 아니에요.
                </p>
              </div>

              <button onClick={async () => {
                setRefreshing(true);
                try {
                  const [data, vol, ind] = await Promise.all([
                    stockApi.refreshStock(stock.code), stockApi.getVolatility(stock.code), stockApi.getIndicators(stock.code)
                  ]);
                  setStockDetail(data); setVolatility(vol.volatility); setIndicators(ind);
                } catch (error) { console.error('Refresh failed:', error); } finally { setRefreshing(false); }
              }} disabled={refreshing}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center space-x-2">
                {refreshing && <RefreshCw className="animate-spin" size={14} />}
                <span>{refreshing ? '업데이트 중...' : '데이터 새로 고침'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <HelpBottomSheet termKey={helpTerm} onClose={() => setHelpTerm(null)} />
    </div>
  );
}
