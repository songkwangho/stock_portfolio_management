'use client';

import { ArrowUpRight } from 'lucide-react';
import type { DartDisclosuresResult } from '@/types/stock';

// 4.5a차 — 최근 공시 목록. 구분선 방식(카드 아님), 카테고리 뱃지 무채색(호재/악재 판정 아님).
// rm '정'=정정 / '철'=철회는 caution으로 안내(초보자 오독 방지). 행 클릭 → DART 원문 새 탭.
// 빈 상태는 에러가 아님을 명확히("최근 공시가 없어요"). data null(로딩)이면 렌더 안 함.

function fmtDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd || '';
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

export default function DisclosureList({ data }: { data: DartDisclosuresResult | null }) {
  if (!data) return null;
  const items = data.items || [];
  return (
    <div>
      <h3 className="text-lg font-semibold text-ink mb-1">공시</h3>
      <p className="text-xs text-faint mb-3">최근 3개월 · 금융감독원 DART</p>

      {items.length === 0 ? (
        <div className="p-4 bg-inset rounded-xl border border-line">
          <p className="text-sm text-muted">최근 3개월 공시가 없어요.</p>
        </div>
      ) : (
        <ul className="border-y border-line divide-y divide-line">
          {items.map(it => (
            <li key={it.rceptNo}>
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 py-3 group"
              >
                <span className="shrink-0 w-[84px] text-xs text-faint tabular-nums pt-0.5">{fmtDate(it.rceptDt)}</span>
                {/* 카테고리 뱃지 — 무채색 (공시는 호재/악재 판정이 아님) */}
                <span className="shrink-0 text-xs font-bold text-muted bg-inset border border-line rounded px-1.5 py-0.5">
                  {it.categoryLabel}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-ink group-hover:underline break-keep">{it.reportNm}</span>
                  {it.isRevised && <span className="ml-1 text-xs text-caution whitespace-nowrap">· 이후 정정된 공시예요</span>}
                  {it.isWithdrawn && <span className="ml-1 text-xs text-caution whitespace-nowrap">· 철회된 공시예요</span>}
                </span>
                <ArrowUpRight size={14} className="shrink-0 mt-0.5 text-faint group-hover:text-ink transition-colors" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-faint mt-3 break-keep">공시는 금융감독원 DART 원문이에요. 해석은 직접 확인해 주세요.</p>
    </div>
  );
}
