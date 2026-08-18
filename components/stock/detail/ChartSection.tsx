'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { stockApi } from '@/lib/stockApi';
import { toBars, smaSeries, volumeSeries, formatPriceAxis, formatVolumeAxis } from '@/lib/stockDetail/chartSeries';
import {
  rsiSeries, macdSeries, bollingerSeries, stochasticSeries,
  regressionChannel, pivotLevels, volumeMaSeries,
} from '@/lib/stockDetail/indicatorSeries';
import { CHIPS, DEFAULT_ON, MOBILE_PANEL_LIMIT, chartNotices, NOTICE_EMPTY, type ChipKey } from '@/lib/stockDetail/chartChips';
import type { StockDetail, HistoryEntry, SignalResult } from '@/types/stock';
import type { HelpTermKey } from '@/components/ui/HelpBottomSheet';
import type { SubPanelSpec, MarkerSpec, LineSpec, PriceLineSpec } from '@/components/charts/LwcChart';

// Phase 1 — Recharts → lightweight-charts(로드맵 [M2]·[M1]).
// Phase 2 — 지표 칩 토글 9종 + 오버레이 + 읽는 법 팝업 + "지금 눈에 띄는 것" 배너.
//
// 원칙: 지표를 더 넣는 게 해법이 아니라 **그려주고 + 읽는 법을 가르치는 것**이다.
// 모든 설명은 관찰형·비예측 — Phase 4가 기술·추세 지표의 방향 예측력 없음을 실증했다.
const LwcChart = dynamic(() => import('@/components/charts/LwcChart'), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full flex items-center justify-center text-xs text-faint">차트를 불러오는 중이에요...</div>
  ),
});

// 지표선은 **무채색/보조색**만. 방향색(rise/fall)은 캔들·가격·거래량 봉에만(3.13 VIS-2/3).
const C = {
  sma5: '#D91C1C', sma20: '#9A5B08', sma60: '#6E7076',
  band: '#A8AAA5', bandMid: '#6E7076',
  lrc: '#85878D',
  level: '#6E7076',
  ind: '#17181C', ind2: '#A8AAA5',
  guide: '#C9CAC6',
  volMa: '#9A5B08',
};

interface ChartSectionProps {
  code: string;
  stockDetail: StockDetail;
  signals: SignalResult | null;
  onHelp: (t: HelpTermKey) => void;
}

export default function ChartSection({ code, stockDetail, signals, onHelp }: ChartSectionProps) {
  const [chartTimeframe, setChartTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [extraChartData, setExtraChartData] = useState<HistoryEntry[]>([]);
  const [dailyData, setDailyData] = useState<HistoryEntry[] | null>(null);
  const [on, setOn] = useState<Set<ChipKey>>(new Set(DEFAULT_ON));

  // 일봉은 별도 조회로 **250행**을 받는다 — `/stock/:code`의 history는 40행이라
  // 60일선·MACD(26봉)를 그릴 수 없다. 구 서버(배포 순서 어긋남)에선 404 → 40행 폴백.
  useEffect(() => {
    let alive = true;
    stockApi.getDailyHistory(code)
      .then(d => { if (alive) setDailyData(Array.isArray(d) && d.length ? d : null); })
      .catch(() => { if (alive) setDailyData(null); });
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    if (chartTimeframe !== 'daily') {
      stockApi.getChartData(code, chartTimeframe as 'weekly' | 'monthly')
        .then(setExtraChartData).catch(() => setExtraChartData([]));
    }
  }, [chartTimeframe, code]);

  const historyData = chartTimeframe === 'daily'
    ? (dailyData || stockDetail.history || [])
    : extraChartData;

  const bars = useMemo(() => toBars(historyData), [historyData]);

  const toggle = (k: ChipKey) => setOn(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // ── 메인 오버레이 ────────────────────────────────────────────
  const lines = useMemo<LineSpec[]>(() => {
    if (bars.length === 0) return [];
    const out: LineSpec[] = [];
    if (on.has('ma')) {
      out.push({ key: 'sma5', data: smaSeries(bars, 5), color: C.sma5, lineWidth: 1, dashed: true });
      out.push({ key: 'sma20', data: smaSeries(bars, 20), color: C.sma20, lineWidth: 1, dashed: true });
      const s60 = smaSeries(bars, 60);
      // 60일선은 표본이 60봉 미만이면 점이 없다 — 빈 시리즈를 넣으면 범례만 생긴다.
      if (s60.length) out.push({ key: 'sma60', data: s60, color: C.sma60, lineWidth: 1 });
    }
    if (on.has('bollinger')) {
      const b = bollingerSeries(bars);
      if (b.upper.length) {
        out.push({ key: 'bbU', data: b.upper, color: C.band, lineWidth: 1 });
        // ⚠️ 볼린저 중심선은 **20일 SMA와 같은 값**이다(둘 다 최근 20개 종가 평균을 Math.round).
        //    이동평균선 칩이 켜져 있으면 같은 선을 색만 달리해 두 번 그리는 셈이라 — 사용자에겐
        //    서로 다른 두 지표처럼 보인다. 이평선이 켜져 있으면 중심선을 생략한다.
        if (!on.has('ma')) out.push({ key: 'bbM', data: b.middle, color: C.bandMid, lineWidth: 1, dashed: true });
        out.push({ key: 'bbL', data: b.lower, color: C.band, lineWidth: 1 });
      }
    }
    if (on.has('lrc')) {
      const r = regressionChannel(bars, 20);
      if (r.mid.length) {
        out.push({ key: 'lrcU', data: r.upper, color: C.lrc, lineWidth: 1 });
        out.push({ key: 'lrcM', data: r.mid, color: C.lrc, lineWidth: 2 });
        out.push({ key: 'lrcL', data: r.lower, color: C.lrc, lineWidth: 1 });
      }
    }
    return out;
  }, [bars, on]);

  const priceLines = useMemo<PriceLineSpec[]>(() => {
    if (!on.has('supportResistance') || bars.length === 0) return [];
    const p = pivotLevels(bars);
    const out: PriceLineSpec[] = [];
    if (p.resistance != null) out.push({ price: p.resistance, color: C.level, title: '저항' });
    if (p.support != null) out.push({ price: p.support, color: C.level, title: '지지' });
    return out;
  }, [bars, on]);

  const barTimes = useMemo(() => new Set(bars.map(b => b.time)), [bars]);
  const markers = useMemo<MarkerSpec[]>(() => {
    const out: MarkerSpec[] = [];
    for (const m of signals?.markers || []) {
      const iso = `${m.date.slice(0, 4)}-${m.date.slice(4, 6)}-${m.date.slice(6, 8)}`;
      if (!barTimes.has(iso)) continue;
      out.push({ time: iso, color: m.type === 'golden' ? '#D91C1C' : '#1B5FD0' });
    }
    return out;
  }, [signals, barTimes]);

  // ── 서브패널 ─────────────────────────────────────────────────
  const subPanels = useMemo<SubPanelSpec[]>(() => {
    if (bars.length === 0) return [];
    const out: SubPanelSpec[] = [];
    if (on.has('volume')) {
      const series: SubPanelSpec['series'] = [{ kind: 'histogram', key: 'vol', data: volumeSeries(bars), color: '#85878D40' }];
      const ma = volumeMaSeries(bars, 20);
      // 주황선 = 20일 평균. 배너의 "평소의 N배"와 같은 창을 쓴다.
      if (ma.length) series.push({ kind: 'line', key: 'volMa', data: ma, color: C.volMa, lineWidth: 1, lastValueVisible: false });
      out.push({ key: 'volume', label: '거래량 (주황선 = 20일 평균)', heightClass: 'h-24', series, valueFormatter: formatVolumeAxis });
    }
    if (on.has('rsi')) {
      const r = rsiSeries(bars);
      if (r.length) out.push({
        key: 'rsi', label: 'RSI (14)', heightClass: 'h-24',
        series: [{ kind: 'line', key: 'rsi', data: r, color: C.ind, lineWidth: 2 }],
        guides: [{ value: 70, color: C.guide }, { value: 30, color: C.guide }],
        fixedRange: { min: 0, max: 100 },
        valueFormatter: (v) => v.toFixed(0),
      });
    }
    if (on.has('macd')) {
      const m = macdSeries(bars);
      if (m.macd.length) out.push({
        key: 'macd', label: 'MACD (12, 26, 9)', heightClass: 'h-24',
        series: [
          { kind: 'histogram', key: 'macdHist', data: m.histogram, color: C.ind2 },
          { kind: 'line', key: 'macdLine', data: m.macd, color: C.ind, lineWidth: 2 },
          { kind: 'line', key: 'macdSignal', data: m.signal, color: C.ind2, lineWidth: 1 },
        ],
        guides: [{ value: 0, color: C.guide }],
      });
    }
    if (on.has('stochastic')) {
      const s = stochasticSeries(bars);
      if (s.k.length) out.push({
        key: 'stoch', label: '스토캐스틱 (%K 14, %D 3)', heightClass: 'h-24',
        series: [
          { kind: 'line', key: 'stochK', data: s.k, color: C.ind, lineWidth: 2 },
          { kind: 'line', key: 'stochD', data: s.d, color: C.ind2, lineWidth: 1 },
        ],
        guides: [{ value: 80, color: C.guide }, { value: 20, color: C.guide }],
        fixedRange: { min: 0, max: 100 },
        valueFormatter: (v) => v.toFixed(0),
      });
    }
    return out;
  }, [bars, on]);

  // 모바일 동시 서브패널 상한 — 넘으면 세로가 끝없이 길어진다(§4-4).
  // PC는 제한 없음. 초과분은 잘라내고 안내를 띄운다(조용히 사라지면 칩이 고장 난 것처럼 보인다).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const shownPanels = isMobile ? subPanels.slice(0, MOBILE_PANEL_LIMIT) : subPanels;
  const hiddenPanelCount = subPanels.length - shownPanels.length;

  const initialBars = chartTimeframe === 'monthly' ? 24 : chartTimeframe === 'weekly' ? 40 : 60;
  const notices = useMemo(() => chartNotices(bars), [bars]);

  return (
    <div className="bg-surface p-6 rounded-xl border border-line">
      <h3 className="text-lg font-semibold text-ink mb-3 flex items-center justify-between">
        <span>주가 차트</span>
        <div className="flex items-center space-x-1">
          {(['daily', 'weekly', 'monthly'] as const).map(tf => (
            <button key={tf} onClick={() => setChartTimeframe(tf)}
              className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-bold transition-colors ${
                chartTimeframe === tf ? 'bg-ink text-surface' : 'bg-inset text-muted hover:text-ink'
              }`}>
              {tf === 'daily' ? '일봉' : tf === 'weekly' ? '주봉' : '월봉'}
            </button>
          ))}
        </div>
      </h3>

      {/* 지금 눈에 띄는 것 — 관찰 사실만. 방향 단정 없음. */}
      <div className="bg-inset border border-line rounded-xl p-3 mb-3">
        <p className="text-xs font-bold text-ink mb-1">지금 눈에 띄는 것</p>
        {notices.length === 0 ? (
          <p className="text-xs text-muted">{NOTICE_EMPTY}</p>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {notices.map(n => <li key={n.key} className="text-xs text-muted">· {n.text}</li>)}
          </ul>
        )}
      </div>

      {/* 지표 칩 — 칩 본체 = 그리기 토글, [?] = 읽는 법 팝업 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CHIPS.map(chip => {
          const active = on.has(chip.key);
          return (
            <span key={chip.key}
              className={`inline-flex items-center rounded-lg border text-xs font-bold transition-colors ${
                active ? 'bg-ink text-surface border-ink' : 'bg-inset text-muted border-line'
              }`}>
              <button onClick={() => toggle(chip.key)}
                className="pl-3 pr-1.5 py-2 min-h-[36px]"
                aria-pressed={active}
                aria-label={`${chip.label} ${active ? '숨기기' : '표시'}`}>
                {chip.label}
              </button>
              <button onClick={() => onHelp(chip.help)}
                className={`pr-2.5 pl-1 py-2 min-h-[36px] ${active ? 'text-surface/70 hover:text-surface' : 'text-faint hover:text-ink'}`}
                aria-label={`${chip.label} 읽는 법`}>
                [?]
              </button>
            </span>
          );
        })}
      </div>

      {bars.length === 0 ? (
        <div className="h-72 w-full flex items-center justify-center text-xs text-faint">
          차트를 그릴 데이터가 아직 부족해요.
        </div>
      ) : (
        <LwcChart
          bars={bars}
          showCandles={on.has('candle')}
          lines={lines}
          priceLines={priceLines}
          markers={markers}
          subPanels={shownPanels}
          initialBars={initialBars}
          priceFormatter={formatPriceAxis}
        />
      )}

      {hiddenPanelCount > 0 && (
        <p className="text-xs text-faint mt-2">
          작은 화면에서는 아래 칸을 {MOBILE_PANEL_LIMIT}개까지만 보여드려요. {hiddenPanelCount}개는 다른 지표를 끄면 나타나요.
        </p>
      )}

      {markers.length > 0 && (
        <div className="flex items-center gap-3 mt-2 text-xs text-faint">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rise" /> 골든크로스</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fall" /> 데드크로스</span>
        </div>
      )}

      <p className="text-xs text-faint mt-3 leading-relaxed">
        칩을 눌러 차트에 그리거나 지울 수 있어요. 각 칩의 [?]를 누르면 그 지표를 읽는 법이 나와요.
        <br />
        ⚠️ 어떤 지표도 앞으로의 방향을 맞히지 못해요. 이 앱이 3년 데이터로 확인한 결과예요.
      </p>
    </div>
  );
}
