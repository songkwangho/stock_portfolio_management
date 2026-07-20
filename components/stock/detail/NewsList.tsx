'use client';

import { ArrowUpRight } from 'lucide-react';
import type { NewsItem } from '@/types/stock';

// 최신 뉴스 (3.12차 S2 분리). 본문 이동만. news===null이면 스켈레톤, []이면 미표시.
interface NewsListProps {
  news: NewsItem[] | null;
}

export default function NewsList({ news }: NewsListProps) {
  if (news === null) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-line rounded w-24 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-inset rounded-lg"></div>)}
        </div>
      </div>
    );
  }
  if (news.length === 0) return null;
  return (
    <div>
      <h3 className="text-lg font-semibold mb-2 text-ink">최신 뉴스</h3>
      <p className="text-xs text-faint mb-4">이 종목과 관련된 최근 뉴스예요. 투자 전 꼭 확인해보세요.</p>
      <div className="divide-y divide-line border-t border-line">
        {news.map((item, i) => (
          <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
            className="block py-3 group">
            <p className="text-sm text-ink group-hover:underline leading-relaxed mb-1">
              {item.title}
            </p>
            <div className="flex items-center space-x-2 text-xs text-faint tabular-nums">
              <span>{item.source}</span>
              <span>·</span>
              <span>{item.date}</span>
              <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 text-muted transition-opacity" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
