'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import RecommendedStockCard from '@/components/stock/RecommendedStockCard';
import type { Recommendation, StockSummary } from '@/types/stock';

export default function RecommendationsPage() {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const onDetailClick = (stock: StockSummary) => {
    router.push(`/stock/${stock.code}?from=recommendation`);
  };

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const data = await stockApi.getRecommendations();
        setRecommendations(data);
      } catch (error) {
        console.error('Failed to fetch recommendations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendations();
  }, []);

  const categories = Array.from(new Set(recommendations.map(r => r.category)));
  const filtered = activeCategory
    ? recommendations.filter(r => r.category === activeCategory)
    : recommendations;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>유망 종목 분석 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink mb-2">오늘의 유망 종목</h2>
          <p className="text-muted text-sm">시장 데이터를 분석해 적정가 대비 저평가된 종목을 선별했어요.</p>
          <p className="text-xs text-faint mt-1">아래 종목들은 알고리즘이 분석한 참고 정보예요. 투자 결정은 항상 본인이 직접 판단해주세요.</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            stockApi.getRecommendations().then(data => {
              setRecommendations(data);
            }).catch(error => {
              console.error('Recommendations refresh failed:', error);
            }).finally(() => {
              setLoading(false);
            });
          }}
          className="px-4 py-2.5 min-h-[44px] bg-ink text-surface rounded-xl text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-2 shrink-0"
        >
          <RefreshCw size={14} />
          <span>업데이트</span>
        </button>
      </div>

      {/* 3.9차 — 이 종목들이 왜 추천됐는지 결론형 안내 */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <p className="text-sm font-bold text-ink mb-1">이 종목들은 왜 추천됐나요?</p>
        <p className="text-xs text-muted leading-relaxed">
          지표상 저평가됐거나 상승 신호가 나타난 종목이에요.
          <span className="text-ink font-medium"> 관심 있는 종목을 클릭해서 상세 분석을 확인해보세요.</span>
          <br />
          마음에 드는 종목은 관심 종목에 추가하거나 포트폴리오에 등록할 수 있어요.
        </p>
      </div>

      {/* 3.7차 — 테마 탐색 진입 배너 (3.9차β: 모바일 가시성 강화 — 테두리 진하게 + 압축 문구).
          3.14차: md:hidden — 사이드바(md:flex "테마 탐색")가 나타나는 데스크톱/태블릿에선 중복이라 숨긴다.
          모바일(md 미만)은 사이드바 접근 경로가 없어 이 배너가 /themes 진입로라 유지. */}
      <div className="md:hidden bg-surface border border-line-strong rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 mr-3">
          <p className="text-sm font-bold text-ink">테마로 종목 찾기</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            2차전지·AI·방산 등 관심 테마 종목 모아보기
          </p>
        </div>
        <button
          onClick={() => router.push('/themes')}
          className="shrink-0 px-4 py-3 min-h-[44px] bg-ink hover:opacity-90 text-surface text-xs font-bold rounded-xl transition-opacity whitespace-nowrap"
        >
          테마 보기 →
        </button>
      </div>

      {recommendations.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-inset rounded-lg p-4 text-center">
            <p className="text-2xl font-black text-ink tabular-nums">{recommendations.length}</p>
            <p className="text-xs text-muted mt-1">추천 종목 수</p>
          </div>
          <div className="bg-inset rounded-lg p-4 text-center">
            <p className="text-2xl font-black text-ink tabular-nums">{categories.length}</p>
            <p className="text-xs text-muted mt-1">업종 분야</p>
          </div>
          {(() => {
            const manual = recommendations.filter(r => r.source === 'manual');
            const avg = manual.length > 0
              ? Math.round(manual.reduce((a, r) => a + r.score, 0) / manual.length)
              : null;
            return (
              <div className="bg-inset rounded-lg p-4 text-center">
                <p className="text-2xl font-black text-ink tabular-nums">
                  {avg !== null ? avg : '—'}
                </p>
                <p className="text-xs text-muted mt-1">전문가 선정 평균 점수</p>
              </div>
            );
          })()}
        </div>
      )}

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-colors ${
              activeCategory === null
                ? 'bg-ink text-surface'
                : 'bg-surface border border-line text-muted hover:text-ink hover:border-line-strong'
            }`}
          >
            전체 ({recommendations.length})
          </button>
          {categories.map(cat => {
            const count = recommendations.filter(r => r.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-colors ${
                  activeCategory === cat
                    ? 'bg-ink text-surface'
                    : 'bg-surface border border-line text-muted hover:text-ink hover:border-line-strong'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(stock => (
            <RecommendedStockCard key={stock.code} stock={stock} onDetailClick={onDetailClick} />
          ))}
        </div>
      ) : (() => {
        const hour = parseInt(
            new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(new Date()),
            10
        );
        let headline = '지금 매력적인 종목이 없어요';
        let body = '오늘 시장 상황에서는 긍정적인 종목이 없어요. 내일 다시 확인해보세요.';
        if (hour < 8) {
            const hoursUntil = 8 - hour;
            headline = '오늘 분석은 오전 8시부터 시작해요';
            body = `약 ${hoursUntil}시간 후 결과가 나와요.`;
        } else if (hour < 10) {
            headline = '지금 데이터를 분석 중이에요';
            body = '전체 종목 분석이 끝날 때까지 10~15분 정도 걸려요. 잠시 후 다시 확인해주세요.';
        }
        return (
          <div className="text-center py-16 bg-inset border border-dashed border-line-strong rounded-xl px-6">
            <p className="text-ink font-bold mb-2">{headline}</p>
            <p className="text-muted text-sm leading-relaxed">{body}</p>
          </div>
        );
      })()}

      <button
        onClick={() => router.push('/stocks')}
        className="md:hidden w-full p-4 bg-surface hover:bg-inset border border-line rounded-xl flex items-center justify-between transition-colors text-left"
      >
        <div>
          <p className="text-sm font-bold text-ink">전체 종목 보기</p>
          <p className="text-xs text-muted mt-0.5">업종별 주요 종목 한눈에</p>
        </div>
        <span className="text-ink">→</span>
      </button>
    </div>
  );
}
