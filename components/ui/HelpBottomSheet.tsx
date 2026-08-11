'use client';
import { X } from 'lucide-react';

export type HelpTermKey = 'per' | 'pbr' | 'roe' | 'peg' | 'rsi' | 'macd' | 'bollinger' | 'supplyDemand' | 'sma';

interface HelpContent {
  title: string;
  short: string;
  body: string[];
  inApp: string;        // "이 앱에서는?" — 이 앱의 어느 부분에서 이 개념이 쓰이는지
  example?: string;     // 예시 숫자
  implication?: string; // 3.9차 — "그래서 어떻게 보면 되나요?" 한 줄 해석 (선택)
}

// 작성 기준 (8차 보완): ① 한 문장 정의 ② 높으면/낮으면 ③ 이 앱에서의 활용 ④ 예시 숫자
const HELP_CONTENTS: Record<HelpTermKey, HelpContent> = {
  per: {
    title: 'PER (주가수익비율)이란?',
    short: '낮을수록 저평가',
    body: [
      '지금 주가가 1년 이익의 몇 배인지를 나타내요.',
      '낮을수록 상대적으로 저렴한 편이에요.',
      '같은 업종끼리 비교해야 의미가 있어요.',
    ],
    inApp: '이 앱에서는 같은 업종 회사들의 PER 중앙값과 비교해서 "저렴한 편"인지 "비싼 편"인지 알려드려요. 항목별 점수의 밸류에이션 항목에 반영돼요.',
    example: '예: PER 10배 = 지금 주가로 10년치 이익을 산 셈',
    implication: '같은 업종 평균보다 낮으면 상대적으로 저렴할 수 있어요. 업종마다 정상 범위가 달라서 단일 숫자만으로 판단하지 마세요.',
  },
  pbr: {
    title: 'PBR (주가순자산비율)이란?',
    short: '1 이하면 자산 대비 저평가',
    body: [
      '주가가 회사가 가진 순자산의 몇 배인지를 나타내요.',
      '1 미만이면 자산보다 싸게 거래되고 있다는 뜻이에요.',
    ],
    inApp: '이 앱에서는 업종 중앙값 PBR과 비교해서 자산 대비 저평가 여부를 판단해요. 밸류에이션 점수에 반영돼요.',
    example: '예: PBR 0.8배 = 회사 자산보다 20% 싸게 거래',
    implication: '1 미만이면 자산 대비 저평가일 수 있어요. 단, 사업이 부진해서 싼 경우도 있으니 ROE와 함께 확인해 보세요.',
  },
  roe: {
    title: 'ROE (자기자본이익률)이란?',
    short: '자기자본 대비 이익의 크기',
    body: [
      '회사가 자기 돈으로 1년간 얼마를 벌었는지를 %로 나타내요.',
      '보통 10% 이상을 높은 편으로 보고, 15% 이상이면 더 높은 편으로 봐요.',
    ],
    // M3 — MetricsGrid ROE 문구와 임계값을 정합시킨다(15 / 10~15 / 10 미만).
    inApp: '이 앱에서는 15% 이상을 높은 편, 10~15%를 보통 수준, 10% 미만을 낮은 편으로 구분해 표시해요. 스크리너의 "고수익 성장주" 프리셋은 ROE ≥ 20% 조건을 사용해요.',
    example: '예: ROE 15% = 자기자본 100원으로 15원을 번 셈',
    implication: '숫자 하나로는 알 수 없어요. 일시적 호황이 섞일 수 있어 최근 몇 분기 추이를 함께 보고, 빌린 돈이 많으면 ROE가 높게 나오기도 하니 부채비율도 같이 봐주세요.',
  },
  peg: {
    title: 'PEG (성장 보정 PER)이란?',
    short: '1 미만이면 성장 대비 저평가',
    body: [
      'PER을 EPS 성장률(%)로 나눈 값이에요.',
      '1 미만: 성장성에 비해 주가가 저렴하다는 신호 (저평가)',
      '1~2: 적정 수준',
      '2 초과: 성장 대비 비싼 편',
      '성장률이 0이거나 음수면 계산이 의미 없어 ---로 표시돼요.',
    ],
    inApp: '이 앱에서는 종목 상세의 PEG 카드에서 EPS 성장률로 보정한 PER을 함께 보여줘요. 성장주는 PER이 높아 보여도 PEG는 낮을 수 있어요.',
    example: '예: PER 30, EPS 성장률 +40% → PEG = 0.75 (저평가)',
    implication: '성장 기업을 평가할 때 PER보다 유용해요. 성장률이 마이너스거나 0이면 의미 없으니 \'---\'로 표기돼요.',
  },
  rsi: {
    title: 'RSI (상대강도지수)란?',
    short: '70↑ 과매수, 30↓ 과매도',
    body: [
      '최근 14일 동안 주가가 얼마나 올랐는지/떨어졌는지를 0~100으로 나타내요.',
      '70 이상: 단기간에 많이 올라 쉬어갈 수 있어요.',
      '30 이하: 많이 떨어져서 반등할 수 있어요.',
    ],
    inApp: '이 앱에서는 종목 상세의 "기술적 지표 종합 분석" 카드에 RSI 값과 함께 색상으로 표시해요. 항목별 점수의 기술지표 항목에 30% 가중치로 반영돼요.',
    example: '예: RSI 75 = 단기 과매수 구간',
  },
  macd: {
    title: 'MACD (이동평균 수렴·확산)란?',
    short: '추세 전환 신호',
    body: [
      '단기와 장기 이동평균선의 차이로 추세 변화를 포착해요.',
      '히스토그램 양수면 상승 흐름, 음수면 하락 흐름이에요.',
    ],
    inApp: '이 앱에서는 MACD 라인과 시그널 라인 값을 함께 보여주고, 항목별 점수의 기술지표 항목에 25% 가중치로 반영돼요.',
    example: '예: MACD > 시그널 = 단기 상승 우위',
  },
  bollinger: {
    title: '볼린저밴드란?',
    // M3 — '매수 검토/매도 검토'는 방향 지시라 제거(R2). 밴드 내 위치 사실만.
    short: '하단 근접 = 평균보다 낮음, 상단 근접 = 평균보다 높음',
    body: [
      '주가가 평균에서 얼마나 벗어났는지 보여주는 띠예요.',
      '하단 근접: 평소보다 많이 내려간 상태 (반등 가능)',
      '상단 근접: 평소보다 많이 올라간 상태 (조정 가능)',
    ],
    inApp: '이 앱에서는 %B(밴드 안에서 현재 위치, 0~100%)로 표시해요. 항목별 점수의 기술지표 항목에 20% 가중치로 반영돼요.',
    example: '예: %B 50% = 밴드 중앙(평균 부근)',
  },
  supplyDemand: {
    title: '수급(외국인·기관)이란?',
    // M3 — '긍정적'은 앱 전역에서 걷어낸 판정 라벨이라 여기서도 사실 서술로.
    short: '외국인·기관의 매수/매도 흐름',
    body: [
      '외국인과 기관 투자자가 주식을 사고 파는 흐름이에요.',
      '연속 순매수: 큰손들이 미래 가치를 긍정적으로 본다는 신호',
      '단기간 매수만으로 매수 결정을 내리진 마세요.',
    ],
    inApp: '이 앱에서는 최근 10거래일에 가중치 감쇠(decay 0.8)를 적용해 항목별 점수의 수급 항목(0~2점)으로 환산해요. 외국인이 더 큰 가중치(max 1.2)를 받아요.',
    example: '예: 외국인 5일 연속 매수 = 강한 매수 우위',
  },
  sma: {
    title: '이동평균선 (SMA)이란?',
    short: '추세 판단 기준선',
    body: [
      '최근 5일/20일 종가의 평균을 이은 선이에요. 5일선은 단기 흐름, 20일선은 중기 흐름이에요.',
      '주가가 5일선 위에 있으면 최근 5일보다 올랐다는 뜻이고, 5일선 > 20일선이면 정배열(강세)이에요.',
      '주가가 5일선·20일선 모두 아래로 내려가면 하락 추세 신호로 봐요.',
    ],
    inApp: '이 앱에서는 보유 종목의 주가가 5일·20일 평균 가격보다 위인지 아래인지를 문장으로 풀어서 보여줘요. 방향을 정해주는 판정 라벨은 쓰지 않아요 — 위치만 알려드리고 판단은 본인이 하시면 돼요. 히스토리가 5일 미만이면 "분석 중"으로 표시돼요.',
    example: '예: 5일선 72,000원 / 현재가 70,000원 → 5일선 아래에 있어서 단기 하락 신호',
  },
};

interface HelpBottomSheetProps {
  termKey: HelpTermKey | null;
  onClose: () => void;
}

const HelpBottomSheet = ({ termKey, onClose }: HelpBottomSheetProps) => {
  if (!termKey) return null;
  const content = HELP_CONTENTS[termKey];

  return (
    <div className="fixed inset-0 bg-black/40 z-[200] flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-line rounded-t-xl md:rounded-xl p-6 max-w-md w-full space-y-4 shadow-lg animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink">{content.title}</h3>
            <p className="text-xs text-muted mt-1">{content.short}</p>
          </div>
          <button onClick={onClose} className="p-2 text-faint hover:text-ink min-w-[44px] min-h-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-2">
          {content.body.map((line, i) => (
            <p key={i} className="text-sm text-muted leading-relaxed">{line}</p>
          ))}
        </div>
        <div className="bg-inset border border-line rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-bold text-ink">이 앱에서는?</p>
          <p className="text-sm text-muted leading-relaxed">{content.inApp}</p>
        </div>
        {content.implication && (
          <div className="bg-inset border border-line rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-bold text-ink">그래서 어떻게 보면 되나요?</p>
            <p className="text-sm text-muted leading-relaxed">{content.implication}</p>
          </div>
        )}
        {content.example && (
          <p className="text-xs text-faint italic">{content.example}</p>
        )}
        <button
          onClick={onClose}
          className="w-full py-3 bg-ink hover:opacity-90 text-surface text-sm font-bold rounded-xl transition-opacity"
        >
          닫기
        </button>
      </div>
    </div>
  );
};

export default HelpBottomSheet;
