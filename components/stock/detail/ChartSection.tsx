'use client';

import { useState, useEffect } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, ReferenceDot,
} from 'recharts';
import { stockApi } from '@/lib/stockApi';
import { helpTexts } from '@/lib/stockDetail/helpTexts';
import type { StockDetail, ChartDataPoint, HistoryEntry, SignalResult } from '@/types/stock';

// 주가 라인+SMA+크로스 마커 + 거래량 바 + 흐름 해석 (3.12차 S5 통합 추출).
// chartTimeframe·extraChartData·chartData·volumeData 전부 내부 지역화.
// ⚠️ Recharts 제약: h-72/h-24 래퍼 보존(#1), ReferenceDot은 ComposedChart 직속(#2).
interface ChartSectionProps {
  code: string;
  stockDetail: StockDetail;
  signals: SignalResult | null;   // signals.markers(최근 20일 크로스)로 마커 렌더
}

export default function ChartSection({ code, stockDetail, signals }: ChartSectionProps) {
  const [chartTimeframe, setChartTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [extraChartData, setExtraChartData] = useState<HistoryEntry[]>([]);

  // Fetch weekly/monthly chart data when timeframe changes
  useEffect(() => {
    if (chartTimeframe !== 'daily') {
      stockApi.getChartData(code, chartTimeframe as 'weekly' | 'monthly')
        .then(setExtraChartData).catch(() => setExtraChartData([]));
    }
  }, [chartTimeframe, code]);

  const historyData = chartTimeframe === 'daily'
    ? (stockDetail.history || [])
    : extraChartData;

  const fullChartData: ChartDataPoint[] = historyData.map((d, i, arr) => {
    const sma5 = i >= 4 ? Math.round(arr.slice(i - 4, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 5) : null;
    const sma20 = i >= 19 ? Math.round(arr.slice(i - 19, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 20) : null;
    const formatDate = chartTimeframe === 'monthly'
      ? d.date.slice(2, 4) + '/' + d.date.slice(4, 6)
      : d.date.slice(4, 6) + '/' + d.date.slice(6, 8);
    return {
      name: formatDate,
      rawDate: d.date,   // 신호 마커 매칭용 원본 날짜 보존
      price: d.price,
      open: d.open,
      high: d.high,
      low: d.low,
      volume: d.volume,
      sma5,
      sma20,
    };
  });

  const sliceCount = chartTimeframe === 'monthly' ? 12 : 20;
  const chartData = fullChartData.slice(-sliceCount);

  // Volume chart data with color
  const volumeData = chartData.map(d => ({
    name: d.name,
    volume: d.volume || 0,
    isUp: (d.price || 0) >= (d.open || 0),
  }));

  // Candlestick: bar chart with custom shape — min/max for Y axis
  const allPrices = chartData.flatMap(d => [d.open || 0, d.high || 0, d.low || 0, d.price || 0]).filter(p => p > 0);
  const priceMin = Math.min(...allPrices) * 0.98;
  const priceMax = Math.max(...allPrices) * 1.02;

  // 3.12차 S5 — 마커는 signals.markers(최근 20일 크로스 전체)로 렌더. 주봉/월봉에선 rawDate 불일치로 조용히 미표시.
  const visibleMarkers = (signals?.markers || []).filter(m => chartData.some(d => d.rawDate === m.date));

  return (
    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
      <h3 className="text-lg font-semibold mb-2 flex items-center justify-between">
        <span>주가 차트</span>
        <div className="flex items-center space-x-1">
          {/* 캔들 차트 토글: Recharts 커스텀 shape의 wick 좌표 버그로 비활성.
              Sprint 3 [M2] lightweight-charts 전환 시 재도입 예정. */}
          {(['daily', 'weekly', 'monthly'] as const).map(tf => (
            <button key={tf} onClick={() => setChartTimeframe(tf)}
              className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-bold transition-colors ${
                chartTimeframe === tf ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}>
              {tf === 'daily' ? '일봉' : tf === 'weekly' ? '주봉' : '월봉'}
            </button>
          ))}
        </div>
      </h3>
      {/* 16차 5-6: SMA 의미를 한 줄로 더 구체적으로 설명 — 초보자가 "평균선"의 의미와 해석 규칙을 모르는 경우 대비 */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-4 text-xs text-blue-300 leading-relaxed">
        <p className="font-bold mb-1">💡 이평선(이동평균선) 보는 법</p>
        <p>
          <span className="text-blue-400 font-bold">파란선</span>(5일 평균, 단기 흐름) /
          <span className="text-yellow-400 font-bold"> 노란선</span>(20일 평균, 중기 흐름). <br />
          주가 &gt; 파란선 = 단기 상승 흐름 · 파란선 &gt; 노란선 = 정배열(긍정적 추세).
        </p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[priceMin, priceMax]} tickFormatter={(v) => `₩${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
              formatter={((value: unknown, name: unknown) => {
                const labels: Record<string, string> = { price: '종가', open: '시가', high: '고가', low: '저가', sma5: '5일 평균', sma20: '20일 평균' };
                const n = (name as string) || '';
                const v = typeof value === 'number' ? value : null;
                return [`₩${v?.toLocaleString() || '---'}`, labels[n] || n];
              }) as never} />
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="price" name="종가" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sma5" name="5일 평균" stroke="#10b981" strokeWidth={1} dot={false} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="sma20" name="20일 평균" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            {/* 3.12차 S5 — 최근 20일 골든/데드크로스 마커. rawDate로 매칭, 보이는 구간 밖이면 미표시. */}
            {visibleMarkers.map(m => {
              const idx = chartData.findIndex(d => d.rawDate === m.date);
              if (idx < 0) return null;
              return (
                <ReferenceDot key={`${m.date}-${m.type}`} x={chartData[idx].name} y={chartData[idx].price}
                  r={5} fill={m.type === 'golden' ? '#10b981' : '#ef4444'}
                  stroke="#0f172a" strokeWidth={2} />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* 크로스 마커가 보이는 구간에 있을 때만 범례 노출 */}
      {visibleMarkers.length > 0 && (
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> 골든크로스
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> 데드크로스
          </span>
        </div>
      )}

      {/* Volume Bar */}
      <h4 className="text-sm font-semibold mt-6 mb-2 flex items-center space-x-2">
        <span className="text-slate-400">거래량</span>
      </h4>
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-3 text-xs text-blue-300 leading-relaxed">
        {helpTexts.volume}
      </div>
      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={volumeData}>
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} hide />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => {
              if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}백만`;
              if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
              return v.toLocaleString();
            }} />
            <Bar dataKey="volume" isAnimationActive={false}>
              {volumeData.map((entry, index) => (
                <Cell key={index} fill={entry.isUp ? '#10b98140' : '#ef444440'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* 3.11차 — 거래량 흐름 한 줄 해석 (관찰형) */}
      {volumeData.length >= 5 && (() => {
        const window = volumeData.slice(-20);
        const avg20 = window.length > 0 ? window.reduce((a, b) => a + b.volume, 0) / window.length : 0;
        const latest = volumeData[volumeData.length - 1]?.volume || 0;
        const ratio = avg20 > 0 ? latest / avg20 : 1;
        let msg = '';
        if (ratio >= 2) msg = '📊 최근 거래량이 평소의 2배 이상이에요. 관심이 크게 늘었어요.';
        else if (ratio >= 1.3) msg = '📊 거래량이 평소보다 늘고 있어요.';
        else if (ratio <= 0.5) msg = '📊 거래량이 평소보다 줄었어요. 관심이 식은 편이에요.';
        else msg = '📊 거래량은 평소 수준이에요.';
        return <p className="text-xs text-slate-400 mt-2 leading-relaxed">{msg}</p>;
      })()}
    </div>
  );
}
