'use client';

import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type Time, type LogicalRange, type SeriesMarker,
} from 'lightweight-charts';

/**
 * lightweight-charts 엔진 래퍼 — **도메인 지식 없음.** 시리즈 스펙을 받아 그리기만 한다.
 *
 * 로드맵 Sprint 3 [M2](캔들 재도입) + [M1](components/charts/ 분리)을 함께 흡수한다.
 * Recharts 커스텀 shape의 wick 좌표 버그로 막혀 있던 캔들이 여기서 되살아난다.
 *
 * 설계 메모:
 * - **메인 + 서브패널 스택**: v4는 진짜 멀티-pane이 제한적이라, 시간축을 상호 동기한
 *   별도 차트 인스턴스를 세로로 쌓는 표준 관용구를 쓴다.
 * - **가격축 폭 정렬**: 서브패널의 축 폭이 메인과 다르면 시간축이 어긋나 보인다 →
 *   전 차트에 같은 `minimumWidth`를 준다. (이게 없으면 지표를 켤 때마다 축이 흔들린다.)
 * - **토글 시 뷰포트 보존**: 칩을 켜고 끌 때마다 차트를 재생성하는데, 그대로 두면
 *   사용자가 맞춘 확대·이동이 초기화된다 → 논리 범위를 ref에 남겨 복원한다.
 */

export type ChartBar = {
  time: Time;          // 'YYYY-MM-DD'
  open: number; high: number; low: number; close: number;
};

export type LineSpec = {
  key: string;
  data: { time: Time; value: number }[];
  color: string;
  lineWidth?: 1 | 2 | 3;
  dashed?: boolean;
  /** 밴드 상/하단처럼 마지막 값 라벨이 겹쳐 지저분해지는 선은 false */
  lastValueVisible?: boolean;
};

export type PriceLineSpec = { price: number; color: string; title: string };

export type SubSeries =
  | { kind: 'line'; key: string; data: { time: Time; value: number }[]; color: string; lineWidth?: 1 | 2; lastValueVisible?: boolean }
  | { kind: 'histogram'; key: string; data: { time: Time; value: number; color?: string }[]; color: string };

export type SubPanelSpec = {
  key: string;
  label: string;
  heightClass: string;                  // Tailwind 높이 (컨테이너가 높이를 소유 — autoSize가 폭만 따라간다)
  series: SubSeries[];
  /** RSI 70/30, 스토캐스틱 80/20 같은 수평 안내선 */
  guides?: { value: number; color: string }[];
  /** 0~100 지표는 축을 고정해야 눈금이 흔들리지 않는다 */
  fixedRange?: { min: number; max: number };
  valueFormatter?: (v: number) => string;
};

export type MarkerSpec = { time: Time; color: string; label?: string };

interface LwcChartProps {
  bars: ChartBar[];
  /** 캔들 칩 off — 봉을 지우고 오버레이만 남긴다. 마커·지지저항은 보이지 않는 종가 선에 붙는다. */
  showCandles?: boolean;
  /** 메인 pane 오버레이(이평선·볼린저·LRC 등) */
  lines?: LineSpec[];
  /** 지지·저항 수평선 */
  priceLines?: PriceLineSpec[];
  markers?: MarkerSpec[];
  subPanels?: SubPanelSpec[];
  mainHeightClass?: string;
  /** 초기에 보여줄 최근 봉 수. 나머지는 스크롤로 접근 */
  initialBars?: number;
  priceFormatter?: (v: number) => string;
}

const AXIS = '#85878D';
const GRID = '#E7E7E3';
const PRICE_SCALE_WIDTH = 64;   // 메인·서브패널 공통 — 시간축 정렬의 전제

function baseOptions(priceFormatter?: (v: number) => string) {
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: AXIS,
      fontSize: 11,
      attributionLogo: false,
    },
    grid: { vertLines: { visible: false }, horzLines: { color: GRID, style: LineStyle.Dotted } },
    rightPriceScale: { borderVisible: false, minimumWidth: PRICE_SCALE_WIDTH },
    timeScale: { borderVisible: false, rightOffset: 2, fixLeftEdge: true, fixRightEdge: true },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: AXIS, width: 1 as const, style: LineStyle.Dotted, labelBackgroundColor: '#17181C' },
      horzLine: { color: AXIS, width: 1 as const, style: LineStyle.Dotted, labelBackgroundColor: '#17181C' },
    },
    localization: priceFormatter ? { priceFormatter } : undefined,
    handleScale: { axisPressedMouseMove: false },
  };
}

export default function LwcChart({
  bars, showCandles = true, lines = [], priceLines = [], markers = [], subPanels = [],
  mainHeightClass = 'h-72', initialBars = 60, priceFormatter,
}: LwcChartProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const subRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // 재생성 사이에 살아남아야 하는 뷰포트 상태(칩 토글마다 초기화되면 안 된다).
  const savedRange = useRef<LogicalRange | null>(null);

  // 시리즈 구성이 바뀌면 재생성한다. 증분 diff보다 단순하고, 700봉 재생성은 저렴하다.
  // 뷰포트만 savedRange로 복원하면 사용자에겐 끊김이 보이지 않는다.
  const structureKey = JSON.stringify({
    l: lines.map(l => l.key), p: priceLines.map(p => p.title),
    s: subPanels.map(s => ({ k: s.key, n: s.series.map(x => x.key) })),
    n: bars.length, first: bars[0]?.time ?? null, last: bars[bars.length - 1]?.time ?? null,
    m: markers.length, c: showCandles,
  });

  useEffect(() => {
    const host = mainRef.current;
    if (!host || bars.length === 0) return;

    const charts: IChartApi[] = [];
    const main = createChart(host, baseOptions(priceFormatter));
    charts.push(main);

    // ── 캔들 — 한국 증시 색: 양봉 빨강 / 음봉 파랑 (3.13 방향색 규칙) ──
    // 캔들 칩을 끄면 **보이지 않는 종가 선**을 대신 만든다. 마커·지지저항 priceLine이
    // 시리즈에 붙는 구조라, 앵커가 사라지면 그것들도 함께 사라진다.
    const anchor: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> = showCandles
      ? main.addCandlestickSeries({
        upColor: '#D91C1C', downColor: '#1B5FD0',
        borderUpColor: '#D91C1C', borderDownColor: '#1B5FD0',
        wickUpColor: '#D91C1C', wickDownColor: '#1B5FD0',
        priceLineVisible: false,
      })
      : main.addLineSeries({ color: 'transparent', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    // 기본 여백(top .2 / bottom .1)은 축을 데이터 폭의 1.8배까지 벌려 봉이 작아지고
    // 최상단 눈금 라벨이 컨테이너 위로 잘린다. 조여서 봉에 화면을 준다.
    // ⚠️ scaleMargins는 **시리즈 옵션이 아니라 가격축 옵션**이다(v4 typings).
    anchor.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.1 } });
    if (showCandles) (anchor as ISeriesApi<'Candlestick'>).setData(bars);
    else (anchor as ISeriesApi<'Line'>).setData(bars.map(b => ({ time: b.time, value: b.close })));

    // ── 오버레이 라인 — 전부 무채색/보조색. 방향색은 캔들·가격에만 ──
    for (const l of lines) {
      const s = main.addLineSeries({
        color: l.color,
        lineWidth: l.lineWidth ?? 1,
        lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: l.lastValueVisible ?? false,
        crosshairMarkerVisible: false,
      });
      s.setData(l.data);
    }

    // ── 지지·저항 수평선 ──
    for (const pl of priceLines) {
      anchor.createPriceLine({
        price: pl.price, color: pl.color, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: pl.title,
      });
    }

    // ── 골든/데드크로스 마커 ──
    if (markers.length) {
      const sorted = [...markers].sort((a, b) => String(a.time).localeCompare(String(b.time)));
      anchor.setMarkers(sorted.map<SeriesMarker<Time>>(m => ({
        time: m.time, position: 'aboveBar', shape: 'circle', color: m.color, text: m.label ?? '',
      })));
    }

    // ── 서브패널 ──
    const subCharts: IChartApi[] = [];
    for (const p of subPanels) {
      const el = subRefs.current.get(p.key);
      if (!el) continue;
      const c = createChart(el, {
        ...baseOptions(p.valueFormatter),
        // 서브패널은 시간축 라벨을 숨긴다 — 메인 아래 한 줄만 남기면 세로가 절약된다.
        timeScale: { ...baseOptions().timeScale, visible: false },
      });
      for (const s of p.series) {
        if (s.kind === 'line') {
          const ls = c.addLineSeries({
            color: s.color, lineWidth: s.lineWidth ?? 1,
            priceLineVisible: false,
            // 거래량 평균선처럼 축 눈금과 겹쳐 지저분해지는 선은 마지막 값 라벨을 끈다.
            lastValueVisible: s.lastValueVisible ?? true,
            crosshairMarkerVisible: false,
          });
          ls.setData(s.data);
        } else {
          const hs = c.addHistogramSeries({ color: s.color, priceLineVisible: false, lastValueVisible: false });
          // 히스토그램은 바닥(0)에 붙여야 막대 길이가 곧 크기로 읽힌다.
          hs.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0 } });
          hs.setData(s.data);
        }
      }
      // 안내선은 첫 시리즈에 붙인다(별도 시리즈를 만들면 축 범위가 흔들린다).
      const anchor = c.addLineSeries({ visible: false });
      anchor.setData(bars.map(b => ({ time: b.time, value: p.fixedRange ? p.fixedRange.min : 0 })));
      for (const g of p.guides || []) {
        anchor.createPriceLine({
          price: g.value, color: g.color, lineWidth: 1,
          lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '',
        });
      }
      if (p.fixedRange) {
        anchor.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: p.fixedRange!.min, maxValue: p.fixedRange!.max } }) });
      }
      subCharts.push(c);
      charts.push(c);
    }

    // ── 시간축 상호 동기 ──
    // 가드 없이 서로의 setVisibleLogicalRange를 호출하면 무한 루프가 된다.
    let syncing = false;
    const sync = (src: IChartApi) => (range: LogicalRange | null) => {
      if (!range) return;
      savedRange.current = range;
      if (syncing) return;
      syncing = true;
      for (const c of charts) if (c !== src) c.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    for (const c of charts) c.timeScale().subscribeVisibleLogicalRangeChange(sync(c));

    // ── 초기 뷰포트 — 재생성이면 직전 범위 복원, 첫 렌더면 최근 initialBars ──
    const range = savedRange.current ?? {
      from: Math.max(0, bars.length - initialBars),
      to: bars.length - 1,
    };
    for (const c of charts) c.timeScale().setVisibleLogicalRange(range as LogicalRange);

    return () => { for (const c of charts) c.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  return (
    <div className="space-y-1">
      {/* pt-1: 최상단 눈금 라벨이 컨테이너 위로 잘리지 않게 4px 확보.
          padding은 **바깥 래퍼**에 준다 — autoSize가 clientHeight를 재므로 차트 div에 주면
          높이 계산이 어긋난다. */}
      <div className="pt-1">
        <div ref={mainRef} className={`w-full ${mainHeightClass}`} />
      </div>
      {subPanels.map(p => (
        <div key={p.key}>
          <p className="text-xs text-faint mb-0.5">{p.label}</p>
          <div
            ref={(el) => { if (el) subRefs.current.set(p.key, el); else subRefs.current.delete(p.key); }}
            className={`w-full ${p.heightClass}`}
          />
        </div>
      ))}
    </div>
  );
}
