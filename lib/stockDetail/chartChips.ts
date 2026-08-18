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
