// 지표 그림 에셋 SSOT — 칩 아이콘(작은 스케치) + 팝업 삽화(주석 있는 미니 차트).
//
// **왜 한 파일인가**: 칩과 팝업이 같은 그림을 공유한다. 따로 두면 그 순간 드리프트한다
// (이 세션에서 반복된 결함 형태 — 범례를 별도 목록으로 들었을 때, 문구를 컴포넌트에
// 인라인했을 때 둘 다 같은 방식으로 어긋났다).
//
// **왜 주석 문자열을 데이터로 두는가**: `<text>`에 인라인하면 금지어 스윕 밖으로 샌다.
// `ILLUS_NOTES`·`ILLUS_ARIA`는 순수 데이터라 `tests/stockDetail/indicatorGraphics.test.ts`가
// 전수 훑는다. 좌표·색도 여기 있지만 스윕 대상은 `.text`뿐이다.
//
// ⚠️ **관찰형·비예측**(R2 + Phase 4): 주석은 "이 모양이 무엇인가"까지만 말한다.
//    "여기서 오른다/이때 사라" 류는 금지. Phase 4가 기술·추세 지표의 방향 예측력 없음을
//    실증했고(기술 IC≈0 · 추세·수급 역방향), 삽화는 글보다 단정적으로 읽히므로 더 엄격하다.
//    화살표로 앞을 가리키거나 미래 구간을 그리지 않는다(회귀채널 캐비엇과 같은 이유).
import type { ReactElement } from 'react';
import type { HelpTermKey } from '@/components/ui/HelpBottomSheet';

/** 그림이 있는 지표 — `HelpTermKey`의 부분집합(칩 9종의 help 키와 정확히 일치). */
export type IndicatorGraphicKey =
  | 'candle' | 'sma' | 'bollinger' | 'supportResistance' | 'lrc'
  | 'rsi' | 'macd' | 'stochastic' | 'volume';

const GRAPHIC_KEYS: IndicatorGraphicKey[] = [
  'candle', 'sma', 'bollinger', 'supportResistance', 'lrc', 'rsi', 'macd', 'stochastic', 'volume',
];

/**
 * 팝업은 `HelpTermKey` 전체(PER·PBR·수급 등)를 다루는데 그림은 지표 9종에만 있다.
 * 그림 없는 키는 삽화 슬롯을 아예 렌더하지 않는다(빈 상자를 만들지 않는다).
 */
export function indicatorGraphicKey(k: HelpTermKey): IndicatorGraphicKey | null {
  return (GRAPHIC_KEYS as string[]).includes(k) ? (k as IndicatorGraphicKey) : null;
}

// 색은 `app/design-tokens.css`(SSOT) 값을 그대로 쓴다 — ChartSection의 `C`와 같은 hex라
// 삽화에서 본 색이 실제 차트에서 그대로 나온다. 방향색(rise/fall)은 **캔들에만**.
const G = {
  rise: '#D91C1C',      // 오른 날 봉
  fall: '#1B5FD0',      // 내린 날 봉
  ink: '#17181C',       // 주선(가격·지표 본선)
  muted: '#6E7076',     // 보조선·주석 본문
  faint: '#85878D',     // 보조선(두 번째 선)·눈금
  band: '#A8AAA5',      // 볼린저 위·아래 선, 거래량 막대
  bandMid: '#6E7076',   // 볼린저 가운데 선
  lrc: '#85878D',       // 회귀채널
  amber: '#9A5B08',     // 20일선 · 거래량 평균선
  guide: '#C9CAC6',     // 70/30·80/20 안내선
  grid: '#E7E7E3',
} as const;

// ── 삽화 주석 (스윕 대상) ────────────────────────────────────────────

export type IllusNote = {
  /** 사용자에게 보이는 문구 — **금지어 스윕 대상**. 사실만, 방향 단정 없음. */
  text: string;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  /** 있으면 텍스트 앞에 짧은 색 선을 그린다(범례형 주석). */
  swatch?: { color: string; dashed?: boolean };
  /** 있으면 주석에서 그림의 그 지점으로 얇은 지시선을 그린다. */
  leader?: { x1: number; y1: number; x2: number; y2: number };
};

/**
 * 삽화 위에 얹는 주석.
 *
 * 작성 기준: ① 모양의 정의만 ② 팝업 본문(`HELP_CONTENTS.body`)과 같은 말로 ③ 16자 이내
 * (220 폭에서 겹치지 않는 한계). "그래서 어떻다"는 붙이지 않는다.
 */
export const ILLUS_NOTES: Record<IndicatorGraphicKey, IllusNote[]> = {
  candle: [
    { text: '몸통 = 시가~종가', x: 8, y: 88, anchor: 'start', leader: { x1: 44, y1: 84, x2: 56, y2: 62 } },
    { text: '꼬리 = 그날 최고·최저', x: 212, y: 88, anchor: 'end', leader: { x1: 168, y1: 84, x2: 168, y2: 74 } },
    { text: '빨강 = 오른 날 · 파랑 = 내린 날', x: 110, y: 103, anchor: 'middle' },
  ],
  sma: [
    { text: '두 선이 만나는 자리', x: 145, y: 13, anchor: 'middle', leader: { x1: 145, y1: 17, x2: 145, y2: 30 } },
    { text: '5일선 = 최근 5일 평균', x: 26, y: 88, anchor: 'start', swatch: { color: G.rise, dashed: true } },
    { text: '20일선 = 최근 20일 평균', x: 26, y: 102, anchor: 'start', swatch: { color: G.amber } },
  ],
  bollinger: [
    { text: '위·아래 선 = 평소 움직인 폭', x: 26, y: 88, anchor: 'start', swatch: { color: G.band } },
    { text: '가운데 선 = 20일 평균', x: 26, y: 102, anchor: 'start', swatch: { color: G.bandMid, dashed: true } },
  ],
  supportResistance: [
    { text: '저항 — 자주 막혔던 자리', x: 212, y: 15, anchor: 'end', leader: { x1: 150, y1: 18, x2: 150, y2: 22 } },
    { text: '지지 — 자주 되돌아온 자리', x: 212, y: 82, anchor: 'end', leader: { x1: 150, y1: 74, x2: 150, y2: 64 } },
    { text: '뚫는지 되돌아오는지는 알 수 없어요', x: 110, y: 100, anchor: 'middle' },
  ],
  lrc: [
    { text: '가운데 선 = 최근 20일 회귀선', x: 26, y: 88, anchor: 'start', swatch: { color: G.lrc } },
    { text: '통로 = 그 선에서 흔들린 폭', x: 26, y: 102, anchor: 'start', swatch: { color: G.lrc, dashed: true } },
  ],
  rsi: [
    { text: '70 위 = 오름폭이 컸던 구간', x: 12, y: 88, anchor: 'start' },
    { text: '30 아래 = 내림폭이 컸던 구간', x: 12, y: 102, anchor: 'start' },
  ],
  macd: [
    // ⚠️ '막대 0 위 = 상승 힘'은 쓰지 않는다 — 직전 차수(G1)에서 라이브 helpTexts의
    //    "상승 힘이 강하다는 신호"를 걷어냈다. 같은 말을 그림에 다시 넣으면 회귀다.
    { text: '막대 = 두 선의 차이', x: 12, y: 88, anchor: 'start' },
    { text: '0 위 = 단기 평균이 장기 평균 위', x: 12, y: 102, anchor: 'start' },
  ],
  stochastic: [
    { text: '80 위 = 최근 범위의 위쪽', x: 12, y: 88, anchor: 'start' },
    { text: '20 아래 = 최근 범위의 아래쪽', x: 12, y: 102, anchor: 'start' },
  ],
  volume: [
    { text: '막대 = 그날 거래된 양', x: 26, y: 88, anchor: 'start', swatch: { color: G.band } },
    { text: '주황선 = 20일 평균', x: 26, y: 102, anchor: 'start', swatch: { color: G.amber } },
  ],
};

/** 삽화 `aria-label` — 스크린리더 사용자에게 그림의 정체만 알린다(해석 아님). */
export const ILLUS_ARIA: Record<IndicatorGraphicKey, string> = {
  candle: '캔들 예시 그림',
  sma: '이동평균선 예시 그림',
  bollinger: '볼린저밴드 예시 그림',
  supportResistance: '지지·저항 예시 그림',
  lrc: '회귀채널 예시 그림',
  rsi: 'RSI 예시 그림',
  macd: 'MACD 예시 그림',
  stochastic: '스토캐스틱 예시 그림',
  volume: '거래량 예시 그림',
};

// ── 공용 프리미티브 ──────────────────────────────────────────────────

const L = (points: string, color: string, w = 1.2, dash?: string) => (
  <polyline points={points} fill="none" stroke={color} strokeWidth={w} strokeLinejoin="round"
    strokeLinecap="round" {...(dash ? { strokeDasharray: dash } : {})} />
);

const H = (x1: number, x2: number, y: number, color: string, w = 1, dash?: string) => (
  <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={w} strokeLinecap="round"
    {...(dash ? { strokeDasharray: dash } : {})} />
);

/** 캔들 하나 — 몸통(시가~종가) + 꼬리(최고~최저). 방향색은 여기에만 쓴다. */
const Candle = (x: number, w: number, bodyTop: number, bodyBottom: number, high: number, low: number, up: boolean) => (
  <g key={`c${x}`}>
    <line x1={x + w / 2} y1={high} x2={x + w / 2} y2={low} stroke={up ? G.rise : G.fall} strokeWidth={1.2} />
    <rect x={x} y={bodyTop} width={w} height={bodyBottom - bodyTop} fill={up ? G.rise : G.fall} />
  </g>
);

const Bars = (xs: number[], w: number, base: number, heights: number[], color: string) => (
  <g>
    {xs.map((x, i) => (
      <rect key={x} x={x} y={base - heights[i]} width={w} height={heights[i]} fill={color} rx={0.5} />
    ))}
  </g>
);

/** 0선 위/아래로 뻗는 히스토그램(MACD) — 값 부호에 따라 방향이 갈린다. */
const SignedBars = (xs: number[], w: number, zero: number, values: number[], color: string) => (
  <g>
    {xs.map((x, i) => {
      const v = values[i];
      return <rect key={x} x={x} y={v >= 0 ? zero - v : zero} width={w} height={Math.abs(v)} fill={color} rx={0.5} />;
    })}
  </g>
);

// ── 칩 아이콘 (56×34) ────────────────────────────────────────────────
// 라벨이 바로 옆에 있으므로 `aria-hidden` — 스크린리더가 같은 이름을 두 번 읽지 않게 한다.

const ICON_BODY: Record<IndicatorGraphicKey, ReactElement> = {
  candle: (
    <g>
      {Candle(7, 6, 14, 24, 10, 28, true)}
      {Candle(19, 6, 10, 18, 7, 22, false)}
      {Candle(31, 6, 16, 26, 13, 30, true)}
      {Candle(43, 6, 8, 15, 5, 19, false)}
    </g>
  ),
  sma: (
    <g>
      {L('5,24 15,18 25,20 35,10 50,8', G.rise, 1.4, '3 2')}
      {L('5,20 18,19 30,17 42,14 50,12', G.amber, 1.4)}
    </g>
  ),
  bollinger: (
    <g>
      <path d="M4,9 C18,6 34,12 52,7" fill="none" stroke={G.band} strokeWidth={1.2} />
      <path d="M4,18 C18,18 34,17 52,18" fill="none" stroke={G.bandMid} strokeWidth={1} strokeDasharray="3 2" />
      <path d="M4,27 C18,30 34,22 52,29" fill="none" stroke={G.band} strokeWidth={1.2} />
      {L('6,21 16,13 26,23 36,15 50,19', G.ink, 1.1)}
    </g>
  ),
  supportResistance: (
    <g>
      {H(4, 52, 9, G.muted, 1, '3 2')}
      {H(4, 52, 26, G.muted, 1, '3 2')}
      {L('5,24 13,11 21,25 30,12 39,24 48,14', G.ink, 1.1)}
    </g>
  ),
  lrc: (
    <g>
      {L('4,18 52,4', G.lrc, 1, '3 2')}
      {L('4,24 52,10', G.lrc, 1.5)}
      {L('4,30 52,16', G.lrc, 1, '3 2')}
      {L('6,27 16,21 26,24 36,15 48,12', G.ink, 1.1)}
    </g>
  ),
  rsi: (
    <g>
      {H(4, 52, 10, G.guide, 1, '3 2')}
      {H(4, 52, 24, G.guide, 1, '3 2')}
      {L('4,20 12,8 20,16 28,26 36,14 44,22 52,11', G.ink, 1.4)}
    </g>
  ),
  macd: (
    <g>
      {SignedBars([6, 13, 20, 27, 34, 41, 48], 4, 18, [-6, -3, 2, 6, 8, 4, -2], G.band)}
      {H(4, 52, 18, G.muted, 0.8)}
      {L('8,24 15,21 22,16 29,12 36,9 43,13 50,19', G.ink, 1.4)}
    </g>
  ),
  stochastic: (
    <g>
      {H(4, 52, 8, G.guide, 1, '3 2')}
      {H(4, 52, 26, G.guide, 1, '3 2')}
      {L('4,22 12,16 20,17 30,12 40,15 52,15', G.faint, 1.1)}
      {L('4,24 12,10 20,18 30,7 40,20 52,12', G.ink, 1.4)}
    </g>
  ),
  volume: (
    <g>
      {Bars([5, 11, 17, 23, 29, 35, 41, 47], 4, 30, [8, 14, 6, 20, 10, 24, 12, 16], G.band)}
      {L('4,17 52,15', G.amber, 1.2)}
    </g>
  ),
};

/**
 * 칩용 작은 스케치. 장식이므로 상태(on/off)를 나타내지 않는다.
 *
 * `width="100%"` + height 생략 → viewBox 비율로 높이가 정해진다. 고정 px로 두면 좁은 칩에서
 * 넘치고(경계 넘침 클래스 — 반응형 QA 2차에서 잡은 그 형태), CSS로만 줄이면 찌그러진다.
 */
export const INDICATOR_ICON: Record<IndicatorGraphicKey, ReactElement> = Object.fromEntries(
  GRAPHIC_KEYS.map(k => [k, (
    <svg viewBox="0 0 56 34" width="100%" aria-hidden="true" focusable="false">
      {ICON_BODY[k]}
    </svg>
  )]),
) as Record<IndicatorGraphicKey, ReactElement>;

// ── 팝업 삽화 (220×108) ──────────────────────────────────────────────
// 위 2/3(y 6~74)은 그림, 아래(y 82~106)는 주석. 주석 좌표는 `ILLUS_NOTES`가 소유한다.

const ILLUS_BODY: Record<IndicatorGraphicKey, ReactElement> = {
  candle: (
    <g>
      {Candle(48, 20, 26, 60, 14, 70, true)}
      {Candle(103, 20, 20, 48, 10, 62, false)}
      {Candle(158, 20, 34, 66, 20, 74, true)}
    </g>
  ),
  sma: (
    <g>
      {L('12,54 45,40 78,46 110,28 145,34 178,20 208,24', G.rise, 1.6, '4 3')}
      {L('12,48 45,45 78,43 110,39 145,34 178,29 208,26', G.amber, 1.6)}
    </g>
  ),
  bollinger: (
    <g>
      <path d="M12,22 C60,14 120,30 208,18" fill="none" stroke={G.band} strokeWidth={1.4} />
      <path d="M12,42 C60,40 120,44 208,38" fill="none" stroke={G.bandMid} strokeWidth={1.1} strokeDasharray="4 3" />
      <path d="M12,62 C60,66 120,58 208,58" fill="none" stroke={G.band} strokeWidth={1.4} />
      {L('14,50 40,34 66,54 92,40 118,52 150,34 180,46 206,40', G.ink, 1.3)}
    </g>
  ),
  supportResistance: (
    <g>
      {H(12, 208, 22, G.muted, 1.1, '4 3')}
      {H(12, 208, 64, G.muted, 1.1, '4 3')}
      {L('14,58 40,26 66,60 92,30 120,62 150,28 178,56 206,34', G.ink, 1.3)}
    </g>
  ),
  lrc: (
    <g>
      {L('12,42 208,12', G.lrc, 1.1, '4 3')}
      {L('12,56 208,26', G.lrc, 1.8)}
      {L('12,70 208,40', G.lrc, 1.1, '4 3')}
      {L('14,62 46,50 78,54 110,40 142,44 174,30 206,34', G.ink, 1.3)}
    </g>
  ),
  rsi: (
    <g>
      {H(26, 206, 29, G.guide, 1, '4 3')}
      {H(26, 206, 53, G.guide, 1, '4 3')}
      <text x={21} y={32} fontSize={8} fill={G.faint} textAnchor="end">70</text>
      <text x={21} y={56} fontSize={8} fill={G.faint} textAnchor="end">30</text>
      {L('28,60 52,26 76,44 100,62 124,36 150,50 176,22 204,40', G.ink, 1.6)}
    </g>
  ),
  // 막대 = (시그널선 − 본선) × 2.5. 배율은 도식용이지만 **부호는 두 선의 상하 관계와 정확히
  // 일치**한다 — 주석이 "막대 = 두 선의 차이"라고 말하므로 어긋나면 그림이 거짓을 가르친다.
  macd: (
    <g>
      {SignedBars(
        [16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192], 9, 44,
        [-5, -3, 5, 10, 15, 15, 3, -10, -18, -20, -20, -5], G.guide,
      )}
      {H(12, 208, 44, G.muted, 0.9)}
      <text x={5} y={47} fontSize={8} fill={G.faint}>0</text>
      {L('20,60 36,57 52,54 68,48 84,41 100,34 116,31 132,32 148,37 164,44 180,50 196,54', G.faint, 1.3)}
      {L('20,62 36,58 52,52 68,44 84,35 100,28 116,30 132,36 148,44 164,52 180,58 196,56', G.ink, 1.8)}
    </g>
  ),
  stochastic: (
    <g>
      {H(26, 206, 24, G.guide, 1, '4 3')}
      {H(26, 206, 58, G.guide, 1, '4 3')}
      <text x={21} y={27} fontSize={8} fill={G.faint} textAnchor="end">80</text>
      <text x={21} y={61} fontSize={8} fill={G.faint} textAnchor="end">20</text>
      {L('28,54 52,40 76,34 100,46 124,44 150,42 176,32 204,30', G.faint, 1.2)}
      {L('28,60 52,20 76,40 100,64 124,30 150,52 176,18 204,36', G.ink, 1.6)}
    </g>
  ),
  volume: (
    <g>
      {Bars(
        [16, 31, 46, 61, 76, 91, 106, 121, 136, 151, 166, 181, 196], 9, 70,
        [18, 30, 12, 44, 22, 52, 26, 36, 16, 40, 28, 20, 34], G.band,
      )}
      {L('12,42 208,40', G.amber, 1.4)}
    </g>
  ),
};

const Notes = ({ k }: { k: IndicatorGraphicKey }) => (
  <g>
    {ILLUS_NOTES[k].map(n => (
      <g key={n.text}>
        {/* 지시선은 `grid`(#E7E7E3)면 inset 배경에서 사실상 보이지 않는다 → `guide`로. */}
        {n.leader && (
          <line x1={n.leader.x1} y1={n.leader.y1} x2={n.leader.x2} y2={n.leader.y2}
            stroke={G.guide} strokeWidth={0.9} />
        )}
        {n.swatch && (
          <line x1={n.x - 16} y1={n.y - 3} x2={n.x - 4} y2={n.y - 3}
            stroke={n.swatch.color} strokeWidth={1.6} strokeLinecap="round"
            {...(n.swatch.dashed ? { strokeDasharray: '3 2' } : {})} />
        )}
        <text x={n.x} y={n.y} fontSize={9.5} fill={G.muted} textAnchor={n.anchor || 'start'}>{n.text}</text>
      </g>
    ))}
  </g>
);

/** 팝업용 주석 있는 미니 차트. 그림의 정체만 알리는 `aria-label`을 갖는다. */
export const INDICATOR_ILLUS: Record<IndicatorGraphicKey, ReactElement> = Object.fromEntries(
  GRAPHIC_KEYS.map(k => [k, (
    <svg viewBox="0 0 220 108" width="100%" role="img" aria-label={ILLUS_ARIA[k]}>
      {ILLUS_BODY[k]}
      <Notes k={k} />
    </svg>
  )]),
) as Record<IndicatorGraphicKey, ReactElement>;
