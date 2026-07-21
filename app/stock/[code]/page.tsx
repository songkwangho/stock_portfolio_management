'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, ArrowUpRight } from 'lucide-react';
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
import OpinionScorePanel from '@/components/stock/detail/OpinionScorePanel';
import AnalysisDetail from '@/components/stock/detail/AnalysisDetail';
import PortfolioAddForm from '@/components/stock/detail/PortfolioAddForm';
import { usePortfolioStore } from '@/stores/usePortfolioStore';
import { useToastStore } from '@/stores/useToastStore';

// 3.13 탭 재편 — 종목상세 3탭. 사이드바 폐지 후 단일 컬럼 풀폭.
type TabKey = 'summary' | 'chart' | 'company';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: '요약' },
  { key: 'chart', label: '차트·지표' },
  { key: 'company', label: '기업' },
];

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
  // 3.13 탭 재편 — [요약] 기본 활성. 데이터는 셸 1회 fetch, 탭 전환 시 재요청 없음.
  const [activeTab, setActiveTab] = useState<TabKey>('summary');

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

  // 데이터 새로 고침 — 셸이 fetch 소유(setter를 자식에 내리지 않음). 탭 바의 새로고침 버튼이 호출.
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
    <div className="animate-in fade-in slide-in-from-left-4 duration-500 max-w-6xl mx-auto">
      <button onClick={onBack} className="flex items-center space-x-2 text-muted hover:text-ink transition-colors mb-4 px-4 py-2.5 min-h-[44px] -ml-4">
        <ArrowLeft size={20} />
        <span>돌아가기</span>
      </button>

      {/* 헤더 — 탭 위 고정(항상 표시). 종목명/코드/테마/현재가/수익률/보유수정 (3.12차 S6: DetailHeader) */}
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

      {/* 탭 바 + 새로고침(모든 탭 접근). 탭은 네비게이션 → 방향색(rise/fall) 미사용 */}
      <div className="flex items-center justify-between border-b border-line mb-6">
        <div className="flex overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 min-h-[44px] text-sm font-bold whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === t.key ? 'text-ink border-ink' : 'text-muted border-transparent hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 shrink-0 text-xs font-bold text-muted hover:text-ink px-3 py-2 min-h-[44px] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{refreshing ? '업데이트 중...' : '새로 고침'}</span>
        </button>
      </div>

      {/* ===== [요약] — 결론(풀폭) + 점수/신호 2열 + (미보유) 적정가·추가폼(풀폭 하단) ===== */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {stockDetail && <ConclusionCard stockDetail={stockDetail} isHolding={isHolding} holdingMatch={holdingMatch} />}
          {/* 데스크톱 2열: 좌 종합점수(높음) / 우 신호+요약(스택으로 높이 균형). 모바일 1열 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <OpinionScorePanel stockDetail={stockDetail} />
            <div className="space-y-4">
              <SignalPanel signals={signals} />
              {/* Signal Score — 가로 배치(높이 축소): 좌 라벨+숫자 / 우 설명. 경고는 설명에 흡수 (3.13 밀도 3차 TASK 2/3) */}
              <div className="bg-surface border border-line rounded-xl p-4 flex items-center gap-4">
                <div className="shrink-0">
                  <p className="text-xs text-faint">Signal Score</p>
                  <p className="tabular-nums leading-none mt-1">
                    <span className="text-3xl font-black text-ink">{computeProbability()}</span>
                    <span className="text-sm text-faint"> /100</span>
                  </p>
                </div>
                <p className="text-xs text-muted leading-relaxed flex-1">
                  위 시장 분석 10점 점수에 목표가 괴리·이평선·변동성을 더해 0~100으로 환산한 보조 지표예요. 실제 상승 확률이 아니에요.
                </p>
              </div>
            </div>
          </div>
          {!isHolding && stock.fairPrice && (
            <div className="flex justify-between items-center p-4 bg-inset rounded-xl border border-line">
              <div>
                <p className="text-xs text-muted mb-0.5">AI 추천 매수 적정가</p>
                <p className="text-xl font-black text-ink tabular-nums">₩{stock.fairPrice.toLocaleString()}</p>
              </div>
            </div>
          )}
          {!isHolding && (
            <PortfolioAddForm
              code={stock.code}
              name={stockDetail?.name || stock.name}
              defaultAvgPrice={stockDetail?.price}
              holdingsEmpty={holdings.length === 0}
              onAdd={onAdd}
              onSuccess={(wasFirstStock) => { if (wasFirstStock) router.push('/portfolio?focus=first-stock-guide'); else onBack(); }}
            />
          )}
        </div>
      )}

      {/* ===== [차트·지표] — 차트 → 지표 → 한눈에 → 밸류 → 수급 → 상세분석 ===== */}
      {activeTab === 'chart' && (
        <div className="space-y-6">
          {stockDetail && <ChartSection code={stock.code} stockDetail={stockDetail} signals={signals} />}
          <IndicatorPanel indicators={indicators} volatility={volatility} onHelp={setHelpTerm} />
          {stockDetail && <StatsGrid stockDetail={stockDetail} />}
          {stockDetail && <MetricsGrid stockDetail={stockDetail} category={stock.category} sectorData={sectorData} onHelp={setHelpTerm} />}
          {stockDetail && <InvestorChart stockDetail={stockDetail} onHelp={setHelpTerm} />}
          <AnalysisDetail stockDetail={stockDetail} name={stock.name} />
        </div>
      )}

      {/* ===== [기업] — 업종비교 → 실적 → 뉴스 → 토스링크(외부, 마지막) ===== */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          <SectorCompare sectorData={sectorData} currentCode={stock.code} />
          <FinancialsTable financials={financials} />
          <NewsList news={news} />
          {stockDetail?.tossUrl && (
            <a href={stockDetail.tossUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between p-4 bg-inset border border-line rounded-xl transition-colors group hover:border-ink">
              <div>
                <p className="text-xs font-bold text-ink">토스증권 차트 보기</p>
                <p className="text-xs text-muted">실시간 차트와 커뮤니티 반응 확인</p>
              </div>
              <ArrowUpRight size={16} className="text-muted group-hover:text-ink transition-colors" />
            </a>
          )}
        </div>
      )}

      <HelpBottomSheet termKey={helpTerm} onClose={() => setHelpTerm(null)} />
    </div>
  );
}
