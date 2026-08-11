'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// 3.9차 — Step 0(앱 가치 제안) → Step 1(면책) → Step 2(3갈래 온보딩)
type Step = 'hidden' | 'intro' | 'disclaimer' | 'purpose' | 'done';

export default function DisclaimerModal() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('hidden');

  useEffect(() => {
    const disclaimerDone = !!localStorage.getItem('disclaimer_accepted');
    const onboardingDone = !!localStorage.getItem('onboarding_done');
    if (!disclaimerDone) setStep('intro');           // 신규 사용자: 앱 소개부터
    else if (!onboardingDone) setStep('purpose');    // 면책만 본 기존 사용자: 온보딩으로
    else setStep('done');
  }, []);

  const finishDisclaimer = () => {
    localStorage.setItem('disclaimer_accepted', '1');
    setStep('purpose');
  };

  const finishOnboarding = (target?: string, mode?: 'learn') => {
    localStorage.setItem('onboarding_done', '1');
    if (mode) localStorage.setItem('onboarding_mode', mode);
    else localStorage.removeItem('onboarding_mode');
    setStep('done');
    if (target) router.push(target);
  };

  if (step === 'hidden' || step === 'done') return null;

  // ============ Step 0: 앱 가치 제안 ============
  if (step === 'intro') {
    const features = [
      { title: '180여 개 종목 분석', desc: '실적·기술지표·수급을 종합해서 알기 쉽게 정리해드려요' },
      { title: '내 종목 상태 확인', desc: '보유 중인 종목이 지금 어떤 상태인지 바로 확인할 수 있어요' },
      { title: '테마별 탐색', desc: '2차전지, AI·반도체, 방산 등 관심 테마의 종목을 모아볼 수 있어요' },
      { title: '가격 변화 알림', desc: '주요 변화가 생기면 알림으로 알려드려요' },
    ];
    return (
      <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
        <div className="bg-surface border border-line rounded-xl p-6 max-w-md w-full flex flex-col max-h-[90vh] shadow-lg">
          {/* 스크롤 영역 — 모바일 작은 화면에서도 4개 카드 전부 볼 수 있도록 */}
          <div className="overflow-y-auto -mx-2 px-2">
            <div>
              <h2 className="text-xl font-black text-ink mb-4 text-center">한국 주식, 쉽게 분석해드려요</h2>
              <div className="space-y-2 text-left mb-2">
                {features.map(item => (
                  <div key={item.title} className="p-3 bg-inset rounded-lg">
                    <p className="text-sm font-bold text-ink">{item.title}</p>
                    <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* 버튼 영역 — 스크롤 밖에 고정 */}
          <div className="mt-4 pt-4 border-t border-line shrink-0">
            <button
              onClick={() => setStep('disclaimer')}
              className="w-full py-4 min-h-[44px] bg-ink hover:opacity-90 text-surface font-bold rounded-xl text-sm transition-opacity"
            >
              시작해볼게요 →
            </button>
            <p className="text-xs text-faint mt-3 text-center">로그인 없이 바로 사용할 수 있어요</p>
          </div>
        </div>
      </div>
    );
  }

  // ============ Step 1: 면책 ============
  if (step === 'disclaimer') {
    return (
      <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
        <div className="bg-surface border border-line rounded-xl p-6 max-w-md w-full space-y-4 shadow-lg">
          <h2 className="text-lg font-bold text-ink">투자 유의사항</h2>
          <div className="text-sm text-muted leading-relaxed space-y-2">
            {/* D4 — 앱이 종목을 추천하지 않게 됐으므로 면책 문구의 '추천' 프레이밍도 정리한다. */}
            <p>이 앱의 분석은 <strong className="text-ink">투자 참고용 정보이며, 투자 결정의 책임은 본인에게 있습니다.</strong></p>
            <p>이 앱은 <strong className="text-ink">정보 제공 도구로, 실제 주식 거래는 지원하지 않아요.</strong> 실제 매수·매도는 증권사 앱에서 직접 진행해 주세요.</p>
            <p>모든 투자에는 <strong className="text-caution">원금 손실 위험</strong>이 있으며, 과거 데이터 기반 분석이 미래 수익을 보장하지 않습니다.</p>
            {/* '종목 추천 점수와 의견'은 D1·M1에서 전부 제거됐다 — 실제 남은 것으로 고쳐 쓴다. */}
            <p>지표 계산과 관점별 풀이는 알고리즘 자동 산출 결과이며, 전문 투자 조언이 아닙니다.</p>
          </div>
          <button onClick={finishDisclaimer} className="w-full py-3 bg-ink hover:opacity-90 text-surface text-sm font-bold rounded-xl transition-opacity">
            확인했습니다
          </button>
        </div>
      </div>
    );
  }

  // ============ Step 2: 3갈래 온보딩 ============
  const options = [
    {
      label: '지금 갖고 있는 주식\n관리하기',
      sub: '수익률·보유 상태를 한눈에 확인해요',
      onClick: () => finishOnboarding('/portfolio?focus=add-holding'),
    },
    {
      // D4 — '어떤 종목 살지'는 매수 전제 프레이밍이라 '어떤 종목이 있는지'로. '추천' → '탐색'.
      label: '어떤 종목이 있는지\n살펴보기',
      sub: '탐색·테마·스크리너로 종목을 찾아봐요',
      onClick: () => finishOnboarding('/recommendations'),
    },
    {
      label: '주식 기초부터\n이해하기',
      sub: 'PER·PBR·이평선이 뭔지 알아가요',
      onClick: () => finishOnboarding('/stocks', 'learn'),
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-xl p-6 max-w-md w-full space-y-4 shadow-lg">
        <p className="text-xs text-muted font-bold">시작하기</p>
        <h2 className="text-lg font-bold text-ink">어떻게 사용하실 건가요?</h2>
        <p className="text-sm text-muted leading-relaxed">가장 가까운 상황을 골라주세요. 나중에 다른 기능도 전부 쓰실 수 있어요.</p>

        {options.map(opt => (
          <button
            key={opt.label}
            onClick={opt.onClick}
            className="w-full p-4 bg-surface hover:bg-inset border border-line-strong hover:border-ink rounded-xl text-left transition-colors min-h-[44px]"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink whitespace-pre-line leading-tight">{opt.label}</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">{opt.sub}</p>
            </div>
          </button>
        ))}

        <button onClick={() => finishOnboarding()} className="w-full text-xs text-muted hover:text-ink py-2 min-h-[44px]">
          건너뛰고 대시보드로
        </button>
      </div>
    </div>
  );
}
