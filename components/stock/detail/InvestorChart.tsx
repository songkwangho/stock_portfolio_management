'use client';

import {
  ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Bar,
} from 'recharts';
import type { StockDetail } from '@/types/stock';
import type { HelpTermKey } from '@/components/ui/HelpBottomSheet';

// 투자자별 매매동향 (3.12차 S2 분리 → 3.13 탭 재편 TASK 3: 아코디언 제거, 항상 펼침).
// [중요] Recharts 높이 보존: h-64 w-full 래퍼 유지 (ResponsiveContainer 붕괴 방지).
interface InvestorChartProps {
  stockDetail: StockDetail;
  onHelp: (t: HelpTermKey) => void;
}

export default function InvestorChart({ stockDetail, onHelp }: InvestorChartProps) {
  if (!stockDetail.investorData || stockDetail.investorData.length === 0) return null;
  return (
    <div className="bg-surface p-6 rounded-xl border border-line">
      <div className="flex items-center space-x-2 mb-4">
        <h3 className="text-lg font-semibold text-ink">투자자별 매매동향</h3>
        <span onClick={() => onHelp('supplyDemand')} className="text-faint hover:text-ink text-xs min-w-[24px] min-h-[24px] flex items-center justify-center cursor-pointer" aria-label="수급 도움말">[?]</span>
      </div>
      <p className="text-xs text-muted mb-1">최근 10거래일 동안 개인·외국인·기관이 주식을 사고판 양을 보여줘요</p>
          <p className="text-xs text-faint mb-4">외국인·기관이 함께 매수하면 긍정적 신호로 보는 경우가 많아요. 단, 단기 흐름만으로 판단하지 마세요.</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockDetail.investorData.slice(-10).map((d) => ({
                ...d, name: d.date.slice(4, 6) + '/' + d.date.slice(6, 8),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E7E3" vertical={false} />
                <XAxis dataKey="name" stroke="#85878D" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#85878D" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E7E7E3', borderRadius: '10px' }} />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <ReferenceLine y={0} stroke="#D4D4CE" />
                <Bar dataKey="individual" name="개인 투자자 (일반인)" fill="#85878D" />
                <Bar dataKey="foreign" name="외국인 투자자 (해외)" fill="#17181C" />
                <Bar dataKey="institution" name="기관 투자자 (회사·펀드)" fill="#6E7076" />
              </BarChart>
            </ResponsiveContainer>
          </div>
    </div>
  );
}
