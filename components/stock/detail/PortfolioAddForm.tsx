'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { AddHoldingPayload } from '@/types/stock';

// 포트폴리오 추가 폼 (3.12차 S6 분리). addForm/adding state 지역화.
// ⚠️ DOM 계약: 모바일 lg:hidden 스크롤 버튼이 id="portfolio-add-form"에 의존(getElementById). id·scroll-mt-20 보존 필수.
interface PortfolioAddFormProps {
  code: string;
  name: string;                 // stockDetail?.name || stock.name
  defaultAvgPrice?: number;     // 초기 평균매수가 = stockDetail.price
  holdingsEmpty: boolean;       // holdings.length === 0 (첫 종목 판정)
  onAdd: (payload: AddHoldingPayload) => Promise<void>;
  onSuccess: (wasFirstStock: boolean) => void;
}

export default function PortfolioAddForm({ code, name, defaultAvgPrice, holdingsEmpty, onAdd, onSuccess }: PortfolioAddFormProps) {
  const [addForm, setAddForm] = useState({ avgPrice: defaultAvgPrice ? String(defaultAvgPrice) : '0', weight: '5', quantity: '0' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (defaultAvgPrice) setAddForm({ avgPrice: String(defaultAvgPrice), weight: '5', quantity: '0' });
  }, [defaultAvgPrice]);

  return (
    <div id="portfolio-add-form" className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 mb-6 scroll-mt-20">
      <h4 className="text-sm font-bold mb-4 flex items-center space-x-2">
        <Plus size={16} className="text-blue-400" />
        <span>내 포트폴리오에 추가</span>
      </h4>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-300 mb-1 block font-bold">평균 매수가 (₩)</label>
            <input type="number" title="여러 번 나눠 샀다면 평균을 입력해요" value={addForm.avgPrice}
              onChange={(e) => setAddForm({ ...addForm, avgPrice: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-300 mb-1 block font-bold">보유 수량 (주)</label>
            <input type="number" title="증권사 앱에서 확인할 수 있어요" value={addForm.quantity}
              onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-300 mb-1 block font-bold">총 자산의 몇 %예요?</label>
            <input type="number" placeholder="선택" title="총 자산(현금+주식 전체) 중 이 종목이 차지하는 비중" value={addForm.weight}
              onChange={(e) => setAddForm({ ...addForm, weight: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          평균 매수가: 여러 번 나눠 샀다면 평균을 입력해요. 수량은 증권사 앱에서 확인 가능. <span className="text-slate-400">비중은 잘 모르겠으면 비워두세요.</span>
        </p>
        {addForm.quantity !== '0' && addForm.avgPrice !== '0' && (
          <p className="text-xs text-slate-500">
            총 투자금액: ₩{(parseInt(addForm.quantity || '0') * parseInt(addForm.avgPrice || '0')).toLocaleString()}
          </p>
        )}
        <button onClick={async () => {
          setAdding(true);
          // 첫 종목인지 미리 스냅샷 — addHolding이 holdings를 갱신하기 전에 확인
          const wasFirstStock = holdingsEmpty && !localStorage.getItem('onboarding_first_stock_guided');
          try {
            await onAdd({ code, name,
              avgPrice: parseInt(addForm.avgPrice), value: parseInt(addForm.weight),
              quantity: parseInt(addForm.quantity || '0') });
            onSuccess(wasFirstStock);
          } catch (err) { console.error('Failed to add:', err); } finally { setAdding(false); }
        }} disabled={adding}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 min-h-[44px]">
          {adding ? '추가 중...' : '포트폴리오 등록'}
        </button>
      </div>
    </div>
  );
}
