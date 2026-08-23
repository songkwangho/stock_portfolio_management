'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { getDataFreshnessLabel } from '@/lib/dataFreshness';
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
  // 3.12.1 FIX-2: 비중(%)은 서버 자동 계산이라 수정 폼에서도 제거.
  const [editForm, setEditForm] = useState({ avgPrice: '', quantity: '' });

  return (
    // D2 — md 미만은 세로 스택. 좁은 폭에서 좌우 2열을 유지하면 폭 경쟁으로 종목명이
    // 중간에서 쪼개진다("유유/제약"). 한글은 기본 줄바꿈이 글자 단위라 break-keep도 함께 건다.
    <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start mb-8">
      <div className="min-w-0">
        <div className="flex items-center space-x-3 mb-2">
          <span className="px-2 py-1 bg-inset text-muted border border-line text-xs font-bold rounded whitespace-nowrap">{stock.category}</span>
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
            }} className="flex items-center space-x-1 text-muted hover:text-ink transition-colors px-4 py-2.5 min-h-[44px]" title="종목 전체 삭제">
              <Trash2 size={16} />
              <span className="text-xs">삭제</span>
            </button>
          )}
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-ink break-keep">{stockDetail?.name || stock.name}</h2>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
          <p className="text-faint tabular-nums">{stock.code}</p>
          {stockDetail?.last_updated && (
            <span className="text-xs text-faint whitespace-nowrap">
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
                className="text-xs font-bold px-2 py-1 bg-inset text-muted border border-line rounded-lg hover:border-ink transition-colors whitespace-nowrap"
                title={`${t.theme_name} 테마 보기`}
              >
                {t.theme_name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="md:text-right md:shrink-0">
        <p className="text-sm text-muted mb-1">현재가</p>
        <div className={`text-3xl md:text-4xl font-black tabular-nums ${trend === '상승' ? 'text-rise' : 'text-fall'}`}>
          ₩{latestPrice.toLocaleString()}
        </div>
        {isHolding && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 md:justify-end">
            {/* 두 조각을 각각 nowrap으로 묶는다 — 통째로 nowrap이면 320px에서 넘치고,
                아무 처리도 안 하면 "매수가: ₩4,/469"처럼 숫자 중간에서 끊긴다. */}
            <p className={`text-sm font-bold tabular-nums ${parseFloat(profitRate || '0') >= 0 ? 'text-rise' : 'text-fall'}`}>
              <span className="whitespace-nowrap">수익률: {profitRate}%</span>{' '}
              <span className="whitespace-nowrap">(매수가: ₩{stock.avgPrice?.toLocaleString()})</span>
            </p>
            {!editMode && (
              <button
                onClick={() => {
                  setEditMode(true);
                  setEditForm({
                    avgPrice: String(stock.avgPrice || ''),
                    quantity: String(stock.quantity || '0'),
                  });
                }}
                className="text-xs text-ink font-bold bg-inset border border-line px-4 py-2.5 min-h-[44px] rounded-lg hover:border-ink transition-colors whitespace-nowrap"
              >
                보유 정보 수정
              </button>
            )}
          </div>
        )}
        {isHolding && editMode && onUpdate && (
          <div className="mt-3 p-4 bg-inset border border-line rounded-xl animate-in fade-in duration-200">
            <p className="text-xs text-ink font-bold mb-3">보유 정보 수정</p>
            <div className="flex flex-wrap items-end gap-3 text-left">
              <div className="flex-1 min-w-[130px]">
                <label className="text-xs text-ink mb-1 block font-bold">매수가 (원)</label>
                <input
                  type="number"
                  value={editForm.avgPrice}
                  onChange={(e) => setEditForm({ ...editForm, avgPrice: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-3 py-2 text-sm text-ink tabular-nums focus:outline-none focus:border-ink"
                />
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="text-xs text-ink mb-1 block font-bold">수량 (주)</label>
                <input
                  type="number"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  className="w-full bg-surface border border-line-strong rounded-xl px-3 py-2 text-sm text-ink tabular-nums focus:outline-none focus:border-ink"
                />
              </div>
              <button
                onClick={async () => {
                  // value(비중)는 서버 recalcWeights가 자동 계산 (updateHolding은 avgPrice·quantity만 전송).
                  await onUpdate({
                    code: stock.code,
                    name: stock.name,
                    avgPrice: parseInt(editForm.avgPrice),
                    quantity: parseInt(editForm.quantity || '0'),
                    value: 0,
                  });
                  setEditMode(false);
                }}
                className="px-4 py-3 bg-ink hover:opacity-90 text-surface text-sm font-bold rounded-xl transition-opacity min-h-[44px]"
              >
                저장
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-3 text-muted hover:text-ink text-sm rounded-xl transition-colors min-h-[44px]"
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
