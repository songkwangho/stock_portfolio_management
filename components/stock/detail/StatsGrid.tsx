'use client';

import Card from '@/components/ui/Card';
import { formatVol } from '@/lib/stockDetail/format';
import { rangeSpanLabel, describeRangePosition, rangeBasisNote } from '@/lib/stockDetail/interpret';
import type { StockDetail, PriceContext } from '@/types/stock';

// "한눈에 보기" 9지표 + 가격 범위 위치 게이지 (3.12차 S3 분리).
//
// F1~F3 — "52주" 거짓 라벨 수정:
//   범위(고저·현재가 위치)를 stockDetail.history로 계산하면 안 된다. 그 history는 서버 LIMIT 40
//   (40거래일)인데 화면은 이를 "52주 최고/최저"라 부르고 있었다 — 관찰형 앱의 진실성 위반.
//   진실 소스는 /volatility 응답에 실려 오는 priceContext.range: 250거래일(≈52주) 창 +
//   **표본 수(days)**. days < 200이면 '52주'라 부르지 않고 실제 표본 수로 부른다
//   (기준·임계는 lib/stockDetail/interpret.ts와 상수 공유 — 두 표면이 갈리면 한쪽이 거짓이 된다).
//   range.high/low는 **종가 기준**(서버 쿼리가 price만 SELECT)이라 게이지 각주에 기준을 밝힌다.
//   위치는 range.positionPct(종가 기준)를 그대로 쓴다 — 현재가로 다시 계산하면 분자·분모의
//   기준이 어긋나 '변동' 관점 문구와 다른 위치를 가리킬 수 있다.
//
// S0 결정 유지: 전일종가·거래량은 일봉 원본(stockDetail.history)에서 자체 계산해 chartTimeframe
// 오염을 막는다. priceContext는 /volatility 전용 왕복이라 애초에 timeframe과 무관하다.
interface StatsGridProps {
  stockDetail: StockDetail;
  priceContext?: PriceContext | null;
}

export default function StatsGrid({ stockDetail, priceContext }: StatsGridProps) {
  const history = stockDetail.history || [];
  const prevClose = history.length >= 2 ? history[history.length - 2].price : null;
  const latestVolume = history.length > 0 ? (history[history.length - 1].volume ?? null) : null;

  const range = priceContext?.range ?? null;
  // 범위 데이터가 없으면 기간을 말하지 않는다('52주'라 단정할 근거가 없다).
  const spanLabel = range ? rangeSpanLabel(range.days) : null;
  const highLabel = spanLabel ? `${spanLabel} 최고` : '최고가';
  const lowLabel = spanLabel ? `${spanLabel} 최저` : '최저가';

  const perDisplay =
    stockDetail.per == null ? '---'
    : stockDetail.per < 0 ? '적자'
    : stockDetail.per === 0 ? '이익 없음'
    : `${stockDetail.per}배`;

  return (
    <Card variant="secondary" padding="base" className="mb-6">
      <h3 className="text-sm font-bold text-ink mb-3">한눈에 보기</h3>
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {[
          { label: '현재가',    value: stockDetail?.price ? `₩${stockDetail.price.toLocaleString()}` : '---' },
          { label: '전일종가',  value: prevClose ? `₩${prevClose.toLocaleString()}` : '---' },
          { label: '거래량',    value: latestVolume ? formatVol(latestVolume) : '---' },
          { label: highLabel,   value: range ? `₩${range.high.toLocaleString()}` : '---' },
          { label: lowLabel,    value: range ? `₩${range.low.toLocaleString()}` : '---' },
          { label: 'PER',       value: perDisplay },
          { label: 'PBR',       value: stockDetail?.pbr ? `${stockDetail.pbr}배` : '---' },
          { label: 'ROE',       value: stockDetail?.roe ? `${stockDetail.roe}%` : '---' },
          // M2 — 목표가 항목 제거(9지표 → 8지표). 애널리스트 목표가는 타인의 전망이고,
          // 현재가와 나란히 두면 그 자체가 매수 신호로 읽힌다(R2). 내부 계산(밸류 점수 폴백)은 유지.
        ].map(item => (
          <div key={item.label} className="min-w-0">
            <p className="text-xs text-faint mb-0.5 truncate">{item.label}</p>
            <p className="text-sm font-bold text-ink truncate tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 가격 범위 내 위치 — 위치 사실만. 방향 판단·명령형 경고 없음(F3). */}
      {range && range.positionPct !== null && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="flex items-center justify-between text-xs text-faint mb-1.5">
            <span>{lowLabel}</span>
            <span>{highLabel}</span>
          </div>
          <div className="relative h-2 bg-line rounded-full">
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-ink rounded-full border-2 border-surface"
              style={{ left: `calc(${Math.min(100, Math.max(0, range.positionPct))}% - 6px)` }}
            />
          </div>
          <p className="text-xs text-muted mt-1.5 text-center tabular-nums">
            {describeRangePosition(range.days, range.positionPct)}
          </p>
          <p className="text-xs text-faint mt-0.5 text-center tabular-nums">
            {rangeBasisNote(range.days)}
          </p>
        </div>
      )}
    </Card>
  );
}
