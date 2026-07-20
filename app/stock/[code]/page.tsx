'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import type { StockSummary, StockDetail, Holding, TechnicalIndicators, NewsItem, FinancialData, SectorComparison, StockThemeTag, SignalResult } from '@/types/stock';
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
import ChartSection from '@/components/stock/detail/ChartSection';
import DetailHeader from '@/components/stock/detail/DetailHeader';
import RightSidebar from '@/components/stock/detail/RightSidebar';
import { usePortfolioStore } from '@/stores/usePortfolioStore';
import { useToastStore } from '@/stores/useToastStore';

export default function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        <div className="w-4 h-4 mr-2 border-2 border-ink border-t-transparent rounded-full animate-spin" />
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
  const [volatility, setVolatility] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [helpTerm, setHelpTerm] = useState<HelpTermKey | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [financials, setFinancials] = useState<FinancialData | null>(null);
  const [sectorData, setSectorData] = useState<SectorComparison | null>(null);
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

  // 데이터 새로 고침 — 셸이 fetch 소유(setter를 자식에 내리지 않음, 리스크 #5). RightSidebar가 호출.
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [data, vol, ind] = await Promise.all([
        stockApi.refreshStock(stock.code), stockApi.getVolatility(stock.code), stockApi.getIndicators(stock.code),
      ]);
      setStockDetail(data); setVolatility(vol.volatility); setIndicators(ind);
    } catch (error) { console.error('Refresh failed:', error); } finally { setRefreshing(false); }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <RefreshCw className="animate-spin mb-3 text-muted" size={24} />
        <p className="text-sm text-ink font-semibold mb-1">종목 정보를 불러오는 중이에요...</p>
        <p className="text-xs text-faint">보통 3~5초 소요돼요</p>
      </div>
    );
  }

  // 헤더의 가격·추세·수익률과 사이드바 종합점수는 항상 일봉(stockDetail.history) 기준으로 계산한다.
  // 차트 타임프레임(주/월봉)과 무관 — 차트 렌더링은 ChartSection이 자체 소유. (S0와 동일 원칙, 3.12차 S5)
  const dailyBars = (stockDetail?.history || []).map((d, i, arr) => ({
    price: d.price,
    sma5: i >= 4 ? Math.round(arr.slice(i - 4, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 5) : null,
    sma20: i >= 19 ? Math.round(arr.slice(i - 19, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 20) : null,
  }));
  const latest = dailyBars[dailyBars.length - 1] || { price: 0, sma5: null, sma20: null };
  const prev = dailyBars[dailyBars.length - 2] || { price: 0, sma5: null, sma20: null };
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

  return (
    <div className="animate-in fade-in slide-in-from-left-4 duration-500 space-y-8">
      <button onClick={onBack} className="flex items-center space-x-2 text-muted hover:text-ink transition-colors mb-4 px-4 py-2.5 min-h-[44px]">
        <ArrowLeft size={20} />
        <span>돌아가기</span>
      </button>

      <div className="bg-surface border border-line rounded-xl p-8">
        {/* 헤더 (3.12차 S6: DetailHeader 분리) */}
        <DetailHeader
          stock={stock}
          stockDetail={stockDetail}
          isHolding={isHolding}
          holdingMatch={holdingMatch}
          stockThemes={stockThemes}
          trend={trend}
          latestPrice={latestPrice}
          profitRate={profitRate}
          onDeleteHolding={onDeleteHolding}
          onDeleteStock={onDeleteStock}
          onUpdate={onUpdate}
          addToast={addToast}
          onBack={onBack}
        />

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
              className="w-full py-3 min-h-[44px] bg-ink hover:opacity-90 text-surface text-sm font-bold rounded-xl transition-opacity"
            >
              + 포트폴리오에 추가하기 ↓
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* 주가·거래량 차트 (3.12차 S5: ChartSection 통합 추출 + 마커 창 20일 확대) */}
            {stockDetail && <ChartSection code={stock.code} stockDetail={stockDetail} signals={signals} />}

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

          {/* 우측 사이드바 (3.12차 S6: RightSidebar 분리) */}
          <RightSidebar
            stock={stock}
            stockDetail={stockDetail}
            isHolding={isHolding}
            signalScore={computeProbability()}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onAdd={onAdd}
            holdingsEmpty={holdings.length === 0}
            onAddSuccess={(wasFirstStock) => { if (wasFirstStock) router.push('/portfolio?focus=first-stock-guide'); else onBack(); }}
          />
        </div>
      </div>
      <HelpBottomSheet termKey={helpTerm} onClose={() => setHelpTerm(null)} />
    </div>
  );
}
