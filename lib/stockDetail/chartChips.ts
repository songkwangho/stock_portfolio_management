// 차트 지표 칩 + "지금 눈에 띄는 것" 배너 — **순수 모듈**(테스트·금지어 스윕 대상).
//
// 원칙: 배너는 **사건성 사실만 나열**한다. 방향 단정("곧 오를/내릴") 금지.
// Phase 4가 기술·추세 지표의 방향 예측력 없음을 실증했고(기술 IC≈0, 추세 역방향),
// 반면 **사건성**(|수익률|)은 유효했다 → "지금 눈에 띄는 것"은 관찰로서 성립한다.
// 역할은 판단이 아니라 **시선을 관련 오버레이로 안내**하는 것.
import type { HelpTermKey } from '@/components/ui/HelpBottomSheet';
import type { Bar } from './chartSeries';
import { bollingerSeries } from './indicatorSeries';

export type ChipKey =
  | 'candle' | 'ma' | 'bollinger' | 'supportResistance' | 'lrc'
  | 'rsi' | 'macd' | 'stochastic' | 'volume';

export type Chip = {
  key: ChipKey;
  label: string;
  help: HelpTermKey;
  /** 초기 on — "심플하게 두고 스스로 켜보며 익힌다"(운영자 결정) */
  defaultOn: boolean;
  /** 아래 칸(서브패널)을 차지하는가 — 모바일 동시 개수 제한 대상 */
  panel: boolean;
};

export const CHIPS: Chip[] = [
  { key: 'candle', label: '캔들', help: 'candle', defaultOn: true, panel: false },
  { key: 'ma', label: '이동평균선', help: 'sma', defaultOn: true, panel: false },
  { key: 'bollinger', label: '볼린저밴드', help: 'bollinger', defaultOn: true, panel: false },
  { key: 'supportResistance', label: '지지·저항', help: 'supportResistance', defaultOn: false, panel: false },
  { key: 'lrc', label: '회귀채널', help: 'lrc', defaultOn: false, panel: false },
  { key: 'rsi', label: 'RSI', help: 'rsi', defaultOn: false, panel: true },
  { key: 'macd', label: 'MACD', help: 'macd', defaultOn: false, panel: true },
  { key: 'stochastic', label: '스토캐스틱', help: 'stochastic', defaultOn: false, panel: true },
  { key: 'volume', label: '거래량', help: 'volume', defaultOn: true, panel: true },
];

export const DEFAULT_ON: ChipKey[] = CHIPS.filter(c => c.defaultOn).map(c => c.key);

/** 모바일에서 동시에 펼칠 서브패널 상한 — 넘으면 세로가 끝없이 길어진다(§4-4). */
export const MOBILE_PANEL_LIMIT = 2;

// ── 표본 문턱 ─────────────────────────────────────────────────────
// 최근 상장·확대적재 종목은 히스토리가 짧아 일부 지표가 아예 계산되지 않는다.
// 아래 값은 **실제 계산 함수의 문턱과 테스트로 묶여 있다**(각 지표에서 n−1봉이면 빈 배열,
// n봉이면 점이 생기는지 직접 검사) — 문구의 숫자와 그림의 조건이 갈리면 안내가 거짓이 된다.

/** 메인 오버레이 문턱. 미달이면 선도, 범례 표식도 생기지 않는다("그린 것 == 범례"). */
export const OVERLAY_MIN_BARS = { sma5: 5, sma20: 20, sma60: 60, bollinger: 20, lrc: 20 } as const;

/**
 * 서브패널 문턱 — 미달 + 칩 on이면 빈 칸 대신 안내를 띄운다.
 *
 * ⚠️ 값은 "패널에 **뭐라도** 그려지는 최소 표본"이다. 두 선으로 된 지표는 주선이 먼저 나오고
 *    보조선이 늦게 붙는다(MACD 시그널 +8봉 · 스토캐스틱 %D +2봉) → 그 사이 구간은 안내가
 *    아니라 **라벨**로 처리한다. 여기에 보조선 문턱(예: 스토캐스틱 16)을 적으면, 14봉 종목에서
 *    실제로는 %K가 그려지는데 "16거래일이 필요해요"라고 말하는 거짓 안내가 된다.
 */
export const PANEL_MIN_BARS = { rsi: 15, macd: 26, stochastic: 14 } as const;

/** MACD 시그널선(=macdLine의 SMA9)은 macd 점 9개가 필요해 본선보다 8봉 늦다. */
export const MACD_SIGNAL_MIN_BARS = 34;

/** 스토캐스틱 %D(=%K의 SMA3)는 %K보다 2봉 늦다. */
export const STOCH_D_MIN_BARS = 16;

/** 거래량 20일 평균선 — 미달이면 서브패널 라벨에서 "주황선 = 20일 평균"을 빼야 한다. */
export const VOLUME_MA_MIN_BARS = 20;

export type PanelIndicatorKey = keyof typeof PANEL_MIN_BARS;

// 조사는 규칙으로 못 정한다(RSI·MACD는 알파벳 읽기라 발음 기준) → 주어를 그대로 적는다.
// D차에서 종목명 뒤 조사를 회피한 것과 같은 판단.
const PANEL_SUBJECT: Record<PanelIndicatorKey, string> = {
  rsi: 'RSI는', macd: 'MACD는', stochastic: '스토캐스틱은',
};

/**
 * 서브패널 지표가 표본 부족으로 계산되지 않을 때의 안내.
 *
 * 칩은 끄지 않는다(켜보고 안내를 보는 흐름 유지) — 대신 빈 칸에 이 문구가 들어간다.
 * 사실만: 필요한 거래일 수 + 현재 보유한 거래일 수. 판단·예측어 없음.
 */
export function panelSampleNotice(key: PanelIndicatorKey, barCount: number): string {
  return `${PANEL_SUBJECT[key]} 최소 ${PANEL_MIN_BARS[key]}거래일이 필요해요. `
    + `지금은 ${barCount}거래일치 데이터만 있어 아직 그릴 수 없어요.`;
}

/** 범례 라벨 — 컴포넌트가 이 상수를 쓴다(문구가 금지어 스윕 밖으로 새지 않게). */
export const OVERLAY_LEGEND = {
  sma5: '5일선', sma20: '20일선', sma60: '60일선',
  bollinger: '볼린저밴드', bollingerMid: '볼린저 중심선', lrc: '회귀채널',
} as const;

/**
 * 서브패널 라벨. 보조선이 아직 없는 상태의 라벨을 **따로 둔다** — 하나의 라벨로
 * "(12, 26, 9)"를 항상 띄우면 시그널선이 없는 26~33봉 구간에서 없는 선을 설명하게 된다.
 */
export const PANEL_LABEL = {
  volume: '거래량 (주황선 = 20일 평균)',
  volumeNoMa: '거래량',
  rsi: 'RSI (14)',
  macd: 'MACD (12, 26, 9)',
  macdNoSignal: `MACD (12, 26) · 시그널선은 ${MACD_SIGNAL_MIN_BARS}거래일부터 그려요`,
  stochastic: '스토캐스틱 (%K 14, %D 3)',
  stochasticNoD: `스토캐스틱 (%K 14) · %D는 ${STOCH_D_MIN_BARS}거래일부터 그려요`,
} as const;

export type ChartNotice = { key: string; text: string };

/**
 * "지금 눈에 띄는 것" — 이미 있는 데이터로 만드는 **관찰 사실**만.
 *
 * 세 축(전부 사실, 방향 단정 없음):
 *   · 거래량 vs 20일 평균 배수  · 볼린저 밴드 안 위치  · 최근 5거래일 변동폭
 *
 * 없으면 빈 배열 → 호출부가 "특별히 눈에 띄는 신호가 없어요"를 띄운다.
 */
export function chartNotices(bars: Bar[]): ChartNotice[] {
  const out: ChartNotice[] = [];
  if (bars.length < 6) return out;
  const last = bars[bars.length - 1];

  // ① 거래량 — 배너의 배수와 거래량 평균선이 **같은 창(20)** 을 쓴다(두 표면이 어긋나면 안 된다).
  const volWindow = bars.slice(-20);
  const avgVol = volWindow.reduce((a, b) => a + b.volume, 0) / volWindow.length;
  if (avgVol > 0) {
    const ratio = last.volume / avgVol;
    if (ratio >= 2) out.push({ key: 'volume', text: `거래량이 평소의 ${ratio.toFixed(1)}배예요` });
    else if (ratio >= 1.3) out.push({ key: 'volume', text: '거래량이 평소보다 늘었어요' });
    else if (ratio <= 0.5) out.push({ key: 'volume', text: '거래량이 평소보다 줄었어요' });
  }

  // ② 볼린저 밴드 안 위치 — 상/하단 근처만 말한다(중간은 눈에 띄는 사실이 아니다).
  const bb = bollingerSeries(bars);
  const u = bb.upper[bb.upper.length - 1], l = bb.lower[bb.lower.length - 1];
  if (u && l && u.value > l.value) {
    const pctB = ((last.close - l.value) / (u.value - l.value)) * 100;
    if (pctB >= 80) out.push({ key: 'bollinger', text: '볼린저밴드 위쪽 선 근처에 있어요' });
    else if (pctB <= 20) out.push({ key: 'bollinger', text: '볼린저밴드 아래쪽 선 근처에 있어요' });
  }

  // ③ 최근 5거래일 변동폭 — 부호는 붙이되 "그래서 어떻다"는 말을 붙이지 않는다.
  if (bars.length >= 6) {
    const base = bars[bars.length - 6].close;
    if (base > 0) {
      const chg = ((last.close - base) / base) * 100;
      if (Math.abs(chg) >= 5) {
        out.push({ key: 'move', text: `최근 5거래일 ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%로 움직였어요` });
      }
    }
  }

  return out;
}

export const NOTICE_EMPTY = '지금은 특별히 눈에 띄는 신호가 없어요.';
