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
        <span>종목 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between">
        <div>
          {/* D3 — "오늘의 유망 종목"·"적정가 대비 저평가된 종목을 선별" 프레이밍 제거.
              알고리즘 긍정-필터 소스가 D1에서 은퇴했으므로 "알고리즘이 분석한"도 이제 거짓이다
              (목록은 에디터 큐레이션만). 설명을 실제 소스와 일치시킨다. */}
          <h2 className="text-2xl font-bold text-ink mb-2">살펴볼 종목</h2>
          <p className="text-muted text-sm">에디터가 골라본 종목이에요. 어디서부터 볼지 막막할 때 출발점으로 쓰세요.</p>
          <p className="text-xs text-faint mt-1">추천이 아니라 살펴볼 후보예요. 종목을 열어 관점별 풀이를 확인하고, 판단은 본인이 직접 해주세요.</p>
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

      {/* D3 — "왜 추천됐나요?"(추천 프레이밍) → "어떻게 골랐나요"(선정 과정 공개). */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <p className="text-sm font-bold text-ink mb-1">이 종목들은 어떻게 골랐나요</p>
        <p className="text-xs text-muted leading-relaxed">
          에디터가 사업 내용과 업종 흐름을 보고 목록에 담은 종목이에요. 점수나 순위로 좋고 나쁨을 매기지 않고,
          지표 조건으로 걸러내지도 않았어요.
          <span className="text-ink font-medium"> 추천이 아니라 살펴볼 출발점이에요 — 판단은 본인이 하시면 돼요.</span>
          <br />
          종목을 열면 밸류·성장·현금흐름·수급 등 관점별 풀이와 균형 요약을 볼 수 있어요.
        </p>
      </div>

      {/* D3 — 대표 렌즈 바로가기. 조건으로 직접 찾아보는 경로(스크리너)로 연결한다.
          신규 계산 없이 딥링크만 — 수신부는 /screener 의 ?preset= 처리(같은 커밋). */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <p className="text-sm font-bold text-ink mb-1">조건으로 직접 찾아보기</p>
        <p className="text-xs text-muted leading-relaxed mb-3">
          하나의 잣대가 아니라 여러 렌즈로 나눠 봐요. 각 렌즈는 관찰 가능한 조건일 뿐이고, 통과가 곧 매수 근거는 아니에요.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { slug: 'graham', label: '밸류 렌즈 — 자산·이익 대비 낮은 가격' },
            { slug: 'high-roe', label: '수익성 렌즈 — 자기자본 대비 이익 큼' },
            { slug: 'foreign-buy', label: '수급 렌즈 — 외국인 순매수' },
            { slug: 'breakout-52w', label: '가격 위치 렌즈 — 52주 고점 근처' },
            { slug: 'neglected', label: '거래량 렌즈 — 평소보다 조용함' },
          ].map(lens => (
            <button
              key={lens.slug}
              onClick={() => router.push(`/screener?preset=${lens.slug}`)}
              className="px-3 py-2.5 min-h-[44px] bg-inset border border-line rounded-xl text-xs font-bold text-muted hover:text-ink hover:border-line-strong transition-colors text-left"
            >
              {lens.label}
            </button>
          ))}
        </div>
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

      {/* D3 — "추천 종목 수" → "종목 수". '전문가 선정 평균 점수' 통계 제거(3열 → 2열):
          카드에서 걷어낸 큐레이션 점수를 평균값으로 되살리는 지표였다. */}
      {recommendations.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-inset rounded-lg p-4 text-center">
            <p className="text-2xl font-black text-ink tabular-nums">{recommendations.length}</p>
            <p className="text-xs text-muted mt-1">종목 수</p>
          </div>
          <div className="bg-inset rounded-lg p-4 text-center">
            <p className="text-2xl font-black text-ink tabular-nums">{categories.length}</p>
            <p className="text-xs text-muted mt-1">업종 분야</p>
          </div>
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
        // D3 — 목록이 지표 필터가 아니라 에디터 큐레이션이 됐으므로 "조건에 맞은 종목이 없다"는
        // 이제 사실이 아니다. 실제로 비는 경우는 둘뿐: 담긴 종목을 전부 보유 중이거나, 시세를
        // 아직 못 불러온 경우(일 1회 갱신). 시간대 안내는 후자에만 해당한다.
        let headline = '지금은 보여드릴 종목이 없어요';
        let body = '목록에 담긴 종목을 이미 보유하고 있거나, 시세를 불러오지 못했어요. (보유 종목은 목록에서 빠져요.)';
        if (hour < 8) {
            const hoursUntil = 8 - hour;
            headline = '오늘 시세 갱신은 오전 8시부터예요';
            body = `약 ${hoursUntil}시간 후 다시 확인해주세요.`;
        } else if (hour < 10) {
            headline = '지금 시세를 불러오는 중이에요';
            body = '전체 종목 갱신이 끝날 때까지 10~15분 정도 걸려요. 잠시 후 다시 확인해주세요.';
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
