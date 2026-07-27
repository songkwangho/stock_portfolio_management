'use client';

import type { DartFinancialsResult, DartStatementRow, FinancialData } from '@/types/stock';
import FinancialsTable from './FinancialsTable';

// 4.5a차 — 재무제표: DART 우선, 없으면 네이버 폴백, 둘 다 없으면 "준비 중".
// 손익/재무상태/현금흐름 3섹션 세로 배치. 금액은 원 단위 → 억/조 포맷.
//
// ⚠️ DART 손익계산서·현금흐름표의 기간 금액은 **누적(YTD)** 이다(1Q=3개월, 반기=6, 3Q=9, 사업=12).
//    인접 기간을 ▲▼로 비교하면 항상 증가처럼 보이거나(9개월>6개월) 연도경계에서 급감처럼 보여 오해를
//    준다. 그래서 손익·현금흐름은 '누적' 라벨 + 화살표 없음, 재무상태표(시점값)만 직전 대비 화살표.
//    (매출 증가 ≠ 주가 상승 — 3.13 방향색 규칙에 따라 화살표도 무채색.)

const SECTION_META: { key: 'income' | 'balance' | 'cashflow'; label: string; cumulative: boolean }[] = [
  { key: 'income', label: '손익계산서', cumulative: true },
  { key: 'balance', label: '재무상태표', cumulative: false },
  { key: 'cashflow', label: '현금흐름표', cumulative: true },
];

// 원 단위 금액 → "N조 N,NNN억" / "N,NNN억" / "N백만". null → '---'.
function fmtWon(won: number | null): string {
  if (won === null || won === undefined) return '---';
  const abs = Math.abs(won);
  const sign = won < 0 ? '-' : '';
  if (abs >= 1e12) {
    const jo = Math.floor(abs / 1e12);
    const eok = Math.round((abs % 1e12) / 1e8);
    return `${sign}${jo}조${eok > 0 ? ` ${eok.toLocaleString()}억` : ''}`;
  }
  if (abs >= 1e8) return `${sign}${Math.round(abs / 1e8).toLocaleString()}억`;
  if (abs === 0) return '0';
  return `${sign}${Math.round(abs / 1e6).toLocaleString()}백만`;
}

function StatementSection({ label, rows, periods, cumulative }: { label: string; rows: DartStatementRow[]; periods: string[]; cumulative: boolean }) {
  // 값이 전부 null인 섹션은 숨김(해당 표를 제출하지 않은 회사)
  const hasAny = rows.some(r => r.values.some(v => v !== null));
  if (!hasAny) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h4 className="text-sm font-bold text-ink">{label}</h4>
        {cumulative && <span className="text-xs text-faint">누적(연초부터)</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-inset border-b border-line">
              <th className="text-left py-2 px-3 text-xs text-faint font-bold">구분</th>
              {periods.map(p => (
                <th key={p} className="text-right py-2 px-3 text-xs text-faint font-bold whitespace-nowrap">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} className="border-b border-line">
                <td className="py-2.5 px-3 text-ink font-semibold whitespace-nowrap">{row.label}</td>
                {row.values.map((v, i) => {
                  // 누적(손익·현금흐름)은 인접 기간의 기간 길이가 달라(3·6·9·12개월) 비교 불가 → 화살표 없음.
                  // 시점값(재무상태표)만 직전 기간(오른쪽=과거) 대비 화살표. 방향색 금지, 무채색만.
                  const older = !cumulative && i < row.values.length - 1 ? row.values[i + 1] : null;
                  const arrow = (v !== null && older !== null) ? (v > older ? ' ▲' : v < older ? ' ▼' : '') : '';
                  return (
                    <td key={i} className={`text-right py-2.5 px-3 tabular-nums whitespace-nowrap ${v === null ? 'text-faint' : 'text-ink'}`}>
                      {fmtWon(v)}<span className="text-faint">{arrow}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DartFinancials({ dart, naver }: { dart: DartFinancialsResult | null; naver: FinancialData | null }) {
  // 1) DART 우선
  if (dart?.available && dart.statements && dart.periods && dart.periods.length > 0) {
    return (
      <div className="bg-surface p-6 rounded-xl border border-line space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-ink mb-1">재무제표</h3>
          <p className="text-xs text-faint break-keep">
            {dart.fsDiv === 'CFS' ? '연결' : '별도'} 기준 · 금융감독원 DART · 단위: 억/조 원 (최신 → 과거)
          </p>
        </div>
        {SECTION_META.map(s => (
          <StatementSection key={s.key} label={s.label} rows={dart.statements![s.key]} periods={dart.periods!} cumulative={s.cumulative} />
        ))}
        <p className="text-xs text-faint break-keep">
          손익·현금흐름은 연초부터의 누적 합계예요(기간이 지날수록 커져요). 재무상태표의 ▲▼만 직전 기간 대비 변화이고, 실적 증가가 주가 상승을 뜻하진 않아요.
        </p>
      </div>
    );
  }

  // 2) 네이버 폴백
  if (naver && naver.financials.length > 0) {
    return <FinancialsTable financials={naver} />;
  }

  // 3) 둘 다 없음 → 준비 중
  return (
    <div className="bg-surface p-6 rounded-xl border border-line">
      <h3 className="text-lg font-semibold text-ink mb-1">재무제표</h3>
      <p className="text-sm text-muted break-keep">재무 정보를 준비 중이에요. 조금만 기다려 주세요.</p>
    </div>
  );
}
