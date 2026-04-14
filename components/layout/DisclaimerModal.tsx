'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'hidden' | 'disclaimer' | 'purpose' | 'done';

export default function DisclaimerModal() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('hidden');

  useEffect(() => {
    const disclaimerDone = !!localStorage.getItem('disclaimer_accepted');
    const onboardingDone = !!localStorage.getItem('onboarding_done');
    if (!disclaimerDone) setStep('disclaimer');
    else if (!onboardingDone) setStep('purpose');
    else setStep('done');
  }, []);

  const finishDisclaimer = () => {
    localStorage.setItem('disclaimer_accepted', '1');
    setStep('purpose');
  };

  const finishOnboarding = (target?: string) => {
    localStorage.setItem('onboarding_done', '1');
    setStep('done');
    if (target) router.push(target);
  };

  if (step === 'hidden' || step === 'done') return null;

  if (step === 'disclaimer') {
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
          <button onClick={finishDisclaimer} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors">
            확인했습니다
          </button>
        </div>
      </div>
    );
  }

  // purpose 단계: 어떻게 사용하실 건가요? 3갈래
  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
        <p className="text-xs text-blue-400 font-bold">시작하기</p>
        <h2 className="text-lg font-bold text-white">어떻게 사용하실 건가요?</h2>
        <p className="text-sm text-slate-400 leading-relaxed">가장 가까운 상황을 골라주세요. 나중에 다른 기능도 전부 쓰실 수 있어요.</p>

        <button
          onClick={() => finishOnboarding('/portfolio?focus=add-holding')}
          className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-blue-500 active:border-blue-500 text-left transition-colors"
        >
          <p className="text-sm font-bold text-white mb-1">📊 이미 산 주식을 관리하고 싶어요</p>
          <p className="text-xs text-slate-400 leading-relaxed">보유 종목을 등록하면 수익률 추적과 매매 의견을 받을 수 있어요.</p>
        </button>

        <button
          onClick={() => finishOnboarding('/recommendations')}
          className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-blue-500 active:border-blue-500 text-left transition-colors"
        >
          <p className="text-sm font-bold text-white mb-1">🔍 어떤 주식을 사면 좋을지 알고 싶어요</p>
          <p className="text-xs text-slate-400 leading-relaxed">알고리즘 점수 기반 추천 종목을 먼저 살펴봐요.</p>
        </button>

        <button
          onClick={() => finishOnboarding('/stocks')}
          className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-blue-500 active:border-blue-500 text-left transition-colors"
        >
          <p className="text-sm font-bold text-white mb-1">📚 주식 공부를 시작하고 싶어요</p>
          <p className="text-xs text-slate-400 leading-relaxed">주요 97종목을 둘러보고, 용어 설명으로 기본기를 익혀요.</p>
        </button>

        <button onClick={() => finishOnboarding()} className="w-full text-xs text-slate-500 hover:text-slate-300 py-2">
          건너뛰고 대시보드로
        </button>
      </div>
    </div>
  );
}
