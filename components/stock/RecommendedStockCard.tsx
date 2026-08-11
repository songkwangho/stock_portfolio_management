'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import type { Recommendation, StockSummary } from '@/types/stock';
import { useWatchlistStore } from '@/stores/useWatchlistStore';
import { useToastStore } from '@/stores/useToastStore';

interface RecommendedStockCardProps {
  stock: Recommendation;
  onDetailClick: (stock: StockSummary) => void;
}

const RecommendedStockCard = ({ stock, onDetailClick }: RecommendedStockCardProps) => {
  const router = useRouter();
  const [showSourceInfo, setShowSourceInfo] = useState(false);
  const [reasonExpanded, setReasonExpanded] = useState(false);
  const addToWatchlist = useWatchlistStore(s => s.addToWatchlist);
  const watchlistItems = useWatchlistStore(s => s.items);
  const addToast = useToastStore(s => s.addToast);
  const reasonLong = (stock.reason?.length ?? 0) > 80;
  const inWatchlist = watchlistItems.some(w => w.code === stock.code);

  // 3.9차 — 원스텝 관심 추가 + 알림 안내 토스트
  const onAddWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inWatchlist) {
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
      addToast('관심 종목 추가에 실패했어요. 잠시 후 다시 시도해 주세요.', 'error');
    }
  };

  return (
    <div
      onClick={() => onDetailClick(stock)}
      className="bg-surface border border-line rounded-xl p-4 hover:border-line-strong transition-colors cursor-pointer flex flex-col"
    >
      {/* Header: 종목명·코드·업종 + 현재가.
          D2 — 큐레이션 점수 배지 제거. "100점 만점으로, 높을수록 매력적이라고 판단한 종목"이라는
          단일 점수 통보였다(B1에서 걷어낸 Signal Score와 같은 형태). score는 서버 정렬에만 쓴다.
          점수 자리에 현재가를 둔다 — 종목 카드에 가격이 없던 상태를 메우고, 방향색은 쓰지 않는다
          (등락률이 아니라 절대 가격이라 rise/fall 대상이 아니다). */}
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h4 className="font-bold text-base text-ink truncate">{stock.name}</h4>
          <p className="text-xs text-faint tabular-nums mt-0.5 truncate">{stock.code} · {stock.category}</p>
        </div>
        {stock.currentPrice > 0 && (
          <p className="text-sm font-bold text-ink tabular-nums shrink-0">
            ₩{stock.currentPrice.toLocaleString()}
          </p>
        )}
      </div>

      {/* 선정 이유(에디터 작성).
          D2 — "가격 차이"(적정가 대비 N% 낮아요) 블록 전체 제거. 적정가는 fair_price ‖ 애널리스트
          목표가 ‖ 현재가×1.1 폴백이었고, 그 괴리를 rise색 상승여력으로 제시하던 앱의 마지막
          매수 신호였다(R2). 라벨도 '왜 지금?'(타이밍 암시) → '고른 이유'로 바꿨다. */}
      <div className="mb-4 flex-grow space-y-2">
        <div className="flex items-start space-x-2">
          <span className="text-xs font-bold text-ink bg-inset px-2 py-0.5 rounded shrink-0 mt-0.5">
            고른 이유
          </span>
          <div className="min-w-0">
            <p className={`text-xs text-ink leading-relaxed ${reasonExpanded ? '' : 'line-clamp-3'}`}>
              {stock.reason}
            </p>
            {reasonLong && (
              <button
                onClick={(e) => { e.stopPropagation(); setReasonExpanded(v => !v); }}
                className="mt-1 text-xs font-bold text-ink hover:underline"
              >
                {reasonExpanded ? '접기' : '더 보기'}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Footer: Source Badge.
          M1 — market_opinion 판정 뱃지(긍정적/부정적) 제거(R2). 추천 목록에 이미 선별이라는
          맥락이 있는데 판정 라벨까지 붙으면 매수 신호로 읽힌다. 선정 출처만 남긴다. */}
      <div className="flex items-center justify-between flex-wrap gap-y-1 mb-3">
        <div className="flex items-center space-x-1.5">
          {stock.source && (
            <span
              onClick={(e) => { e.stopPropagation(); setShowSourceInfo(!showSourceInfo); }}
              className={`text-xs font-bold px-2 py-1 rounded-lg cursor-pointer border border-line bg-inset ${
                stock.source === 'manual' ? 'text-ink' : 'text-muted'
              }`}
            >
              {stock.source === 'manual' ? '에디터 선정' : '알고리즘'}
            </span>
          )}
        </div>
      </div>
      {showSourceInfo && (
        <div className="text-xs mb-3 p-3 bg-inset rounded-lg leading-relaxed space-y-1.5">
          {/* D2 — '전문가' → '에디터'. 알고리즘 소스는 D1에서 은퇴해 이제 이 목록에 나오지 않는다
              (기존 DB 행이 source='algorithm'인 경우만 대비해 분기는 남긴다). */}
          <p className="text-muted">
            {stock.source === 'manual'
              ? '에디터가 직접 살펴보고 고른 종목이에요. 추천이 아니라 살펴볼 출발점이고, 판단은 본인이 하시면 돼요.'
              : '지표를 자동 분석해 담긴 종목이에요. 과거 성과가 미래를 보장하지 않아요.'}
          </p>
        </div>
      )}

      {/* 3.9차 — 다음 행동 버튼 2개 + 면책 */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(stock); }}
          className="flex-1 py-3 min-h-[44px] bg-ink hover:opacity-90 text-surface text-xs font-bold rounded-xl transition-opacity"
        >
          상세 분석 보기 →
        </button>
        <button
          onClick={onAddWatchlist}
          className={`py-3 px-4 min-h-[44px] min-w-[44px] text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1 ${
            inWatchlist
              ? 'bg-inset border border-line-strong text-ink'
              : 'bg-surface border border-line-strong text-muted hover:bg-inset hover:text-ink'
          }`}
          aria-label={inWatchlist ? '관심 종목에 있음' : '관심 종목 추가'}
        >
          <Heart size={14} fill={inWatchlist ? 'currentColor' : 'none'} />
          <span>{inWatchlist ? '추가됨' : '관심'}</span>
        </button>
      </div>
      <p className="text-xs text-faint mt-2 text-center leading-relaxed">
        투자 결정은 본인이 직접 해주세요. 실제 거래는 증권사 앱에서 진행하세요.
      </p>
    </div>
  );
};

export default RecommendedStockCard;
