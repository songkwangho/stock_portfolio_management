'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ArrowRight } from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import Card from '@/components/ui/Card';
import ErrorBanner from '@/components/ui/ErrorBanner';
import AttentionBlock from '@/components/dashboard/AttentionBlock';
import { stockApi } from '@/lib/stockApi';
import { formatWeight } from '@/lib/stockDetail/format';
import { computePortfolioTotals, interpretAttribution, formatPP } from '@/lib/portfolio/attribution';
import { usePortfolioStore } from '@/stores/usePortfolioStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useAlertStore } from '@/stores/useAlertStore';
import type { StockSummary, BenchmarkResult } from '@/types/stock';

// 한국식 금액 단위 포매터 — Y축/툴팁 공용 (16차 5-2).
// `₩35000k` 같은 영문 k 단위는 초보자가 직관적으로 이해하기 어려움.
const formatKoreanWon = (value: number): string => {
  if (value >= 100_000_000) return `₩${(value / 100_000_000).toFixed(1)}억`;
  if (value >= 10_000) return `₩${Math.round(value / 10_000)}만`;
  return `₩${value.toLocaleString()}`;
};

interface PortfolioHistoryEntry {
  date: string;
  value: number;
  cost: number;
  profitRate: number;
}

// 자산 배분 파이는 방향이 아니라 범주 → 무채색 계조 (DESIGN.md § chart 팔레트).
// 집중도 경고는 큰 슬라이스를 칠하지 않고(배경처럼 묻힘) 범례에 작은 '집중' 태그로만 표시.
const RAMP = ['#17181C', '#6E7076', '#9A9CA2', '#C9CAC8'];
const CONCENTRATION_THRESHOLD = 50; // % 초과 시 '집중' 태그

export default function DashboardPage() {
  const router = useRouter();
  const holdings = usePortfolioStore(state => state.holdings);
  const fetchHoldings = usePortfolioStore(state => state.fetchHoldings);

  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // indices 값 자체는 대시보드가 렌더하지 않는다(HeaderBar 담당) — fetch만 호출해 공용 TTL 스토어를 데운다.
  // 모바일 대시보드 KOSPI/KOSDAQ 노출(Sprint 3 [M4]) 때 구독을 다시 추가하면 된다.
  const fetchMarketIndices = useMarketStore(s => s.fetchIndices);
  const unreadCount = useAlertStore(s => s.unreadCount);
  const fetchUnreadCount = useAlertStore(s => s.fetchUnreadCount);

  // 3.8차 — 시장 온도 (Fear & Greed) + 포트폴리오 샤프 지수
  const [fearGreed, setFearGreed] = useState<{ score: number; label: string } | null>(null);
  const [showFGHelp, setShowFGHelp] = useState(false);
  const [sharpe, setSharpe] = useState<number | null>(null);
  const [showSharpeHelp, setShowSharpeHelp] = useState(false);
  // 3.14차 — KOSPI 대비 초과수익(벤치마크). 데이터 부족 시 null 유지(항목 미표시).
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [showBenchmarkHelp, setShowBenchmarkHelp] = useState(false);
  const [showAttrHelp, setShowAttrHelp] = useState(false);   // D — 종목별 기여 도움말

  const onDetailClick = (stock: StockSummary) => {
    router.push(`/stock/${stock.code}?from=holding`);
  };

  useEffect(() => {
    fetchHoldings();
    fetchMarketIndices();
    fetchUnreadCount();
    // Fear & Greed는 보유 여부 무관하게 호출. 실패해도 silent.
    stockApi.getFearGreed().then(d => setFearGreed({ score: d.score, label: d.label })).catch(() => {});
  }, [fetchHoldings, fetchMarketIndices, fetchUnreadCount]);

  // 보유 종목 변동 시 샤프·벤치마크 재계산. 보유 0개일 땐 호출 자체 skip.
  useEffect(() => {
    if (holdings.length === 0) { setSharpe(null); setBenchmark(null); return; }
    stockApi.getPortfolioSharpe()
      .then(d => setSharpe(d.sharpe))
      .catch(() => setSharpe(null));
    stockApi.getBenchmark()
      .then(d => setBenchmark(d.available ? d : null))
      .catch(() => setBenchmark(null));
  }, [holdings.length]);

  // 보유 종목별 신호(getSignals) 병렬 조회는 제거 — 유일한 소비처였던 "확인이 필요한 종목"이
  // 은퇴하면서 쓰이지 않는다. 대시보드 로드 시 보유 수만큼의 병렬 호출이 사라진다.
  // (신호 자체는 종목 상세 SignalPanel에 그대로 있다.)

  const fetchHistory = async () => {
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const data = await stockApi.getHoldingsHistory();
      setPortfolioHistory(data);
    } catch (error) {
      console.error('Failed to fetch portfolio history:', error);
      setHistoryError('포트폴리오 추이를 불러오지 못했어요. 네트워크 또는 서버 상태를 확인해 주세요.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (holdings.length > 0) {
      fetchHistory();
    } else {
      setHistoryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length]);

  // 정밀 비중(pct) — 저장된 정수 weight(value)는 도넛 슬라이스 크기에만 쓰고(TASK 2 현행),
  // 범례 라벨은 cost 기준 정밀 비중으로 계산해 1% 미만도 "<1%"로 표시 (TASK 1). recalcWeights 미변경.
  const portfolioData = (() => {
    const tc = holdings.reduce((a, h) => a + (h.avgPrice || 0) * (h.quantity || 0), 0);
    return holdings.length > 0
      ? holdings.map((h, i) => ({
        name: h.name,
        value: h.value,
        pct: tc > 0 ? (h.avgPrice || 0) * (h.quantity || 0) / tc * 100 : 0,
        color: RAMP[i % RAMP.length],
      }))
      : [{ name: '보유 종목 없음', value: 100, pct: 100, color: '#D4D4CE' }];
  })();

  const rawChartData = portfolioHistory.map(d => ({
    date: parseInt(d.date.slice(4, 6)) + '/' + parseInt(d.date.slice(6, 8)),
    fullDate: `${parseInt(d.date.slice(4, 6))}월 ${parseInt(d.date.slice(6, 8))}일`,
    value: d.value,
    cost: d.cost,
    profitRate: d.profitRate,
  }));
  const chartData = rawChartData.map((d, i) => ({
    ...d,
    date: i === rawChartData.length - 1 ? `${d.date} (오늘)` : d.date,
    fullDate: i === rawChartData.length - 1 ? `${d.fullDate} (오늘)` : d.fullDate,
  }));

  // D — 히어로 합계와 종목별 기여 분해가 **같은 함수**를 쓴다. 각자 계산하면 유효행 기준·반올림
  // 차이로 "히어로 -36%인데 기여 합계는 -35%"가 되고, 그 순간 두 숫자 다 못 믿게 된다.
  // (인라인 reduce에서 옮겨옴 — 평단·수량·현재가가 결측인 행은 이제 NaN을 퍼뜨리지 않고 제외된다.)
  const { totalAsset, totalCost, totalPnL, profitRatePct: avgProfitRate } = computePortfolioTotals(holdings);
  const attribution = interpretAttribution(holdings);
  // 보유 목록 행 비중 표시용 정밀 비중 (TASK 1).
  const weightPct = (avg?: number, qty?: number) => totalCost > 0 ? (avg || 0) * (qty || 0) / totalCost * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* A차 — 주목 레이어(보유+관심 현저성 트리아지). 후보 없으면 스스로 null을 렌더한다. */}
      <AttentionBlock />
      {holdings.length === 0 && (
        <Card variant="primary" padding="emphasis">
          <h2 className="text-xl font-bold mb-2 text-center text-ink">무엇부터 시작해 볼까요?</h2>
          <p className="text-muted text-sm mb-6 leading-relaxed text-center max-w-md mx-auto">
            목적에 맞게 골라주세요. 나중에 다른 기능도 전부 쓰실 수 있어요.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { path: '/portfolio?focus=add-holding', title: '내 주식 관리', desc: '보유 종목을 등록해 수익률·의견을 받아요.' },
              // D4 — '살 종목 찾기'는 매수 전제 프레이밍이고, '알고리즘 점수 기반 추천'은
              // D1 이후 사실이 아니다(긍정-필터 소스·점수 노출 모두 은퇴, 목록은 에디터 큐레이션).
              { path: '/recommendations', title: '살펴볼 종목', desc: '에디터가 고른 종목과 조건별 렌즈로 살펴봐요.' },
              { path: '/themes', title: '테마별 종목 탐색', desc: '2차전지·AI·방산 등 관심 테마 모아보기.' },
              { path: '/stocks', title: '주식 공부', desc: '주요 종목과 용어로 기본기를 익혀요.' },
            ].map(c => (
              <button
                key={c.path}
                onClick={() => router.push(c.path)}
                className="p-4 rounded-lg bg-inset border border-line hover:border-ink text-left transition-colors min-h-[44px]"
              >
                <p className="text-sm font-bold text-ink mb-1">{c.title}</p>
                <p className="text-xs text-muted leading-relaxed">{c.desc}</p>
              </button>
            ))}
          </div>
        </Card>
      )}
      {holdings.length > 0 && (() => {
        const gain = avgProfitRate >= 0;
        const dates = holdings.map(h => h.last_updated).filter((d): d is string => !!d);
        const latestTs = dates.length ? Math.max(...dates.map(d => new Date(d).getTime())) : null;
        const stale = latestTs !== null && (Date.now() - latestTs) / 3600000 >= 24;
        return (
          <div>
            {/* 히어로 — 카드 없이 페이지 위에 직접. 숫자 색이 방향을 말하므로 accentBar/상자 불필요 (TASK 1).
                좌: 포트폴리오 숫자·알림 / 우: 자산 배분 도넛(본문 우측 1/3에서 이동).
                2열은 **xl부터** — lg(사이드바 272 + 패딩 80 제외 시 본문 ≈672px)에서 2열로 쪼개면
                우측 컬럼이 ~220px가 되어 도넛(180) + 범례가 들어가지 않는다. 그 아래 폭에선
                단일 컬럼으로 쌓여 도넛이 본문 폭을 다 쓰므로 빈 공간도 생기지 않는다. */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(0,420px)] gap-x-8 gap-y-6">
              <div>
                <p className="text-[13px] text-muted mb-2">내 포트폴리오</p>
                <p className={`text-[80px] leading-none font-extrabold tabular-nums tracking-[-0.02em] ${gain ? 'text-rise' : 'text-fall'}`}>
                  {gain ? '+' : ''}{avgProfitRate.toFixed(2)}%
                </p>
                <p className={`text-[22px] font-bold tabular-nums mt-1 ${gain ? 'text-rise' : 'text-fall'}`}>
                  {totalPnL >= 0 ? '+' : ''}₩{totalPnL.toLocaleString()}
                </p>
                <p className="text-[13px] text-muted tabular-nums mt-3">
                  ₩{totalCost.toLocaleString()} → ₩{totalAsset.toLocaleString()}
                </p>

                {/* 알림 진입점 — 큰 숫자 아래 작은 링크. 없으면 아무것도 띄우지 않는다. */}
                {unreadCount > 0 && (
                  <button onClick={() => router.push('/alerts')}
                    className="mt-4 -ml-2 inline-flex items-center gap-2 px-2 min-h-[44px] lg:min-h-[40px] hover:bg-surface rounded-lg transition-colors">
                    <span className="text-sm font-semibold text-ink">읽지 않은 알림 {unreadCount}개</span>
                    <span className="text-xs text-muted font-bold">확인 →</span>
                  </button>
                )}
              </div>

              {/* 자산 배분 — 본문 우측 1/3에서 히어로로 이동. 내용·팔레트·집중 뱃지·1종목 안내 불변.
                  컬럼 상한 420px은 옮기기 전 1/3 컬럼과 같은 폭이라 도넛/범례 비율이 유지된다. */}
              <div className="bg-surface border border-line rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-6 text-ink">자산 배분 현황</h3>
                {holdings.length === 1 ? (
                  <div className="space-y-4">
                    <div className="bg-inset border border-line rounded-lg p-5 text-center">
                      <p className="text-sm font-bold text-ink mb-1">{holdings[0].name}</p>
                      <p className="text-xs text-muted tabular-nums">비중 100%</p>
                    </div>
                    <div className="bg-caution/5 border border-caution/20 rounded-lg p-4">
                      <p className="text-xs text-caution leading-relaxed">
                        종목을 2개 이상 추가하면 자산 배분 그래프를 볼 수 있어요. 한 종목에 집중하면 그 종목 하락 시 손실이 커져요.
                      </p>
                    </div>
                  </div>
                ) : (
                  // 도넛 180px + 범례는 우측 세로 배치. 2~5조각에 400px는 과하다 (TASK 6).
                  <div className="flex items-center gap-6">
                    <div className="w-[180px] h-[180px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={portfolioData} cx="50%" cy="50%" innerRadius={54} outerRadius={90} paddingAngle={2} dataKey="value">
                            {portfolioData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E7E7E3', borderRadius: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      {portfolioData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }}></span>
                            <span className="text-sm text-muted truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {holdings.length >= 2 && item.value > CONCENTRATION_THRESHOLD && (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-caution/10 text-caution">집중</span>
                            )}
                            <span className="text-sm font-semibold text-ink tabular-nums">{formatWeight(item.pct)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 면책 — 히어로 내용과 구분선으로만 분리 (TASK 1). */}
            <p className="text-xs text-faint mt-6 pt-4 border-t border-line leading-relaxed">
              ※ 위 정보는 알고리즘 분석이에요. 실제 투자 결정은 본인이 직접 해주세요.
              {stale && <span className="text-caution"> · 데이터가 오늘 갱신되지 않았어요</span>}
            </p>
          </div>
        );
      })()}

      {/* 요약 라인 — 카드 없이 한 줄. 시장온도·샤프는 ? 클릭 시 팝오버. */}
      {holdings.length > 0 && (
        <div className="text-sm text-muted tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>보유 {holdings.length}종목</span>
          <span className="text-line-strong">·</span>
          <span>총자산 ₩{totalAsset.toLocaleString()}</span>
          {fearGreed && (<>
            <span className="text-line-strong">·</span>
            <button onClick={() => setShowFGHelp(v => !v)} className="hover:text-ink">시장온도 <span className={fearGreed.score <= 40 ? 'text-fall font-bold' : fearGreed.score >= 60 ? 'text-rise font-bold' : 'font-bold text-ink'}>{fearGreed.score} {fearGreed.label}</span> <span className="text-faint">?</span></button>
          </>)}
          {sharpe !== null && (<>
            <span className="text-line-strong">·</span>
            <button onClick={() => setShowSharpeHelp(v => !v)} className="hover:text-ink">샤프 <span className={sharpe > 0 ? 'text-rise font-bold' : 'text-fall font-bold'}>{sharpe.toFixed(2)}</span> <span className="text-faint">?</span></button>
          </>)}
          {benchmark?.available && benchmark.excessReturn !== undefined && (<>
            <span className="text-line-strong">·</span>
            <button onClick={() => setShowBenchmarkHelp(v => !v)} className="hover:text-ink">KOSPI 대비 <span className={benchmark.excessReturn >= 0 ? 'text-rise font-bold' : 'text-fall font-bold'}>{benchmark.excessReturn >= 0 ? '+' : ''}{benchmark.excessReturn.toFixed(1)}%p</span> <span className="text-faint">?</span></button>
          </>)}
        </div>
      )}
      {holdings.length > 0 && showFGHelp && fearGreed && (
        <Card variant="secondary" padding="base">
          <p className="font-bold text-ink mb-1 text-sm">시장 온도란?</p>
          <p className="text-xs text-muted leading-relaxed">RSI 평균·외국인 매수 비율·52주 고점 근접 종목 수를 종합해 0~100으로 표현해요. 공포(0~40): 많이 내려있을 수 있어요 · 탐욕(60~100): 고점 주의.</p>
          <p className="text-xs text-faint mt-1">※ 참고용이며 실제 시장 예측이 아니에요.</p>
        </Card>
      )}
      {holdings.length > 0 && showSharpeHelp && sharpe !== null && (
        <Card variant="secondary" padding="base">
          <p className="font-bold text-ink mb-1 text-sm">샤프 지수란?</p>
          <p className="text-xs text-muted leading-relaxed">(연환산 수익률 - 무위험금리 3.5%) ÷ 변동성. 보유 종목별 20일 일간 수익률에서 계산해 비중으로 가중평균해요. 1 이상이면 우수한 편이에요.</p>
          <p className="text-xs text-faint mt-1">※ 5일 미만 히스토리는 계산에서 제외돼요.</p>
        </Card>
      )}
      {holdings.length > 0 && showBenchmarkHelp && benchmark?.available && (
        <Card variant="secondary" padding="base">
          <p className="font-bold text-ink mb-1 text-sm">KOSPI 대비 성과란?</p>
          <p className="text-xs text-muted leading-relaxed tabular-nums">
            같은 기간 KOSPI는 {benchmark.benchmarkReturn! >= 0 ? '+' : ''}{benchmark.benchmarkReturn!.toFixed(1)}%인데 내 포트폴리오는 {benchmark.portfolioReturn! >= 0 ? '+' : ''}{benchmark.portfolioReturn!.toFixed(1)}%예요.
            시장보다 {Math.abs(benchmark.excessReturn!).toFixed(1)}%포인트 {benchmark.excessReturn! >= 0 ? '높은' : '낮은'} 성과예요.
          </p>
          <p className="text-xs text-muted leading-relaxed mt-1 tabular-nums">정보비율 {benchmark.informationRatio!.toFixed(2)} — 시장 대비 초과수익의 일관성 지표예요. (높을수록 꾸준히 앞섰다는 뜻)</p>
          <p className="text-xs text-faint mt-1">※ 최근 {benchmark.period} 거래일 기준, 참고용이에요.</p>
        </Card>
      )}

      {/* D — 성과 귀인(종목별 기여). 히어로 손익률을 "왜?"로 잇는 자리라 그 바로 아래 둔다.
          벤치마크 블록과 역할 분리: 벤치마크=시장 대비 / 여기=내 손익의 종목별 출처.
          방향색은 기여 막대·수치에만 — 부호 있는 손익이라 방향이 곧 데이터다. 종목명·라벨은 무채색.
          (ScoringBreakdownPanel의 무채색 ramp 규칙은 '범주를 방향색으로 칠하지 말라'는 것이라
           여기엔 해당하지 않는다. 이 막대는 실제로 손익 방향을 나타낸다.) */}
      {holdings.length > 0 && attribution.available && (() => {
        const rows = attribution.contributions;
        const maxAbs = Math.max(...rows.map(c => Math.abs(c.contribPP)), 0);
        const shown = rows.slice(0, 5);
        const hidden = rows.length - shown.length;
        return (
          <Card variant="secondary" padding="base">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs font-bold text-muted">손익이 어디서 왔나</p>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-caution/10 text-caution">임시 기준</span>
              <button
                onClick={() => setShowAttrHelp(v => !v)}
                className="text-xs text-faint hover:text-ink min-w-[24px] min-h-[24px] flex items-center justify-center font-bold"
                aria-label="종목별 기여 설명"
              >?</button>
            </div>
            <p className="text-sm text-ink leading-relaxed break-keep tabular-nums">{attribution.text}</p>
            {showAttrHelp && (
              <p className="text-xs text-muted leading-relaxed mt-2 break-keep">
                종목별 기여란? 각 종목이 전체 손익률을 몇 %p 움직였는지예요. 전부 합치면 위의 전체 손익률({attribution.portfolioProfitRate.toFixed(1)}%)이 돼요.
                한 종목이 전체 손익 변동의 절반 이상을 차지하는지 보는 기준은 실증 검증 전 임시값이에요.
              </p>
            )}
            {rows.length > 1 && (
              <div className="mt-3 divide-y divide-line">
                {shown.map(c => (
                  <div key={c.code} className="py-2 flex items-center gap-3">
                    <span className="text-xs text-ink truncate flex-1 min-w-0">{c.name}</span>
                    <div className="w-20 sm:w-28 h-1.5 bg-line rounded-full overflow-hidden shrink-0">
                      <div
                        className={`h-full rounded-full ${c.contribPP >= 0 ? 'bg-rise' : 'bg-fall'}`}
                        style={{ width: `${maxAbs > 0 ? Math.round(Math.abs(c.contribPP) / maxAbs * 100) : 0}%` }}
                      />
                    </div>
                    {/* 라벨은 displayPP(최대잔차 배분값) — 이 열의 합이 위 문장의 손익률과 정확히 맞는다.
                        포맷은 문장과 같은 formatPP를 쓴다(각자 포맷하면 -0.0/+0.0이 갈린다).
                        막대 너비만 정밀값 contribPP — 비례 폭이라 표시 반올림과 무관하다. */}
                    <span className={`text-xs font-bold tabular-nums w-16 text-right shrink-0 ${c.displayPP >= 0 ? 'text-rise' : 'text-fall'}`}>
                      {formatPP(c.displayPP)}
                    </span>
                  </div>
                ))}
                {hidden > 0 && (() => {
                  // 접힌 행도 값을 보여준다 — 값 없이 '외 N종목'만 두면 **보이는 열의 합**이
                  // 문장 손익률과 어긋나서, 표시 정합을 맞춘 의미가 5종목 넘는 계정에서 사라진다.
                  const hiddenPP = Math.round(rows.slice(5).reduce((a, c) => a + c.displayPP, 0) * 10) / 10;
                  return (
                    <div className="py-2 flex items-center gap-3">
                      <span className="text-xs text-faint flex-1 min-w-0">외 {hidden}종목</span>
                      <div className="w-20 sm:w-28 shrink-0" />
                      <span className="text-xs text-faint tabular-nums w-16 text-right shrink-0">{formatPP(hiddenPP)}</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        );
      })()}

      <ErrorBanner error={historyError} kind="server" onRetry={fetchHistory} autoRetryMs={3000} />

      {/* 본문 — 도넛이 히어로로 갔으므로 3열 해제. 차트·원장 모두 풀폭(차트는 넓을수록 유리). */}
      <div className="bg-surface border border-line rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-ink">포트폴리오 수익률 추이</h3>
          <span className="text-xs text-faint tabular-nums">최근 {portfolioHistory.length}거래일 기준</span>
        </div>
        {chartData.length > 1 && (
          <p className="text-xs text-faint mb-1 tabular-nums">
            {chartData[0].fullDate} ~ {chartData[chartData.length - 1].fullDate}
          </p>
        )}
        {holdings.length > 0 && chartData.length > 0 && (
          <p className="text-xs text-muted mb-3">평가금액(실선)이 투자원금(파선) <span className="text-rise font-bold">위</span>에 있으면 수익 중, <span className="text-fall font-bold">아래</span>면 손실 중이에요.</p>
        )}
        <div className="h-80 w-full">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-muted">
              <RefreshCw className="animate-spin mr-2" size={20} />
              <span>데이터 로딩 중...</span>
            </div>
          ) : holdings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted text-center px-6">
              <p className="text-sm font-bold mb-2 text-ink">종목을 추가하면 수익률 그래프를 볼 수 있어요</p>
              <button
                onClick={() => router.push('/portfolio')}
                className="mt-3 px-4 py-2.5 bg-ink hover:opacity-90 text-surface text-xs font-bold rounded-lg transition-opacity"
              >
                포트폴리오에 추가하기 →
              </button>
            </div>
          ) : chartData.length > 0 ? (() => {
            const isLoss = avgProfitRate < 0;
            const lineColor = isLoss ? '#1B5FD0' : '#D91C1C'; // 손실=fall(파랑), 수익=rise(빨강)
            // 평가금액·투자원금 두 라인이 모두 들어가는 범위로 Y축 자동 계산 (TASK 7).
            // 0부터 시작하지 않음 — 금액 추이지 절대량 비교가 아님.
            const yVals = chartData.flatMap(d => [d.value, d.cost]);
            const yMin = Math.min(...yVals);
            const yMax = Math.max(...yVals);
            const yPad = (yMax - yMin) * 0.1 || Math.max(yMax * 0.05, 1);
            const yLo = yMin - yPad, yHi = yMax + yPad;
            // 눈금은 딱 떨어지는 값으로 — domain은 데이터 기준, ticks만 nice 반올림 (Fix 3).
            const rawStep = (yHi - yLo) / 5;
            const stepMag = Math.pow(10, Math.floor(Math.log10(rawStep)));
            const stepNorm = rawStep / stepMag;
            const niceStep = (stepNorm <= 1 ? 1 : stepNorm <= 2 ? 2 : stepNorm <= 2.5 ? 2.5 : stepNorm <= 5 ? 5 : 10) * stepMag;
            const yTicks: number[] = [];
            for (let t = Math.ceil(yLo / niceStep) * niceStep; t <= yHi; t += niceStep) yTicks.push(t);
            return (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={lineColor} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E7E3" vertical={false} />
                <XAxis dataKey="date" stroke="#85878D" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#85878D" fontSize={12} tickLine={false} axisLine={false} domain={[yLo, yHi]} ticks={yTicks} tickFormatter={(v) => formatKoreanWon(Number(v))} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E7E7E3', borderRadius: '10px' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                  formatter={(value, name) => [`₩${Number(value ?? 0).toLocaleString()}`, name === 'value' ? '평가금액' : '투자원금']}
                />
                <Legend
                  verticalAlign="top" height={28} iconType="line" iconSize={14}
                  formatter={(v) => v === 'value' ? '평가금액 (현재 가치)' : '투자원금 (산 가격 합계)'}
                />
                <Area type="monotone" dataKey="value" stroke={lineColor} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                <Line type="monotone" dataKey="cost" stroke="#D4D4CE" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            );
          })() : (
            <div className="flex items-center justify-center h-full text-faint">
              <p className="text-sm">보유 종목을 추가하면 수익률 추이가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-ink">내 보유 종목</h3>
          <button
            onClick={() => router.push('/portfolio')}
            className="text-xs text-ink font-bold flex items-center space-x-1 transition-colors px-4 py-3 min-h-[44px]"
          >
            <span>포트폴리오 관리</span>
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="max-h-64 overflow-auto space-y-2 pr-2 custom-scrollbar">
          {holdings.map((stock) => {
            const pnlRate = stock.avgPrice ? ((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100) : 0;
            return (
              <div
                key={stock.code}
                onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}
                className="p-3 bg-inset rounded-lg border border-line hover:border-ink cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-bold text-ink">{stock.name}</p>
                  <p className="text-xs text-faint tabular-nums">{stock.code}</p>
                  <p className="text-xs text-muted tabular-nums">{formatWeight(weightPct(stock.avgPrice, stock.quantity))}</p>
                  {/* 원장은 사실만 — holding_opinion 판단 뱃지(주의 필요/관망/추가 검토)는 제거.
                      '분석 중'은 판단이 아니라 데이터 상태라 유지한다. */}
                  {stock.sma_available === false && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-inset border border-line text-muted">분석 중</span>
                  )}
                </div>
                <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap tabular-nums">
                  <p className="text-xs text-muted">
                    평단 ₩{stock.avgPrice?.toLocaleString()}
                    <span className="text-faint mx-1">→</span>
                    <span className="text-ink">현재 ₩{stock.currentPrice?.toLocaleString()}</span>
                  </p>
                  {stock.quantity > 0 && <p className="text-xs text-muted">x {stock.quantity}주</p>}
                  <p className={`text-xs font-bold ${pnlRate >= 0 ? 'text-rise' : 'text-fall'}`}>
                    {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(1)}%
                  </p>
                  {stock.quantity > 0 && (
                    <p className="text-xs text-muted">평가 ₩{(stock.currentPrice * stock.quantity).toLocaleString()}</p>
                  )}
                </div>
              </div>
            );
          })}
          {holdings.length === 0 && (
            <div className="text-center py-8">
              <p className="text-faint text-sm mb-3">아직 보유 종목이 없습니다.</p>
              <button
                onClick={() => router.push('/portfolio')}
                className="text-xs text-ink font-bold transition-colors px-4 py-3 min-h-[44px]"
              >
                내 포트폴리오에서 종목 추가하기 →
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => router.push('/stocks')}
        className="w-full p-4 bg-surface hover:bg-inset border border-line rounded-xl flex items-center justify-between transition-colors text-left"
      >
        <div>
          <p className="text-sm font-bold text-ink">전체 종목 보기</p>
          <p className="text-xs text-muted mt-0.5">삼성전자, 현대차 등 업종별 주요 종목을 살펴보세요</p>
        </div>
        <span className="text-ink">→</span>
      </button>
    </div>
  );
}
