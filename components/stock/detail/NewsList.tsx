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
      <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-24 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-800/50 rounded-xl"></div>)}
        </div>
      </div>
    );
  }
  if (news.length === 0) return null;
  return (
    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
      <h3 className="text-lg font-semibold mb-2">최신 뉴스</h3>
      <p className="text-xs text-slate-500 mb-4">이 종목과 관련된 최근 뉴스예요. 투자 전 꼭 확인해보세요!</p>
      <div className="space-y-3">
        {news.map((item, i) => (
          <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
            className="block p-3 bg-slate-900/50 rounded-xl border border-slate-800/50 hover:border-blue-500/30 hover:bg-slate-900 transition-all group">
            <p className="text-sm text-slate-200 group-hover:text-blue-400 transition-colors leading-relaxed mb-1">
              {item.title}
            </p>
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <span>{item.source}</span>
              <span>·</span>
              <span>{item.date}</span>
              <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
