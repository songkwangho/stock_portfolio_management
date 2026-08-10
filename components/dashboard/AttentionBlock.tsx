'use client';

// A차(주목 레이어) — 대시보드 최상단 트리아지 블록.
// 보유+관심 종목을 현저성으로 정렬해 상위 몇 개만 보여준다. **조언이 아니라 주의 환기**.
//
// 레이아웃: 세로 카드 목록 → **1행 콤팩트 가로 띠**(종목이 늘면 가로 스크롤).
// 정보량은 유지하되 밀도만 올린다 — 대시보드 상단은 히어로(수익률)가 주인공이라
// 이 블록이 세로 공간을 크게 먹으면 위계가 뒤집힌다.
//
// 렌더 규칙(로직은 lib/attention/interpret.ts가 소유 — 여기선 순서·색만):
//  - 콤팩트 우선순위: disclosure·move·unrealized(+unpriced)만 띠에 노출.
//    category·volume은 생략 — 종목 상세에 그대로 있고, 띠에선 한 줄을 넘긴다.
//  - 방향은 **색으로만**(badge.dir → rise 빨강 / fall 파랑 / 무채색). 텍스트엔 부호를 남겨
//    색을 못 보는 사용자도 방향을 읽을 수 있게 한다(aria-label에도 동일 텍스트).
//  - 무채색 기본. 이모지·장식 아이콘 금지(면책 ⓘ만 허용 — 동작을 대신하는 아이콘).
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';
import {
  attentionBadges, attentionSourceLabel, attentionAsOfNote,
  ATTENTION_TITLE, ATTENTION_EMPTY, ATTENTION_PROVISIONAL, ATTENTION_DISCLAIMER,
  type AttentionDir, type AttentionBadge,
} from '@/lib/attention/interpret';
import type { AttentionResult } from '@/types/stock';

const DIR_CLASS: Record<AttentionDir, string> = {
  up: 'text-rise font-bold',
  down: 'text-fall font-bold',
  none: 'text-muted',
};

// 띠에 노출할 배지(콤팩트 우선순위). 나머지는 종목 상세가 보여준다.
const PILL_BADGE_KEYS = new Set<AttentionBadge['key']>(['disclosure', 'move', 'unrealized', 'unpriced']);

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

  return (
    <section data-testid="attention-block" className="bg-surface border border-line rounded-xl p-3">
      {/* 헤더 한 줄 — 높이 최소화. 면책 전문은 ⓘ 툴팁으로 접고 본문 공간을 띠에 넘긴다. */}
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-[13px] font-medium text-ink">{ATTENTION_TITLE}</h3>
        {/* 무채색 pill — bg-inset(#FAFAF8)은 카드 표면(#FFFFFF) 위에서 거의 안 보여 ink 소프트 배경 사용. */}
        <span className="text-xs px-1.5 py-0.5 rounded bg-ink/5 text-muted shrink-0">{ATTENTION_PROVISIONAL}</span>
        <button
          type="button"
          title={ATTENTION_DISCLAIMER}
          aria-label={ATTENTION_DISCLAIMER}
          className="inline-flex items-center text-faint hover:text-muted transition-colors"
        >
          <Info size={13} aria-hidden="true" />
        </button>
        {data.asOfDate && (
          // 짧은 캡션 + 전문은 title로. 위계는 크기가 아니라 색(faint)으로 (DESIGN.md § Typography).
          <span className="ml-auto text-xs text-faint tabular-nums shrink-0" title={attentionAsOfNote(data.asOfDate)}>
            {data.asOfDate.slice(5)} 종가 기준
          </span>
        )}
      </div>

      {items.length === 0 ? (
        // 조용한 날 — 큰 빈 카드 대신 한 줄.
        <p className="text-xs text-muted break-keep">{ATTENTION_EMPTY}</p>
      ) : (
        <div
          role="region"
          aria-label={ATTENTION_TITLE}
          tabIndex={0}
          className="flex gap-2 overflow-x-auto"
        >
          {items.map(it => {
            const tokens = attentionBadges(it).filter(b => PILL_BADGE_KEYS.has(b.key));
            const source = attentionSourceLabel(it);
            // 색만으로 방향이 전달되지 않도록 부호가 든 배지 텍스트를 그대로 이름에 넣는다.
            const label = [it.name, source, ...tokens.map(t => t.text)].join(', ');
            return (
              <button
                key={it.code}
                type="button"
                aria-label={label}
                onClick={() => router.push(`/stock/${it.code}?from=${it.held ? 'holding' : 'watchlist'}`)}
                // 관심 종목은 opacity로만 보유와 구분(라벨은 유지) — 색으로 위계를 만들지 않는다.
                className={`flex-none whitespace-nowrap inline-flex items-baseline gap-1.5 rounded-lg border border-line bg-inset px-2.5 py-2 hover:border-line-strong transition-colors ${it.held ? '' : 'opacity-[0.85]'}`}
              >
                <span className="text-[13px] font-medium text-ink">{it.name}</span>
                <span className="text-xs text-faint">{source}</span>
                {tokens.map(t => (
                  <span key={t.key} className={`text-xs tabular-nums ${DIR_CLASS[t.dir]}`}>{t.text}</span>
                ))}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
