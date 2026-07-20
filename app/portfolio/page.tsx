'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import StockSearchInput from '@/components/stock/StockSearchInput';
import WatchlistContent from '@/components/portfolio/WatchlistContent';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { usePortfolioStore } from '@/stores/usePortfolioStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Holding, StockSummary } from '@/types/stock';

interface EditState {
  avgPrice: string;
  quantity: string;
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={null}>
      <PortfolioContent />
    </Suspense>
  );
}

function PortfolioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focus = searchParams.get('focus');
  const holdings = usePortfolioStore(s => s.holdings);
  const onAdd = usePortfolioStore(s => s.addHolding);
  const onUpdate = usePortfolioStore(s => s.updateHolding);
  const onDelete = usePortfolioStore(s => s.deleteHolding);
  const portfolioError = usePortfolioStore(s => s.error);
  const refetchHoldings = usePortfolioStore(s => s.fetchHoldings);
  const addToast = useToastStore(s => s.addToast);

  const onDetailClick = (stock: StockSummary) => {
    const isHolding = stock.category === '보유 종목';
    router.push(`/stock/${stock.code}?from=${isHolding ? 'holding' : 'watchlist'}`);
  };

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ avgPrice: '', quantity: '' });
  const [newStock, setNewStock] = useState<{ code: string; name: string } | null>(null);
  const [newForm, setNewForm] = useState({ avgPrice: '', quantity: '' });
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [subTab, setSubTab] = useState<'holdings' | 'watchlist'>('holdings');
  const [firstStockGuide, setFirstStockGuide] = useState<{ code: string; name: string } | null>(null);
  const [profitHelpCode, setProfitHelpCode] = useState<string | null>(null);
  const profitHelpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profitHelpCode) return;
    const onMouseDown = (e: MouseEvent) => {
      if (profitHelpRef.current && !profitHelpRef.current.contains(e.target as Node)) {
        setProfitHelpCode(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [profitHelpCode]);

  useEffect(() => {
    refetchHoldings();
  }, [refetchHoldings]);

  // H1: 첫 종목 가이드 처리 (add-holding focus는 폼 상시 노출 변경으로 무의미)
  useEffect(() => {
    // 조건 강화: holdings.length === 1 (정확히 첫 종목 추가 직후에만 노출)
    if (focus === 'first-stock-guide' && holdings.length === 1 && !localStorage.getItem('onboarding_first_stock_guided')) {
      const just = holdings[0];
      setFirstStockGuide({ code: just.code, name: just.name });
      localStorage.setItem('onboarding_first_stock_guided', '1');
    }
    // 종목 0개로 떨어지면 가이드 카드 즉시 제거
    if (holdings.length === 0 && firstStockGuide) {
      setFirstStockGuide(null);
    }
  }, [focus, holdings, firstStockGuide]);

  const handleAdd = async () => {
    if (!newStock || !newForm.avgPrice) return;
    const justAdded = newStock;
    const wasFirstStock = holdings.length === 0 && !localStorage.getItem('onboarding_first_stock_guided');
    try {
      await onAdd({
        code: justAdded.code,
        name: justAdded.name,
        avgPrice: parseInt(newForm.avgPrice),
        quantity: parseInt(newForm.quantity || '0'),
        value: 0,
      });
      if (wasFirstStock) {
        setFirstStockGuide({ code: justAdded.code, name: justAdded.name });
        localStorage.setItem('onboarding_first_stock_guided', '1');
      } else {
        addToast(
          `${justAdded.name}을(를) 추가했어요! 종목 상세에서 분석 결과를 확인해보세요.`,
          'success',
          { label: '보러가기', onClick: () => onDetailClick({ ...justAdded, category: '보유 종목' }) },
        );
      }
      setNewStock(null);
      setNewForm({ avgPrice: '', quantity: '' });
      setSearchResetKey(k => k + 1);
    } catch {
      addToast('종목 추가에 실패했습니다.', 'error');
    }
  };

  const startEdit = (stock: Holding) => {
    setEditingCode(stock.code);
    setEditState({ avgPrice: String(stock.avgPrice || ''), quantity: String(stock.quantity || '0') });
  };

  const handleUpdate = async (stock: Holding) => {
    try {
      await onUpdate({
        code: stock.code,
        name: stock.name,
        avgPrice: parseInt(editState.avgPrice),
        quantity: parseInt(editState.quantity || '0'),
        value: 0,
      });
      setEditingCode(null);
      addToast(`${stock.name} 보유 정보가 수정되었습니다.`, 'success');
    } catch {
      addToast('수정에 실패했습니다.', 'error');
    }
  };

  const handleDelete = async (stock: Holding) => {
    if (!window.confirm(`${stock.name}을(를) 포트폴리오에서 삭제하시겠습니까?`)) return;
    try {
      await onDelete(stock.code);
      addToast(`${stock.name}이(가) 삭제되었습니다.`, 'success');
    } catch {
      addToast('삭제에 실패했습니다.', 'error');
    }
  };

  const totalInvested = holdings.reduce((sum, h) => sum + (h.avgPrice || 0) * (h.quantity || 0), 0);
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.currentPrice || 0) * (h.quantity || 0), 0);
  const totalProfit = totalCurrent - totalInvested;
  const totalProfitRate = totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-ink mb-3">내 종목 관리</h2>
        <div className="flex items-center gap-1 bg-inset rounded-xl p-1 border border-line w-fit">
          <button onClick={() => setSubTab('holdings')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${subTab === 'holdings' ? 'bg-ink text-surface' : 'text-muted hover:text-ink'}`}>보유종목</button>
          <button onClick={() => setSubTab('watchlist')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${subTab === 'watchlist' ? 'bg-ink text-surface' : 'text-muted hover:text-ink'}`}>관심종목</button>
        </div>
      </div>

      <ErrorBanner error={portfolioError} kind="server" onRetry={refetchHoldings} />

      {subTab === 'watchlist' && <WatchlistContent onDetailClick={onDetailClick} />}

      {subTab === 'holdings' && <>
      {/* 요약 — 4칸 카드 대신 한 덩어리. 총 수익률이 앵커, 나머지는 보조 라인. */}
      {holdings.length > 0 && (
        <div>
          <p className="text-[13px] text-muted mb-1">총 수익률</p>
          <p className={`text-3xl font-extrabold tabular-nums ${totalProfitRate >= 0 ? 'text-rise' : 'text-fall'}`}>
            {totalProfitRate >= 0 ? '+' : ''}{totalProfitRate.toFixed(2)}%
          </p>
          <p className="text-sm text-muted tabular-nums mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>보유 {holdings.length}종목</span>
            <span className="text-line-strong">·</span>
            <span>투자 ₩{totalInvested.toLocaleString()}</span>
            <span className="text-line-strong">→</span>
            <span className="text-ink">평가 ₩{totalCurrent.toLocaleString()}</span>
            <span className="text-line-strong">·</span>
            <span className={totalProfit >= 0 ? 'text-rise font-bold' : 'text-fall font-bold'}>
              손익 {totalProfit >= 0 ? '+' : ''}₩{totalProfit.toLocaleString()}
            </span>
          </p>
        </div>
      )}

      {/* 새 종목 추가 — 폼은 실제로 묶이는 그룹이므로 카드 유지. */}
      <div className="bg-surface border border-line rounded-xl p-6">
        <h3 className="text-sm font-bold text-ink mb-4">새 종목 추가</h3>
          <div className="space-y-3">
            <StockSearchInput
              placeholder="추가할 종목명을 검색하세요 (예: 삼성전자)"
              onSelect={(stock) => setNewStock({ code: stock.code, name: stock.name })}
              resetKey={searchResetKey}
              className="w-full"
            />
            {newStock && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink bg-inset border border-line px-3 py-1.5 rounded-lg font-bold tabular-nums">
                    {newStock.name} ({newStock.code})
                  </span>
                  <button onClick={() => { setNewStock(null); setSearchResetKey(k => k + 1); }} className="text-muted hover:text-ink px-2 py-1 min-h-[44px] flex items-center gap-1">
                    <X size={14} />
                    <span className="text-xs">취소</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-ink mb-1 block font-bold">내가 산 평균 가격 (원)</label>
                    <input type="number" placeholder="예: 70000" value={newForm.avgPrice} onChange={(e) => setNewForm({ ...newForm, avgPrice: e.target.value })} className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
                    <p className="text-xs text-muted mt-1 leading-relaxed">여러 번 나눠 샀다면 평균을 입력해요. 예: 10만원에 5주, 11만원에 5주 → 105,000원</p>
                  </div>
                  <div>
                    <label className="text-xs text-ink mb-1 block font-bold">보유 주식 수 (주)</label>
                    <input type="number" placeholder="예: 10" value={newForm.quantity} onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })} className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink placeholder:text-faint" />
                    <p className="text-xs text-muted mt-1 leading-relaxed">증권사 앱 → 보유 종목에서 확인할 수 있어요.</p>
                  </div>
                </div>
                <div className="pt-2">
                  <button onClick={handleAdd} disabled={!newForm.avgPrice} className="bg-ink hover:opacity-90 disabled:bg-inset disabled:text-faint text-surface px-5 py-3 min-h-[44px] rounded-xl text-xs font-bold transition-opacity w-full sm:w-auto">추가</button>
                </div>
              </div>
            )}
          </div>
        </div>

      {firstStockGuide && (
        <div className="bg-surface border border-line-strong shadow-sm rounded-xl p-6 relative">
          <button onClick={() => setFirstStockGuide(null)} className="absolute top-4 right-4 text-faint hover:text-ink p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="가이드 닫기">
            <X size={18} />
          </button>
          <h3 className="text-lg font-bold text-ink mb-3">첫 종목을 추가했어요</h3>
          <div className="text-sm text-muted leading-relaxed mb-4 space-y-2">
            <p className="font-bold text-ink">지금 할 수 있는 것:</p>
            <ul className="space-y-1.5 pl-1">
              <li>· <span className="font-bold text-ink">종목 분석 보기</span> — {firstStockGuide.name}의 10점 종합점수, 기술지표, 업종 비교 확인하기</li>
              <li>· 지표가 어렵게 느껴진다면 각 항목의 <span className="font-bold text-ink">?</span> 버튼으로 용어 설명 보기</li>
              <li>· <span className="text-ink font-medium">추천 탭</span>에서 다른 종목도 살펴보기</li>
            </ul>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => { onDetailClick({ code: firstStockGuide.code, name: firstStockGuide.name, category: '보유 종목' }); setFirstStockGuide(null); }} className="px-5 py-3 bg-ink hover:opacity-90 text-surface text-sm font-bold rounded-xl transition-opacity">종목 분석 보기 →</button>
            <button onClick={() => setFirstStockGuide(null)} className="px-5 py-3 bg-surface border border-line-strong hover:bg-inset text-ink text-sm font-bold rounded-xl transition-colors">나중에 볼게요</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {holdings.map((stock) => {
          const profit = stock.currentPrice && stock.avgPrice ? (stock.currentPrice - stock.avgPrice) : 0;
          const profitRate = stock.avgPrice ? (profit / stock.avgPrice * 100).toFixed(2) : '0';
          const isEditing = editingCode === stock.code;
          const evalAmount = (stock.currentPrice || 0) * (stock.quantity || 0);
          const weight = stock.value || 0;
          const concentrated = weight > 50;
          return (
            <div key={stock.code} className={`bg-surface border ${concentrated ? 'border-caution/40' : 'border-line'} rounded-xl p-6 transition-colors group`}>
              {concentrated && (
                <div className="mb-4 p-3 bg-caution/5 border border-caution/20 rounded-xl text-xs text-caution leading-relaxed">
                  <span className="font-bold">{stock.name} 비중이 {weight}%예요.</span> 한 종목에 집중되면 이 종목 하락 시 손실이 커져요. 분산 투자를 검토해보세요.
                </div>
              )}
              <div className="flex justify-between items-start mb-5">
                <div className="cursor-pointer min-w-0" onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}>
                  <h3 className="text-lg font-bold text-ink transition-colors truncate">{stock.name}</h3>
                  <p className="text-xs text-faint tabular-nums">{stock.code}</p>
                </div>
                <div className="text-right relative shrink-0 ml-3">
                  <div className="flex items-center justify-end gap-1.5 mb-1">
                    <p className="text-xs text-faint">수익률</p>
                    <button onClick={(e) => { e.stopPropagation(); setProfitHelpCode(profitHelpCode === stock.code ? null : stock.code); }} className="text-faint hover:text-ink min-w-[24px] min-h-[24px] flex items-center justify-center text-xs font-bold" aria-label="수익률 계산식">?</button>
                  </div>
                  {profitHelpCode === stock.code && (
                    <div ref={profitHelpRef} className="absolute right-0 top-7 z-10 w-64 bg-surface border border-line-strong rounded-xl p-3 shadow-lg text-left">
                      <p className="text-xs text-muted leading-relaxed tabular-nums">수익률 = (현재가 - 평단가) ÷ 평단가 × 100</p>
                      <p className="text-xs text-faint leading-relaxed mt-2 tabular-nums">예: 평단가 70,000원, 현재가 73,500원<br />→ (73,500 - 70,000) ÷ 70,000 × 100 = <span className="text-rise font-bold">+5.0%</span></p>
                      <button onClick={() => setProfitHelpCode(null)} className="text-xs text-ink font-bold mt-2">알겠어요</button>
                    </div>
                  )}
                  <p className={`text-xl font-extrabold tabular-nums ${parseFloat(profitRate) >= 0 ? 'text-rise' : 'text-fall'}`}>
                    {parseFloat(profitRate) >= 0 ? '+' : ''}{profitRate}%
                  </p>
                  {/* 6-3: holding_opinion='매도'일 땐 [주의 필요] 뱃지 + 설명이 이미 아래에 나오므로
                      수익률 행동 유도 텍스트는 숨겨서 중복 경고를 피한다. */}
                  {stock.holding_opinion !== '매도' && (
                  <p className={`text-xs mt-0.5 ${
                    parseFloat(profitRate) >= 0 ? 'text-rise' :
                    parseFloat(profitRate) >= -3 ? 'text-muted' :
                    parseFloat(profitRate) >= -7 ? 'text-caution' :
                    'text-fall'
                  }`}>
                    {parseFloat(profitRate) >= 20 ? '목표 수익 달성!' :
                     parseFloat(profitRate) >= 10 ? '잘 하고 계세요! 추세를 유지해 보세요' :
                     parseFloat(profitRate) >= 0 ? '소폭 수익 중이에요. 지켜보세요' :
                     parseFloat(profitRate) >= -3 ? '소폭 손실이에요. 주식은 단기 등락이 있어요. 조금 더 지켜볼까요?' :
                     parseFloat(profitRate) >= -7 ? '손실이 나고 있어요. 시장 상황을 지켜봐요' :
                     '손실이 커지고 있어요. 해당 종목의 분석을 다시 확인해보세요'}
                  </p>
                  )}
                </div>
              </div>

              {(stock.holding_opinion || stock.market_opinion) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {stock.holding_opinion && stock.sma_available === false ? (() => {
                    const days = stock.last_updated
                      ? Math.max(0, Math.floor((Date.now() - new Date(stock.last_updated).getTime()) / 86400000))
                      : null;
                    const dLabel = days !== null ? `D+${days}` : null;
                    return (
                      <div className="text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-inset text-muted border-line">
                        분석 중{dLabel && <span className="text-faint ml-1">({dLabel})</span>}
                        <span className="font-normal text-faint ml-1">
                          이평선 데이터를 수집 중이에요. 5영업일 이상 누적되면 의견이 표시돼요.
                        </span>
                      </div>
                    );
                  })() : stock.holding_opinion && (() => {
                    const displayLabel =
                      stock.holding_opinion === '매도' ? '주의 필요' :
                      stock.holding_opinion === '추가매수' ? '추가 검토' :
                      stock.holding_opinion;
                    const cautionLike = stock.holding_opinion === '매도' || stock.holding_opinion === '추가매수';
                    const lossRate = (stock.avgPrice && stock.currentPrice) ? ((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100) : null;
                    const reason =
                      stock.holding_opinion === '매도' && lossRate !== null
                        ? lossRate <= -7 ? '손실이 커지고 있어요. 해당 종목의 분석을 다시 확인해보세요' : '5일·20일 평균 모두 아래로 내려갔어요. 하락 추세예요.'
                        : stock.holding_opinion === '관망' ? '5일 평균 아래지만 20일 평균이 지지 중이에요. 조금 기다려봐요.'
                        : stock.holding_opinion === '추가매수' ? '5일 평균 부근에서 지지받고 있어요.'
                        : '5일 평균 위, 이평선 정배열이에요. 상승 흐름이 이어지고 있어요.';
                    return (
                      <div className="w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block text-xs font-bold px-2.5 py-1.5 rounded-lg border ${
                            stock.holding_opinion === '매도' ? 'bg-fall/10 text-fall border-fall/20' :
                            stock.holding_opinion === '관망' ? 'bg-caution/10 text-caution border-caution/20' :
                            stock.holding_opinion === '추가매수' ? 'bg-rise/10 text-rise border-rise/20' :
                            'bg-inset text-muted border-line'
                          }`}>[{displayLabel}]</span>
                          <button onClick={() => onDetailClick({ ...stock, category: '보유 종목' })} className="text-xs text-ink font-medium hover:underline">상세 보기 →</button>
                        </div>
                        <p className="mt-1.5 text-xs font-normal text-muted leading-relaxed">{reason}</p>
                        {cautionLike && <p className="mt-1 text-xs text-faint italic leading-relaxed">이 신호는 참고용이에요. 판단은 본인이 해주세요. 실제 거래는 증권사 앱에서 직접 진행해 주세요.</p>}
                        {/* 3.9차 — 매도/관망 상태에 행동 가이드 스텝 추가 */}
                        {stock.holding_opinion === '매도' && (
                          <div className="mt-3 p-3 bg-inset border border-line rounded-xl">
                            <p className="text-xs font-bold text-ink mb-2">지금 할 수 있는 것</p>
                            <div className="space-y-2">
                              <div className="flex items-start gap-2">
                                <span className="text-faint text-xs shrink-0 mt-0.5 tabular-nums">1.</span>
                                <button
                                  onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}
                                  className="text-xs text-ink font-medium hover:underline text-left leading-relaxed min-h-[44px] flex items-center"
                                >
                                  종목 상세에서 최근 이평선·거래량 변화 확인하기 →
                                </button>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-faint text-xs shrink-0 mt-0.5 tabular-nums">2.</span>
                                <p className="text-xs text-muted leading-relaxed">손실 허용 범위 스스로 결정하기 (예: "이 이상 내려가면 정리")</p>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-faint text-xs shrink-0 mt-0.5 tabular-nums">3.</span>
                                <p className="text-xs text-muted leading-relaxed">결정했다면 실제 매도는 증권사 앱에서 직접 진행</p>
                              </div>
                            </div>
                          </div>
                        )}
                        {stock.holding_opinion === '관망' && (
                          <div className="mt-3 p-3 bg-inset border border-line rounded-xl">
                            <p className="text-xs font-bold text-ink mb-2">지금 할 수 있는 것</p>
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-faint text-xs shrink-0 mt-0.5 tabular-nums">1.</span>
                                <button
                                  onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}
                                  className="text-xs text-ink font-medium hover:underline text-left leading-relaxed min-h-[44px] flex items-center"
                                >
                                  20일 평균선(중기 이동평균)이 차트에서 지지하는지 확인해보세요 →
                                </button>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-faint text-xs shrink-0 mt-0.5 tabular-nums">2.</span>
                                <p className="text-xs text-muted leading-relaxed">추가 하락 시 어디서 정리할지 미리 생각해두세요</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {stock.market_opinion && (
                    <span className={`text-xs font-bold px-2 py-1.5 rounded-lg ${
                      stock.market_opinion === '긍정적' ? 'bg-rise/10 text-rise' :
                      stock.market_opinion === '부정적' ? 'bg-fall/10 text-fall' :
                      'bg-inset text-muted'
                    }`}>시장: {stock.market_opinion}</span>
                  )}
                </div>
              )}

              {isEditing ? (
                <div className="space-y-3 mb-5 p-4 bg-inset border border-line rounded-xl">
                  <p className="text-xs text-ink font-bold">보유 정보 수정</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-ink mb-1 block font-bold">내가 산 평균 가격 (원)</label>
                      <input type="number" value={editState.avgPrice} onChange={(e) => setEditState({ ...editState, avgPrice: e.target.value })} className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink" />
                    </div>
                    <div>
                      <label className="text-xs text-ink mb-1 block font-bold">보유 주식 수 (주)</label>
                      <input type="number" value={editState.quantity} onChange={(e) => setEditState({ ...editState, quantity: e.target.value })} className="w-full bg-surface border border-line-strong rounded-xl px-4 py-3 text-sm text-ink tabular-nums focus:outline-none focus:border-ink" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditingCode(null)} className="px-4 py-3 min-h-[44px] text-xs text-muted hover:text-ink rounded-lg flex items-center gap-1">
                      <X size={14} /><span>취소</span>
                    </button>
                    <button onClick={() => handleUpdate(stock)} className="px-4 py-3 min-h-[44px] bg-ink hover:opacity-90 text-surface text-xs font-bold rounded-lg flex items-center gap-1 transition-opacity">
                      <Check size={12} /><span>저장</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="p-3 bg-inset rounded-lg">
                    <p className="text-xs text-muted mb-1">평균 매수가 (1주당)</p>
                    <p className="text-sm font-bold text-ink tabular-nums">₩{stock.avgPrice?.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-inset rounded-lg">
                    <p className="text-xs text-muted mb-1">현재가</p>
                    <p className="text-sm font-bold text-ink tabular-nums">₩{stock.currentPrice != null ? stock.currentPrice.toLocaleString() : '---'}</p>
                  </div>
                  <div className="p-3 bg-inset rounded-lg">
                    <p className="text-xs text-muted mb-1">수량</p>
                    <p className="text-sm font-bold text-ink tabular-nums">{stock.quantity || 0}주</p>
                  </div>
                  <div className="p-3 bg-inset rounded-lg">
                    <p className="text-xs text-muted mb-1">평가금액 (현재 가치)</p>
                    <p className="text-sm font-bold text-ink tabular-nums">₩{evalAmount.toLocaleString()}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => onDetailClick({ ...stock, category: '보유 종목' })} className="flex-1 py-3 min-h-[44px] bg-surface border border-line-strong text-ink hover:bg-inset rounded-xl text-xs font-bold transition-colors flex items-center justify-center">
                  상세 분석 →
                </button>
                {!isEditing && (
                  <button onClick={() => startEdit(stock)} className="py-3 px-4 min-h-[44px] bg-surface border border-line text-muted hover:bg-inset hover:text-ink rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5">
                    <Pencil size={12} /><span>수정</span>
                  </button>
                )}
                <button onClick={() => handleDelete(stock)} className="py-3 px-4 min-h-[44px] bg-surface border border-line text-muted hover:bg-inset hover:text-ink rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5">
                  <Trash2 size={14} /><span>삭제</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {holdings.length === 0 && (
        <div className="text-center py-12 bg-inset border border-dashed border-line-strong rounded-xl">
          <p className="text-ink font-bold text-lg mb-2">아직 보유 종목이 없어요</p>
          <p className="text-muted text-sm mb-6">위 폼에서 가진 주식을 추가하면 수익률을 한눈에 볼 수 있어요</p>
          <button onClick={() => router.push('/recommendations')} className="px-6 py-3 bg-ink hover:opacity-90 text-surface rounded-xl text-sm font-bold transition-opacity">추천 종목 보기</button>
        </div>
      )}
      </>}
    </div>
  );
}
