'use client';

import type { FinancialData } from '@/types/stock';

// 분기별 실적 (3.12차 S2 분리 → 3.13 탭 재편 TASK 3: 아코디언 제거, 항상 펼침).
interface FinancialsTableProps {
  financials: FinancialData | null;
}

export default function FinancialsTable({ financials }: FinancialsTableProps) {
  if (!financials || financials.financials.length === 0) return null;
  return (
    <div className="bg-surface p-6 rounded-xl border border-line">
      <h3 className="text-lg font-semibold text-ink mb-4">분기별 실적</h3>
      <p className="text-xs text-muted mb-1 break-keep">최근 분기별 매출과 이익 추이예요. 꾸준히 늘어나면 좋은 신호예요.</p>
      <p className="text-xs text-faint mb-4 break-keep">단위: 억 원 (네이버 증권 기준). 1조 = 10,000억</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-inset border-b border-line">
              <th className="text-left py-2 px-3 text-xs text-faint font-bold">구분</th>
              {financials.periods.slice(0, 5).map(p => (
                <th key={p} className="text-right py-2 px-3 text-xs text-faint font-bold">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {financials.financials.map(row => (
              <tr key={row.label} className="border-b border-line">
                <td className="py-2.5 px-3 text-ink font-semibold">{row.label}</td>
                {row.values.slice(0, 5).map((v, i) => {
                  // 증감은 직전 기간(왼쪽 열) 대비 방향. 매출·이익 증가는 '주가 상승'이 아니므로
                  // 방향색(rise/fall) 금지 — 화살표 + 무채색으로만 표시 (3.13 규칙).
                  const prev = i > 0 ? row.values[i - 1] : null;
                  const arrow = (v !== null && prev !== null) ? (v > prev ? ' ▲' : v < prev ? ' ▼' : '') : '';
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
                    <td key={i} className={`text-right py-2.5 px-3 tabular-nums ${v === null ? 'text-faint' : 'text-ink'}`}>
                      {formatted}<span className="text-faint">{arrow}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
