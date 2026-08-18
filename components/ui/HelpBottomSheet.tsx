'use client';
import { X } from 'lucide-react';

export type HelpTermKey =
  | 'per' | 'pbr' | 'roe' | 'peg'
  | 'rsi' | 'macd' | 'bollinger' | 'supplyDemand' | 'sma'
  // 차트 오버레이 Phase 2 — 칩의 [?]가 여는 "읽는 법"
  | 'candle' | 'supportResistance' | 'lrc' | 'stochastic' | 'volume';

interface HelpContent {
  title: string;
  short: string;
  body: string[];
  inApp: string;        // "이 앱에서는?" — 이 앱의 어느 부분에서 이 개념이 쓰이는지
  example?: string;     // 예시 숫자
  implication?: string; // 3.9차 — "그래서 어떻게 보면 되나요?" 한 줄 해석 (선택)
  // 차트 Phase 2 — ⚠️ 캐비엇. Phase 4 백테스팅이 기술·추세 지표의 **방향 예측력 없음**을
  // 실증했다(기술 IC≈0, 추세·HoldingOpinion 역방향). 그래서 모든 지표 설명은 여기서 끝난다:
  // "이 지표는 방향을 맞히지 않는다." 이 문구를 빼면 팝업이 예측 프레이밍으로 되돌아간다.
  caveat?: string;
}

// 작성 기준 (8차 보완): ① 한 문장 정의 ② 높으면/낮으면 ③ 이 앱에서의 활용 ④ 예시 숫자
// export 이유: `tests/stockDetail/helpContents.test.ts`가 금지어를 전수 스윕한다
// (지표 팝업은 사용자가 "이 지표를 어떻게 읽나"의 정본으로 읽는 표면이다).
export const HELP_CONTENTS: Record<HelpTermKey, HelpContent> = {
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
    short: '오른 힘과 내린 힘을 0~100으로',
    body: [
      '최근 14일 동안 오른 폭과 내린 폭을 견줘 0~100으로 나타내요.',
      '70 위: 최근 14일 오름폭이 컸다는 뜻이에요. 흔히 "과매수 구간"이라고 불러요.',
      '30 아래: 최근 14일 내림폭이 컸다는 뜻이에요. 흔히 "과매도 구간"이라고 불러요.',
    ],
    inApp: '차트에서 RSI 칩을 켜면 아래 칸에 선으로 그려지고, 70·30 위치에 안내선이 함께 표시돼요.',
    example: '예: RSI 75 = 최근 14일 오름폭이 큰 구간',
    caveat: '70을 넘었다고 곧 내려온다는 뜻은 아니에요. 힘이 센 종목은 70 위에 오래 머물기도 해요. 방향은 아무도 못 맞혀요.',
  },
  macd: {
    title: 'MACD란?',
    short: '두 이동평균의 간격',
    body: [
      '단기(12일)와 장기(26일) 이동평균의 간격을 그린 지표예요.',
      '막대가 0 위에 있으면 단기 평균이 장기 평균보다 위, 아래면 그 반대라는 뜻이에요.',
      '두 선이 교차하는 지점을 신호로 보는 사람도 있어요.',
    ],
    inApp: '차트에서 MACD 칩을 켜면 아래 칸에 두 선과 막대가 그려져요. 막대 = 두 선의 차이예요.',
    example: '예: 막대 0 위 = 단기 평균이 장기 평균 위',
    caveat: '교차가 방향을 보장하지 않아요. 이 앱의 백테스팅에서도 이동평균 기반 신호는 이후 수익률을 가르지 못했어요. 보조 도구로만 봐주세요.',
  },
  bollinger: {
    title: '볼린저밴드란?',
    // M3 — '매수 검토/매도 검토'는 방향 지시라 제거(R2). 밴드 내 위치 사실만.
    short: '주가가 평소 움직이는 통로',
    body: [
      '20일 평균을 가운데 두고, 그 위아래로 평소 흔들리는 폭만큼 띠를 그린 거예요.',
      '위 선 근처 = 평소보다 많이 올라간 상태, 아래 선 근처 = 평소보다 많이 내려간 상태예요.',
      '띠가 좁아지면 요즘 조용했다는 뜻, 넓어지면 많이 흔들렸다는 뜻이에요.',
    ],
    inApp: '차트에서 볼린저밴드 칩을 켜면 위·아래 선이 캔들 위에 겹쳐 그려져요. 가운데 선은 20일 평균과 같은 값이라, 이동평균선 칩이 켜져 있으면 그쪽 20일선으로 대신 보여드려요.',
    example: '예: 가운데 선 = 20일 평균 가격',
    caveat: '위쪽이 팔 때, 아래쪽이 살 때라는 뜻이 아니에요. 지금 어디쯤 있는지 위치만 보는 용도예요.',
  },
  candle: {
    title: '캔들(봉)이란?',
    short: '하루 가격을 막대 하나로',
    body: [
      '막대 하나가 하루예요. 몸통은 시작 가격(시가)과 끝 가격(종가) 사이, 위아래 꼬리는 그날의 최고가·최저가예요.',
      '빨간 봉은 오른 날, 파란 봉은 내린 날이에요.',
      '몸통이 길수록 그날 가격이 많이 움직였다는 뜻이에요.',
    ],
    // '사라지고' → '없어지고': FORBIDDEN_BASE의 '사라'(명령형 "사라")와 부분문자열이 겹쳐
    // 스윕이 걸린다. 공용 금지어를 느슨하게 만드는 대신 이쪽 문구를 바꾼다.
    inApp: '차트의 기본 표시예요. 캔들 칩으로 끄면 봉이 없어지고 오버레이 선만 남아요.',
    example: '예: 위아래 꼬리가 길고 몸통이 짧으면 = 많이 흔들렸지만 제자리로 돌아온 날',
    caveat: '한국은 빨강이 오른 날, 파랑이 내린 날이에요. 미국 차트와 색이 반대라 헷갈리기 쉬워요.',
  },
  supportResistance: {
    title: '지지·저항이란?',
    short: '과거에 자주 멈췄던 가격대',
    body: [
      '과거에 여러 번 부딪히고 멈췄던 가격대를 가로선으로 표시한 거예요.',
      '저항: 위로 올라가다 자주 막혔던 자리',
      '지지: 아래로 내려가다 자주 되돌아왔던 자리',
    ],
    inApp: '차트에서 지지·저항 칩을 켜면 현재가 위/아래에서 가장 가까운 자리 한 개씩만 가로선으로 그려요.',
    example: '예: 저항 30,000원 = 과거에 3만 원 근처에서 자주 막혔다',
    caveat: '반드시 뚫거나 되돌아온다는 보장은 없어요. 과거에 그랬다는 기록일 뿐이에요.',
  },
  lrc: {
    title: '회귀채널(LRC)이란?',
    short: '최근 흐름을 직선 하나로',
    body: [
      '최근 20일 가격에 가장 잘 맞는 직선을 그리고, 그 위아래로 흔들린 폭만큼 통로를 그린 거예요.',
      '가운데 선이 위로 기울면 그 기간 동안 올라왔다는 뜻, 아래로 기울면 내려왔다는 뜻이에요.',
      '볼린저밴드의 기울어진 사촌이라고 보면 돼요.',
    ],
    inApp: '차트에서 회귀채널 칩을 켜면 최근 20일 구간에만 세 선이 그려져요. 그 구간 밖으로 연장하지 않아요.',
    example: '예: 가운데 선이 위로 기울어 있으면 = 최근 20일은 올라온 구간',
    caveat: '기울어 있다고 그 방향으로 계속 간다는 뜻이 아니에요. 선을 앞으로 늘려 보는 건 예측이고, 이 앱은 그렇게 하지 않아요.',
  },
  stochastic: {
    title: '스토캐스틱이란?',
    short: '최근 범위에서 지금 위치',
    body: [
      'RSI의 사촌이에요. 최근 14일 최고가~최저가 범위에서 지금 종가가 어디쯤인지 0~100으로 나타내요.',
      '80 위: 최근 범위의 위쪽에 있다는 뜻',
      '20 아래: 최근 범위의 아래쪽에 있다는 뜻',
    ],
    inApp: '차트에서 스토캐스틱 칩을 켜면 아래 칸에 %K·%D 두 선이 그려지고, 80·20 안내선이 함께 표시돼요.',
    example: '예: 90 = 최근 14일 범위에서 거의 최고가 근처',
    caveat: '"많이 왔다"가 "곧 돌아선다"는 뜻은 아니에요. 위치를 보는 지표이고 방향을 맞히는 지표가 아니에요.',
  },
  volume: {
    title: '거래량이란?',
    short: '그날 주식이 얼마나 거래됐나',
    body: [
      '하루 동안 주식이 몇 주 거래됐는지를 막대로 보여줘요.',
      '주황선은 최근 20일 평균 거래량이에요.',
      '막대가 주황선을 크게 넘으면 그날 관심이 몰렸다는 뜻이에요.',
    ],
    inApp: '차트 아래 칸에 항상 표시돼요. 거래량 칩으로 끄거나 켤 수 있어요.',
    example: '예: 막대가 주황선의 2배 = 평소보다 두 배 거래됨',
    caveat: '거래량이 늘었다는 것만으로는 어느 방향인지 알 수 없어요. 왜 몰렸는지(뉴스·공시)를 같이 보는 게 좋아요.',
  },
  supplyDemand: {
    title: '수급(외국인·기관)이란?',
    // M3 — '긍정적'은 앱 전역에서 걷어낸 판정 라벨이라 여기서도 사실 서술로.
    short: '외국인·기관의 매수/매도 흐름',
    body: [
      '외국인과 기관 투자자가 주식을 사고 파는 흐름이에요.',
      // "큰손들이 미래 가치를 긍정적으로 본다는 신호" — 타인의 의도를 추정한 예측 프레이밍이라
      // 교체한다. 우리가 아는 건 순매수 일수가 이어졌다는 사실뿐이다.
      '연속 순매수: 그 기간 동안 산 양이 판 양보다 많았던 날이 이어졌다는 뜻이에요.',
    ],
    inApp: '이 앱에서는 최근 10거래일에 가중치 감쇠(decay 0.8)를 적용해 항목별 점수의 수급 항목(0~2점)으로 환산해요. 외국인이 더 큰 가중치(max 1.2)를 받아요.',
    example: '예: 외국인 5일 연속 매수 = 강한 매수 우위',
  },
  sma: {
    title: '이동평균선 (SMA)이란?',
    short: '추세 판단 기준선',
    body: [
      '최근 5일/20일 종가의 평균을 이은 선이에요. 5일선은 단기 흐름, 20일선은 중기 흐름이에요.',
      '주가가 5일선 위에 있으면 최근 5일 평균보다 위라는 뜻이고, 5일선 > 20일선이면 정배열(단기선이 중기선 위)이에요.',
      '단기선이 장기선을 아래에서 위로 지나면 골든크로스, 위에서 아래로 지나면 데드크로스라고 불러요.',
    ],
    inApp: '차트에서 이동평균선 칩을 켜면 5·20·60일 세 선이 캔들 위에 겹쳐 그려져요. 보유 종목은 주가가 5일·20일 평균보다 위인지 아래인지를 문장으로도 풀어서 보여줘요.',
    example: '예: 5일선 72,000원 / 현재가 70,000원 → 주가가 5일 평균보다 아래에 있는 상태',
    caveat: '크로스가 방향을 보장하지 않아요. 이 앱이 3년 데이터로 확인해 봤을 때 이동평균 기반 신호는 이후 수익률을 가르지 못했어요. 참고 정보로만 봐주세요.',
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
        {/* ⚠️ 캐비엇 — 방향 예측이 아니라는 고지. 정보보다 크지 않게 각주 톤으로(3.13 VIS-7). */}
        {content.caveat && (
          <div className="bg-inset border border-line rounded-lg p-3">
            <p className="text-xs text-muted leading-relaxed">⚠️ {content.caveat}</p>
          </div>
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
