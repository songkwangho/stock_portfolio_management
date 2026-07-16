'use client';

import Card from '@/components/ui/Card';
import { formatVol } from '@/lib/stockDetail/format';
import type { StockDetail } from '@/types/stock';

// "한눈에 보기" 9지표 + 52주 게이지 (3.12차 S3 분리).
// S0 결정: 전일종가·거래량·52주는 항상 일봉 원본(stockDetail.history)에서 자체 계산
// (chartTimeframe 오염 방지). 셸에서 파생값을 내려받지 않고 컴포넌트가 소유.
interface StatsGridProps {
  stockDetail: StockDetail;
}

export default function StatsGrid({ stockDetail }: StatsGridProps) {
  const history = stockDetail.history || [];
  const high52w = history.length > 0
    ? Math.max(...history.map(h => h.high || h.price))
    : null;
  const low52w = history.length > 0
    ? Math.min(...history.filter(h => (h.low || h.price) > 0).map(h => h.low || h.price))
    : null;
  const prevClose = history.length >= 2 ? history[history.length - 2].price : null;
  const latestVolume = history.length > 0 ? (history[history.length - 1].volume ?? null) : null;
  const perDisplay =
    stockDetail.per == null ? '---'
    : stockDetail.per < 0 ? '적자'
    : stockDetail.per === 0 ? '이익 없음'
    : `${stockDetail.per}배`;

  return (
    <Card variant="secondary" padding="base" className="mb-6">
      <h3 className="text-sm font-bold text-ink mb-3">📊 한눈에 보기</h3>
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {[
          { label: '현재가',    value: stockDetail?.price ? `₩${stockDetail.price.toLocaleString()}` : '---' },
          { label: '전일종가',  value: prevClose ? `₩${prevClose.toLocaleString()}` : '---' },
          { label: '거래량',    value: latestVolume ? formatVol(latestVolume) : '---' },
          { label: '52주 최고', value: high52w ? `₩${high52w.toLocaleString()}` : '---' },
          { label: '52주 최저', value: low52w ? `₩${low52w.toLocaleString()}` : '---' },
          { label: 'PER',       value: perDisplay },
          { label: 'PBR',       value: stockDetail?.pbr ? `${stockDetail.pbr}배` : '---' },
          { label: 'ROE',       value: stockDetail?.roe ? `${stockDetail.roe}%` : '---' },
          { label: '목표가',    value: stockDetail?.targetPrice ? `₩${stockDetail.targetPrice.toLocaleString()}` : '---' },
        ].map(item => (
          <div key={item.label} className="min-w-0">
            <p className="text-xs text-faint mb-0.5 truncate">{item.label}</p>
            <p className="text-sm font-bold text-ink truncate">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 52주 범위 내 현재가 위치 게이지 — 저점/고점 근접 여부를 시각화 */}
      {high52w && low52w && stockDetail?.price && high52w > low52w && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="flex items-center justify-between text-xs text-faint mb-1.5">
            <span>52주 최저</span>
            <span>52주 최고</span>
          </div>
          <div className="relative h-2 bg-slate-800 rounded-full">
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-ink rounded-full border-2 border-surface"
              style={{ left: `calc(${Math.min(100, Math.max(0, (stockDetail.price - low52w) / (high52w - low52w) * 100))}% - 6px)` }}
            />
          </div>
          <p className="text-xs text-muted mt-1.5 text-center">
            {(() => {
              const pct = (stockDetail.price - low52w) / (high52w - low52w) * 100;
              if (pct >= 90) return '52주 최고가 근처예요. 단기 고점에 주의하세요';
              if (pct >= 60) return '52주 범위 상단, 상승 흐름이에요';
              if (pct >= 40) return '52주 범위 중간 정도예요';
              if (pct >= 10) return '52주 범위 하단, 저점 근처일 수 있어요';
              return '52주 최저가 근처, 반등인지 하락 지속인지 확인하세요';
            })()}
          </p>
        </div>
      )}
    </Card>
  );
}
