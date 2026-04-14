'use client';

import { useEffect, useState } from 'react';

export default function DisclaimerModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!localStorage.getItem('disclaimer_accepted'));
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
        <h2 className="text-lg font-bold text-white">투자 유의사항</h2>
        <div className="text-sm text-slate-400 leading-relaxed space-y-2">
          <p>이 앱의 분석과 추천은 <strong className="text-white">투자 참고용 정보이며, 투자 결정의 책임은 본인에게 있습니다.</strong></p>
          <p>이 앱은 <strong className="text-blue-300">정보 제공 도구로, 실제 주식 거래는 지원하지 않아요.</strong> 실제 매수·매도는 증권사 앱에서 직접 진행해 주세요.</p>
          <p>모든 투자에는 <strong className="text-red-400">원금 손실 위험</strong>이 있으며, 과거 데이터 기반 분석이 미래 수익을 보장하지 않습니다.</p>
          <p>종목 추천 점수와 의견은 알고리즘 자동 산출 결과이며, 전문 투자 조언이 아닙니다.</p>
        </div>
        <button
          onClick={() => { localStorage.setItem('disclaimer_accepted', '1'); setShow(false); }}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors"
        >
          확인했습니다
        </button>
      </div>
    </div>
  );
}
