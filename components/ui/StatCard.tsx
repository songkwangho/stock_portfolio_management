'use client';
import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  positive?: boolean;
  icon: ReactNode;
  subtitle?: string;
  // 추가 컨텍스트 라인 (예: KOSPI 비교) — 사용자 오해 방지용 툴팁 동봉
  tooltip?: { label: string; text: string };
}

const StatCard = ({ title, value, change, positive, icon, subtitle, tooltip }: StatCardProps) => {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="bg-surface border border-line rounded-xl p-4 hover:border-line-strong transition-all group">
      <div className="flex items-center justify-between mb-3">
        <div className="p-3 bg-inset rounded-lg text-muted group-hover:scale-110 transition-transform">
          {icon}
        </div>
        {change && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full tabular-nums ${positive ? 'bg-rise/10 text-rise' : 'bg-fall/10 text-fall'}`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-sm text-muted mb-1">{title}</p>
      <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
      {subtitle && <p className="text-xs text-faint mt-1">{subtitle}</p>}
      {tooltip && (
        <div className="mt-2 pt-2 border-t border-line relative">
          <button
            onClick={() => setShowTip(!showTip)}
            className="flex items-center space-x-1 text-xs text-faint hover:text-ink transition-colors"
          >
            <span>{tooltip.label}</span>
            <Info size={12} />
          </button>
          {showTip && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface border border-line-strong rounded-xl p-3 shadow-lg text-xs text-muted leading-relaxed animate-in fade-in duration-150">
              {tooltip.text}
              <button
                onClick={() => setShowTip(false)}
                className="block mt-2 text-ink font-bold"
              >
                알겠어요
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatCard;
