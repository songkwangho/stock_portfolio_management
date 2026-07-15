'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FinancialData } from '@/types/stock';

// 분기별 실적 아코디언 (3.12차 S2 분리). 본문 이동만.
interface FinancialsTableProps {
  financials: FinancialData | null;
}

export default function FinancialsTable({ financials }: FinancialsTableProps) {
  const [showFinancials, setShowFinancials] = useState(false);
  if (!financials || financials.financials.length === 0) return null;
  return (
    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
      <button onClick={() => setShowFinancials(v => !v)} className="w-full flex items-center justify-between min-h-[44px]">
        <h3 className="text-lg font-semibold">분기별 실적</h3>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-500">{showFinancials ? '접기' : '펼치기'}</span>
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${showFinancials ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {showFinancials && <div className="mt-4">
      <p className="text-xs text-slate-500 mb-1">최근 분기별 매출과 이익 추이예요. 꾸준히 늘어나면 좋은 신호!</p>
      <p className="text-xs text-slate-600 mb-4">단위: 억 원 (네이버 증권 기준). 1조 = 10,000억</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-2 px-3 text-xs text-slate-500 font-bold">구분</th>
              {financials.periods.slice(0, 5).map(p => (
                <th key={p} className="text-right py-2 px-3 text-xs text-slate-500 font-bold">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {financials.financials.map(row => (
              <tr key={row.label} className="border-b border-slate-800/30">
                <td className="py-2.5 px-3 text-slate-300 font-semibold">{row.label}</td>
                {row.values.slice(0, 5).map((v, i) => {
                  const prev = i > 0 ? row.values[i - 1] : null;
                  const isGrowing = v !== null && prev !== null && v > prev;
                  // 1조(10,000억) 이상은 "X조 Y,YYY억"으로, 그 외는 "N,NNN억"
                  let formatted = '---';
                  if (v !== null) {
                    const abs = Math.abs(v);
                    const sign = v < 0 ? '-' : '';
                    if (abs >= 10000) {
                      const jo = Math.floor(abs / 10000);
                      const eok = abs % 10000;
                      formatted = `${sign}${jo}조${eok > 0 ? ` ${eok.toLocaleString()}억` : ''}`;
                    } else {
                      formatted = `${sign}${abs.toLocaleString()}억`;
                    }
                  }
                  return (
                    <td key={i} className={`text-right py-2.5 px-3 ${v === null ? 'text-slate-600' : isGrowing ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>}
    </div>
  );
}
