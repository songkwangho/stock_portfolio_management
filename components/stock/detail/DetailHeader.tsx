'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { getDataFreshnessLabel } from '@/lib/dataFreshness';
import { getThemeMeta } from '@/lib/themesMeta';
import type { StockSummary, StockDetail, Holding, StockThemeTag, UpdateHoldingPayload } from '@/types/stock';

// 종목 상세 헤더 — 카테고리/삭제/이름/테마 태그 + 현재가/추세/수익률 + 보유정보 수정 폼 (3.12차 S6 분리).
// editMode/editForm state 지역화. 본문 이동만.
interface DetailHeaderProps {
  stock: StockSummary;
  stockDetail: StockDetail | null;
  isHolding: boolean;
  holdingMatch?: Holding;
  stockThemes: StockThemeTag[];
  trend: string;
  latestPrice: number;
  profitRate: string | null;
  onDeleteHolding: (code: string) => Promise<void>;
  onDeleteStock: (code: string) => Promise<void>;
  onUpdate: (payload: UpdateHoldingPayload) => Promise<void>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onBack: () => void;
}

export default function DetailHeader({
  stock, stockDetail, isHolding, holdingMatch, stockThemes,
  trend, latestPrice, profitRate, onDeleteHolding, onDeleteStock, onUpdate, addToast, onBack,
}: DetailHeaderProps) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ avgPrice: '', quantity: '', weight: '' });

  return (
    <div className="flex justify-between items-start mb-8">
      <div>
        <div className="flex items-center space-x-3 mb-2">
          <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded uppercase">{stock.category}</span>
          {!isHolding && (
            <button onClick={async () => {
              if (window.confirm('이 종목을 전체 목록에서 삭제하시겠습니까?')) {
                try {
                  if (holdingMatch) {
                    await onDeleteHolding(stock.code);
                  } else {
                    await onDeleteStock(stock.code);
                  }
                  addToast(`${stock.name} 종목이 삭제되었습니다.`, 'success');
                  onBack();
                } catch {
                  addToast('종목 삭제에 실패했습니다.', 'error');
                }
              }
            }} className="flex items-center space-x-1 text-slate-500 hover:text-red-500 transition-colors px-4 py-2.5 min-h-[44px]" title="종목 전체 삭제">
              <Trash2 size={16} />
              <span className="text-xs">삭제</span>
            </button>
          )}
        </div>
        <h2 className="text-4xl font-bold">{stockDetail?.name || stock.name}</h2>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
          <p className="text-slate-500 font-mono">{stock.code}</p>
          {stockDetail?.last_updated && (
            <span className="text-xs text-slate-600 whitespace-nowrap">
              {getDataFreshnessLabel(stockDetail.last_updated)}
            </span>
          )}
        </div>
        {stockThemes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {stockThemes.map(t => (
              <button
                key={t.theme_id}
                onClick={() => router.push(`/themes?id=${t.theme_id}`)}
                className="text-xs font-bold px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors"
                title={`${t.theme_name} 테마 보기`}
              >
                {getThemeMeta(t.theme_id).emoji} {t.theme_name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm text-slate-500 mb-1">현재가</p>
        <div className={`text-4xl font-black ${trend === '상승' ? 'text-emerald-500' : 'text-red-500'}`}>
          ₩{latestPrice.toLocaleString()}
        </div>
        {isHolding && (
          <div className="mt-1 flex items-center space-x-3">
            <p className={`text-sm font-bold ${parseFloat(profitRate || '0') >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              수익률: {profitRate}% (매수가: ₩{stock.avgPrice?.toLocaleString()})
            </p>
            {!editMode && (
              <button
                onClick={() => {
                  setEditMode(true);
                  setEditForm({
                    avgPrice: String(stock.avgPrice || ''),
                    quantity: String(stock.quantity || '0'),
                    weight: String(stock.value || '5'),
                  });
                }}
                className="text-xs text-blue-400 hover:text-blue-300 font-bold bg-blue-500/10 px-4 py-2.5 min-h-[44px] rounded-lg transition-colors"
              >
                보유 정보 수정
              </button>
            )}
          </div>
        )}
        {isHolding && editMode && onUpdate && (
          <div className="mt-3 p-4 bg-slate-900/50 border border-blue-500/20 rounded-2xl animate-in fade-in duration-200">
            <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-3">보유 정보 수정</p>
            <div className="flex items-end space-x-3">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">매수가 (원)</label>
                <input
                  type="number"
                  value={editForm.avgPrice}
                  onChange={(e) => setEditForm({ ...editForm, avgPrice: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">수량 (주)</label>
                <input
                  type="number"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="w-24">
                <label className="text-xs text-slate-500 mb-1 block">비중 (%)</label>
                <input
                  type="number"
                  value={editForm.weight}
                  onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={async () => {
                  await onUpdate({
                    code: stock.code,
                    name: stock.name,
                    avgPrice: parseInt(editForm.avgPrice),
                    quantity: parseInt(editForm.quantity || '0'),
                    value: parseInt(editForm.weight || '5'),
                  });
                  setEditMode(false);
                }}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors min-h-[44px]"
              >
                저장
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-3 text-slate-500 hover:text-white text-sm rounded-xl transition-colors min-h-[44px]"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
