'use client';

// A차(주목 레이어) — 대시보드 최상단 트리아지 블록.
// 보유+관심 종목을 현저성으로 정렬해 상위 몇 개만 보여준다. **조언이 아니라 주의 환기**.
// 무채색 기본, 방향색(rise/fall)은 가격·미실현 수치 배지에만. 이모지·장식 아이콘 없음(전역 규칙).
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { stockApi } from '@/lib/stockApi';
import {
  attentionBadges, attentionSourceLabel, attentionAsOfNote,
  ATTENTION_TITLE, ATTENTION_EMPTY, ATTENTION_PROVISIONAL, ATTENTION_DISCLAIMER,
  type AttentionDir,
} from '@/lib/attention/interpret';
import type { AttentionResult } from '@/types/stock';

const DIR_CLASS: Record<AttentionDir, string> = {
  up: 'text-rise font-bold',
  down: 'text-fall font-bold',
  none: 'text-muted',
};

export default function AttentionBlock() {
  const router = useRouter();
  const [data, setData] = useState<AttentionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    stockApi.getAttention()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ available: false, reason: 'error' }); });
    return () => { cancelled = true; };
  }, []);

  // 후보 자체가 없거나(보유·관심 0) 조회 실패면 블록을 띄우지 않는다 — 대시보드 빈 상태 CTA가 그 자리를 쓴다.
  if (!data?.available) return null;

  const items = data.items || [];

  if (items.length === 0) {
    return (
      <section data-testid="attention-block">
        <h3 className="text-sm font-bold text-ink mb-2">{ATTENTION_TITLE}</h3>
        <div className="bg-surface border border-line rounded-xl px-4 py-5">
          <p className="text-sm text-muted break-keep">{ATTENTION_EMPTY}</p>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="attention-block">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold text-ink">{ATTENTION_TITLE}</h3>
        <span className="text-xs font-bold px-2 py-0.5 rounded bg-caution/10 text-caution">{ATTENTION_PROVISIONAL}</span>
      </div>

      {/* 목록은 카드 나열이 아니라 구분선 (VIS-7). */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {items.map((it, i) => {
          const badges = attentionBadges(it);
          return (
            <button
              key={it.code}
              onClick={() => router.push(`/stock/${it.code}?from=${it.held ? 'holding' : 'watchlist'}`)}
              className={`w-full text-left px-4 py-3 min-h-[44px] hover:bg-inset transition-colors ${i > 0 ? 'border-t border-line' : ''}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink truncate">{it.name}</span>
                <span className="text-xs text-muted tabular-nums shrink-0">{it.code}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-inset text-muted shrink-0">{attentionSourceLabel(it)}</span>
              </div>
              {badges.length > 0 && (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1.5">
                  {badges.map(b => (
                    <span key={b.key} className={`text-xs tabular-nums ${DIR_CLASS[b.dir]}`}>{b.text}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-faint mt-2 break-keep leading-relaxed">
        {attentionAsOfNote(data.asOfDate)} {ATTENTION_DISCLAIMER}
      </p>
    </section>
  );
}
