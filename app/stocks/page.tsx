'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Trash2, X } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import ErrorBanner from '@/components/ui/ErrorBanner';
import type { Stock, StockSummary } from '@/types/stock';

const CATEGORY_ORDER = [
  '기술/IT',
  '바이오/헬스케어',
  '자동차/모빌리티',
  '에너지/소재',
  '금융/지주',
  '소비재/서비스',
  '엔터테인먼트/미디어',
  '조선/기계/방산',
];

// 3.9차 — 학습 모드 기초 가이드
const LEARN_TIPS = [
  {
    title: '종목을 어떻게 고르나요?',
    desc: '처음에는 자신이 알고 있는 회사부터 시작해보세요. 삼성전자, 현대차, NAVER처럼 평소에 듣던 이름의 회사를 검색해보세요.',
    action: '삼성전자 보러가기 →',
    href: '/stock/005930?from=major',
  },
  {
    title: 'PER이 뭔가요?',
    desc: '주가가 1년 이익의 몇 배인지 보여줘요. 15배면 "이 회사 이익의 15년치 가격"이라는 뜻이에요. 낮을수록 저렴할 수 있지만, 같은 업종끼리 비교해야 해요.',
    action: '저평가 종목 보기 →',
    href: '/screener',
  },
  {
    title: '종목을 어떻게 볼까요?',
    desc: '정답은 없어요. 실적(ROE)·가격(PER)·추세(이평선)를 함께 보면 도움이 돼요. 한 지표만으로 판단하지 마세요.',
    action: '살펴볼 종목 보기 →',   // D4 — '추천' 프레이밍 제거
    href: '/recommendations',
  },
];

export default function MajorStocksPage() {
  const router = useRouter();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Stock | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 3.9차 — 온보딩에서 '주식 기초부터 이해하기'를 선택한 경우 학습 배너 표시
  const [isLearnMode, setIsLearnMode] = useState(false);
  const [learnStep, setLearnStep] = useState(0);
  useEffect(() => {
    setIsLearnMode(typeof window !== 'undefined' && localStorage.getItem('onboarding_mode') === 'learn');
  }, []);
  const closeLearnMode = () => {
    localStorage.removeItem('onboarding_mode');
    setIsLearnMode(false);
  };

  const onDetailClick = (stock: StockSummary) => {
    router.push(`/stock/${stock.code}?from=major`);
  };

  const fetchStocks = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await stockApi.getAllStocks();
      setStocks(data);
    } catch (err) {
      console.error('Failed to fetch stocks:', err);
      setError('종목 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, []);

  const requestDelete = (e: React.MouseEvent, stock: Stock) => {
    e.stopPropagation();
    setPendingDelete(stock);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await stockApi.deleteStock(pendingDelete.code);
      setPendingDelete(null);
      fetchStocks();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('종목 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>전체 종목 현황 로드 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-ink mb-2">주요 종목 현황</h2>
        <p className="text-muted text-sm">업종별 주요 종목의 실시간 시세와 추세를 한눈에 확인하세요.</p>
        {stocks.length > 0 && (
          <p className="text-muted text-sm font-bold mt-2 tabular-nums">
            {stocks.length}개 종목 · {new Set(stocks.map(s => s.category)).size}개 섹터
          </p>
        )}
        <p className="text-faint text-xs mt-2">※ ▲/▼ 등락률은 <span className="text-muted font-bold">전일 종가 대비</span> 변동분이에요.</p>
      </div>

      {/* 3.9차 — 학습 모드 기초 가이드 배너 */}
      {isLearnMode && (
        <div className="bg-surface border border-line-strong shadow-sm rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-ink">
              주식 기초 가이드 ({learnStep + 1}/{LEARN_TIPS.length})
            </p>
            <button
              onClick={closeLearnMode}
              className="text-xs text-muted hover:text-ink min-h-[44px] px-3"
            >
              닫기
            </button>
          </div>
          <h3 className="text-base font-bold text-ink mb-2">{LEARN_TIPS[learnStep].title}</h3>
          <p className="text-sm text-muted leading-relaxed mb-4">{LEARN_TIPS[learnStep].desc}</p>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(LEARN_TIPS[learnStep].href)}
              className="flex-1 py-3 min-h-[44px] bg-ink hover:opacity-90 text-surface text-xs font-bold rounded-xl transition-opacity"
            >
              {LEARN_TIPS[learnStep].action}
            </button>
            {learnStep < LEARN_TIPS.length - 1 ? (
              <button
                onClick={() => setLearnStep(s => s + 1)}
                className="py-3 px-4 min-h-[44px] bg-surface border border-line-strong hover:bg-inset text-ink text-xs font-bold rounded-xl transition-colors"
              >
                다음 팁 →
              </button>
            ) : (
              <button
                onClick={closeLearnMode}
                className="py-3 px-4 min-h-[44px] bg-surface border border-line-strong hover:bg-inset text-ink text-xs font-bold rounded-xl transition-colors"
              >
                완료
              </button>
            )}
          </div>
        </div>
      )}

      <ErrorBanner error={error} kind="server" onRetry={fetchStocks} />

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-xl p-6 max-w-md w-full space-y-4 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold text-ink">{pendingDelete.name}을(를) 삭제할까요?</h3>
              <button onClick={() => setPendingDelete(null)} className="text-muted hover:text-ink p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="닫기">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              이 종목에 연결된 <span className="text-caution font-bold">보유 내역, 관심 종목, 알림</span>이 모두 사라져요.
              이 작업은 되돌릴 수 없어요.
            </p>
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 py-3 bg-surface border border-line-strong hover:bg-inset text-ink text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-caution hover:opacity-90 text-surface text-sm font-bold rounded-xl transition-opacity disabled:opacity-50"
              >
                {deleting ? '삭제 중...' : '삭제할게요'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-10">
        {CATEGORY_ORDER.map(category => {
          const categoryStocks = stocks.filter(s => s.category === category);
          if (categoryStocks.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <h3 className="text-lg font-bold text-ink">
                {category}
                <span className="text-xs font-normal text-faint ml-2 tabular-nums">({categoryStocks.length}종목)</span>
              </h3>
              <div className="divide-y divide-line border-t border-line">
                {categoryStocks.map(stock => (
                  <div
                    key={stock.code}
                    onClick={() => onDetailClick(stock)}
                    className="group flex items-center justify-between gap-3 py-3 px-1 min-h-[44px] hover:bg-surface cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{stock.name}</p>
                      <p className="text-xs text-faint tabular-nums">{stock.code}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-ink tabular-nums">{stock.price?.toLocaleString()}원</p>
                        {stock.change_rate && !['0', '0.00', '+0.00', '-0.00'].includes(stock.change_rate) && (() => {
                          const rate = parseFloat(stock.change_rate);
                          const up = rate > 0;
                          return (
                            <p className={`text-xs font-bold tabular-nums ${up ? 'text-rise' : rate < 0 ? 'text-fall' : 'text-muted'}`}>
                              {up ? '▲' : rate < 0 ? '▼' : ''} {stock.change_rate}%
                            </p>
                          );
                        })()}
                      </div>
                      {/* M1 — market_opinion 판정 뱃지 제거(R2). 목록은 사실(가격·등락률)만 나열한다. */}
                      <button
                        onClick={(e) => requestDelete(e, stock)}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted hover:text-ink transition-colors"
                        title="종목 삭제"
                        aria-label={`${stock.name} 삭제`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
