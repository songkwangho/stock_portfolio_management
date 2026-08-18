'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { stockApi } from '@/lib/stockApi';
import { helpTexts } from '@/lib/stockDetail/helpTexts';
import { toBars, smaSeries, volumeSeries, formatPriceAxis, formatVolumeAxis } from '@/lib/stockDetail/chartSeries';
import type { StockDetail, HistoryEntry, SignalResult } from '@/types/stock';
import type { SubPanelSpec, MarkerSpec, LineSpec } from '@/components/charts/LwcChart';

// Phase 1 — Recharts → lightweight-charts 전환(로드맵 Sprint 3 [M2]).
// 캔들이 되살아났다: Recharts 커스텀 shape의 wick 좌표 버그로 3.5차부터 막혀 있던 것.
//
// 동등 재현 대상(회귀 금지): 일/주/월봉 토글 · SMA5·20 · 골든/데드크로스 마커 · 거래량 바 ·
// 거래량 흐름 한 줄 해석 · 이평선 보는 법 안내.
const LwcChart = dynamic(() => import('@/components/charts/LwcChart'), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full flex items-center justify-center text-xs text-faint">차트를 불러오는 중이에요...</div>
  ),
});

interface ChartSectionProps {
  code: string;
  stockDetail: StockDetail;
  signals: SignalResult | null;   // signals.markers(최근 20일 크로스)로 마커 렌더
}

export default function ChartSection({ code, stockDetail, signals }: ChartSectionProps) {
  const [chartTimeframe, setChartTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [extraChartData, setExtraChartData] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (chartTimeframe !== 'daily') {
      stockApi.getChartData(code, chartTimeframe as 'weekly' | 'monthly')
        .then(setExtraChartData).catch(() => setExtraChartData([]));
    }
  }, [chartTimeframe, code]);

  const historyData = chartTimeframe === 'daily' ? (stockDetail.history || []) : extraChartData;

  const bars = useMemo(() => toBars(historyData), [historyData]);

  const lines = useMemo<LineSpec[]>(() => {
    if (bars.length === 0) return [];
    return [
      { key: 'sma5', data: smaSeries(bars, 5), color: '#D91C1C', lineWidth: 1, dashed: true },
      { key: 'sma20', data: smaSeries(bars, 20), color: '#9A5B08', lineWidth: 1, dashed: true },
    ];
  }, [bars]);

  // 마커는 signals.markers(최근 20일 크로스). 주봉/월봉에선 날짜가 봉과 안 맞아 조용히 빠진다.
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

  const subPanels = useMemo<SubPanelSpec[]>(() => {
    if (bars.length === 0) return [];
    return [{
      key: 'volume',
      label: '거래량',
      heightClass: 'h-24',
      series: [{ kind: 'histogram', key: 'vol', data: volumeSeries(bars), color: '#85878D40' }],
      valueFormatter: formatVolumeAxis,
    }];
  }, [bars]);

  // 초기 표시 봉 수 — lightweight-charts는 스크롤·확대가 되므로 전 구간을 넘기고 뷰포트만 잡는다.
  // (기존 Recharts는 데이터 자체를 20/12개로 잘라 과거를 볼 방법이 없었다.)
  const initialBars = chartTimeframe === 'monthly' ? 24 : chartTimeframe === 'weekly' ? 40 : 60;

  // 거래량 흐름 한 줄 해석 (3.11차, 관찰형) — 기존 로직 보존
  const volumeNote = useMemo(() => {
    if (bars.length < 5) return null;
    const window = bars.slice(-20);
    const avg20 = window.reduce((a, b) => a + b.volume, 0) / window.length;
    const latest = bars[bars.length - 1].volume;
    const ratio = avg20 > 0 ? latest / avg20 : 1;
    if (ratio >= 2) return '최근 거래량이 평소의 2배 이상이에요. 관심이 크게 늘었어요.';
    if (ratio >= 1.3) return '거래량이 평소보다 늘고 있어요.';
    if (ratio <= 0.5) return '거래량이 평소보다 줄었어요. 관심이 식은 편이에요.';
    return '거래량은 평소 수준이에요.';
  }, [bars]);

  return (
    <div className="bg-surface p-6 rounded-xl border border-line">
      <h3 className="text-lg font-semibold text-ink mb-2 flex items-center justify-between">
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

      <div className="bg-inset border border-line rounded-xl p-3 mb-4 text-xs text-muted leading-relaxed">
        <p className="font-bold mb-1 text-ink">캔들·이평선 보는 법</p>
        <p>
          <span className="text-rise font-bold">빨간 봉</span>=오른 날 ·
          <span className="text-fall font-bold"> 파란 봉</span>=내린 날 (몸통=시가~종가, 꼬리=고가·저가). <br />
          <span className="text-rise font-bold">빨간 점선</span>(5일 평균, 단기) /
          <span className="text-caution font-bold"> 주황 점선</span>(20일 평균, 중기).
          주가 &gt; 5일선 = 최근 5일 평균보다 위 · 5일선 &gt; 20일선 = 정배열(단기선이 중기선 위).
        </p>
      </div>

      {bars.length === 0 ? (
        <div className="h-72 w-full flex items-center justify-center text-xs text-faint">
          차트를 그릴 데이터가 아직 부족해요.
        </div>
      ) : (
        <LwcChart
          bars={bars}
          lines={lines}
          markers={markers}
          subPanels={subPanels}
          initialBars={initialBars}
          priceFormatter={formatPriceAxis}
        />
      )}

      {markers.length > 0 && (
        <div className="flex items-center gap-3 mt-2 text-xs text-faint">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rise" /> 골든크로스</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fall" /> 데드크로스</span>
        </div>
      )}

      <div className="bg-inset border border-line rounded-xl p-3 mt-4 text-xs text-muted leading-relaxed">
        {helpTexts.volume}
      </div>
      {volumeNote && <p className="text-xs text-muted mt-2 leading-relaxed">{volumeNote}</p>}
    </div>
  );
}
