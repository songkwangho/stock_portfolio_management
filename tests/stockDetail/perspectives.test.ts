import { describe, it, expect } from 'vitest';
import { deriveFinancialTrends } from '@/server/domains/dart/derive';
import { computePriceContext } from '@/server/domains/analysis/priceContext';
import { interpretGrowth, interpretCashflowQuality, interpretPriceContext } from '@/lib/stockDetail/interpret';
import { FORBIDDEN_BASE } from '../forbiddenWords';

// Phase A — 관점 3종(실적 성장·현금흐름 질·가격 변동/위치).
// 핵심 검증은 **계산-문구 일치**다: 서버가 못 만든 값은 서술하지 않고, 서술한 숫자는 계산과 같아야 한다.

type Row = { year: number; quarter: string; fs_div: string; account_id: string; amount: number };
const row = (year: number, quarter: string, account_id: string, amount: number, fs_div = 'CFS'): Row =>
  ({ year, quarter, fs_div, account_id, amount });

describe('deriveFinancialTrends — YoY(같은 분기) 비교', () => {
  it('최신 분기를 전년 동기와 비교한다 (직전 분기가 아니라)', () => {
    const rows = [
      row(2025, '3Q', 'revenue', 1200), row(2025, '2Q', 'revenue', 800),
      row(2024, '3Q', 'revenue', 1000), row(2024, '4Q', 'revenue', 1500),
    ];
    const d = deriveFinancialTrends(rows);
    expect(d.available).toBe(true);
    expect(d.period).toBe('2025 3Q');
    expect(d.prevPeriod).toBe('2024 3Q');
    expect(d.growth.revenue.changePct).toBe(20);   // 1000 → 1200
  });

  it('이익은 영업이익 우선, 없으면 당기순이익으로 폴백', () => {
    const withOp = deriveFinancialTrends([
      row(2025, '3Q', 'operating_income', 110), row(2024, '3Q', 'operating_income', 100),
      row(2025, '3Q', 'net_income', 90), row(2024, '3Q', 'net_income', 50),
    ]);
    expect(withOp.growth.profit.account).toBe('operating_income');
    expect(withOp.growth.profit.changePct).toBe(10);

    const netOnly = deriveFinancialTrends([
      row(2025, '3Q', 'net_income', 90), row(2024, '3Q', 'net_income', 50),
    ]);
    expect(netOnly.growth.profit.account).toBe('net_income');
    expect(netOnly.growth.profit.label).toBe('당기순이익');
  });

  it('전년이 적자(분모 ≤ 0)면 % 대신 전환 사실 — 거짓 % 금지', () => {
    const d = deriveFinancialTrends([
      row(2025, '3Q', 'operating_income', 50), row(2024, '3Q', 'operating_income', -100),
    ]);
    expect(d.growth.profit.changePct).toBeNull();
    expect(d.growth.profit.turnaround).toBe('to_profit');

    const toLoss = deriveFinancialTrends([
      row(2025, '3Q', 'operating_income', -30), row(2024, '3Q', 'operating_income', 100),
    ]);
    expect(toLoss.growth.profit.changePct).toBe(-130);   // 분모 양수라 %는 정상 계산
    expect(toLoss.growth.profit.turnaround).toBe('to_loss');

    const stayLoss = deriveFinancialTrends([
      row(2025, '3Q', 'operating_income', -30), row(2024, '3Q', 'operating_income', -10),
    ]);
    expect(stayLoss.growth.profit.changePct).toBeNull();
    expect(stayLoss.growth.profit.turnaround).toBe('stay_loss');
  });

  it('fs_div는 최신 기간 기준 CFS 우선 — 섞이지 않는다', () => {
    const d = deriveFinancialTrends([
      row(2025, '3Q', 'revenue', 1200, 'CFS'), row(2025, '3Q', 'revenue', 700, 'OFS'),
      row(2024, '3Q', 'revenue', 1000, 'CFS'), row(2024, '3Q', 'revenue', 600, 'OFS'),
    ]);
    expect(d.fsDiv).toBe('CFS');
    expect(d.growth.revenue.current).toBe(1200);
    expect(d.growth.revenue.previous).toBe(1000);
  });

  it('현금흐름 질 — 순이익 ≤ 0이면 배수 null(부호 뒤집힘 방지)', () => {
    const ok = deriveFinancialTrends([
      row(2025, '3Q', 'cf_operating', 150), row(2025, '3Q', 'net_income', 100),
    ]);
    expect(ok.cashflow.ratio).toBe(1.5);

    const loss = deriveFinancialTrends([
      row(2025, '3Q', 'cf_operating', 150), row(2025, '3Q', 'net_income', -100),
    ]);
    expect(loss.cashflow.ratio).toBeNull();
    expect(loss.cashflow.operating).toBe(150);
  });

  it('전년 동기 데이터가 없으면 성장 available:false (억지 비교 금지)', () => {
    const d = deriveFinancialTrends([row(2025, '3Q', 'revenue', 1200)]);
    expect(d.growth.available).toBe(false);
  });

  it('빈 입력 → available:false', () => {
    expect(deriveFinancialTrends([]).available).toBe(false);
    expect(deriveFinancialTrends(null).available).toBe(false);
  });
});

describe('computePriceContext — 표본 수를 함께 돌려준다', () => {
  const flat = (n: number, v = 1000) => Array(n).fill(v);

  it('변동성은 최근 20거래일 표본, 표본 부족이면 null', () => {
    expect(computePriceContext(flat(3)).volatility).toBeNull();
    const ctx = computePriceContext(flat(30));
    expect(ctx.volatility.days).toBe(20);       // 21종가 → 20수익률
    expect(ctx.volatility.dailyPct).toBe(0);    // 변동 없음
  });

  it('고저·위치는 최근 250거래일 범위, days로 실제 표본을 고지', () => {
    const closes = [...Array(40).keys()].map(i => 1000 + i * 10);   // 1000 → 1390
    const ctx = computePriceContext(closes);
    expect(ctx.range.days).toBe(40);            // 250이 아니라 실제 표본 수
    expect(ctx.range.high).toBe(1390);
    expect(ctx.range.low).toBe(1000);
    expect(ctx.range.positionPct).toBe(100);    // 현재가 = 최고가
  });

  it('250거래일을 넘으면 최근 250개만 본다', () => {
    const closes = [...Array(400).keys()].map(i => 1000 + i);   // 오래된 구간이 더 낮음
    const ctx = computePriceContext(closes);
    expect(ctx.range.days).toBe(250);
    expect(ctx.range.low).toBe(1150);           // 400개 중 마지막 250개의 시작값
  });

  it('고가=저가면 위치 정의 불가 → positionPct null', () => {
    expect(computePriceContext(flat(30)).range.positionPct).toBeNull();
  });

  it('빈 입력·비정상 값은 조용히 무시', () => {
    expect(computePriceContext([])).toEqual({ volatility: null, range: null });
    expect(computePriceContext(null)).toEqual({ volatility: null, range: null });
  });
});

describe('interpretGrowth — 계산과 문구 일치', () => {
  const g = (revPct: number | null, profPct: number | null, turn: string | null = null) => ({
    available: true,
    revenue: revPct === null ? null : { current: 0, previous: 0, changePct: revPct, turnaround: null },
    profit: profPct === null && turn === null ? null
      : { current: 0, previous: 0, changePct: profPct, turnaround: turn, label: '영업이익' },
  });

  it('동반 증가 → positive + 커지는 편', () => {
    const r = interpretGrowth(g(20, 10) as never, '2025 3Q', '2024 3Q');
    expect(r.tone).toBe('positive');
    expect(r.text).toContain('20% 늘었어요');
    expect(r.text).toContain('영업이익은 10% 늘었어요');
    expect(r.text).toContain('커지는 편');
    expect(r.text).toContain('2025 3Q 누적치를 2024 3Q 누적치와 비교');
  });

  it('동반 감소 → caution + 작아지는 편 (부호는 절대값+단어로)', () => {
    const r = interpretGrowth(g(-12.5, -30) as never, '2025 3Q', '2024 3Q');
    expect(r.tone).toBe('caution');
    expect(r.text).toContain('12.5% 줄었어요');
    expect(r.text).not.toContain('-12.5');   // 이중 부호 방지
    expect(r.text).toContain('작아지는 편');
  });

  it('혼조 → neutral, 사실만(gloss 없음)', () => {
    const r = interpretGrowth(g(20, -10) as never, '2025 3Q', '2024 3Q');
    expect(r.tone).toBe('neutral');
    expect(r.text).not.toContain('커지는 편');
    expect(r.text).not.toContain('작아지는 편');
  });

  it('흑자 전환 → % 없이 사실 서술', () => {
    const r = interpretGrowth(g(null, null, 'to_profit') as never, '2025 3Q', '2024 3Q');
    expect(r.text).toContain('적자에서 흑자로 바뀌었어요');
    expect(r.tone).toBe('positive');
    expect(r.text).not.toContain('%');
  });

  it('데이터 없음 → available:false', () => {
    expect(interpretGrowth(null).available).toBe(false);
    expect(interpretGrowth({ available: false }).available).toBe(false);
    expect(interpretGrowth({ available: true, revenue: null, profit: null }).available).toBe(false);
  });
});

describe('interpretCashflowQuality — 계산과 문구 일치', () => {
  it('영업현금 ≥ 순이익 → positive + 배수 명시', () => {
    const r = interpretCashflowQuality({ available: true, operating: 150, netIncome: 100, ratio: 1.5 }, '2025 3Q');
    expect(r.tone).toBe('positive');
    expect(r.text).toContain('1.5배');
    expect(r.text).toContain('2025 3Q 누적 기준');
  });
  it('영업현금 < 순이익 → caution', () => {
    const r = interpretCashflowQuality({ available: true, operating: 60, netIncome: 100, ratio: 0.6 }, '2025 3Q');
    expect(r.tone).toBe('caution');
    expect(r.text).toContain('0.6배');
  });
  it('영업현금 음수 → caution + 순유출 사실', () => {
    const r = interpretCashflowQuality({ available: true, operating: -50, netIncome: 100, ratio: -0.5 }, '2025 3Q');
    expect(r.tone).toBe('caution');
    expect(r.text).toContain('순유출');
  });
  it('순이익 ≤ 0이라 배수 없음 → neutral + 부호 사실만', () => {
    const r = interpretCashflowQuality({ available: true, operating: 80, netIncome: -20, ratio: null }, '2025 3Q');
    expect(r.tone).toBe('neutral');
    expect(r.text).toContain('영업활동에서는 현금이 들어왔어요');
    expect(r.text).not.toContain('배');
  });
  it('데이터 없음 → available:false', () => {
    expect(interpretCashflowQuality(null).available).toBe(false);
    expect(interpretCashflowQuality({ available: false }).available).toBe(false);
  });
});

describe('interpretPriceContext — 표본에 맞는 라벨만 쓴다', () => {
  it('250거래일 표본이면 "최근 1년"', () => {
    const r = interpretPriceContext({
      volatility: { dailyPct: 2.0, days: 20 },
      range: { high: 90000, low: 50000, days: 250, positionPct: 75 },
    });
    expect(r.text).toContain('최근 1년');
    expect(r.text).toContain('위쪽');
    expect(r.text).toContain('75% 지점');
    expect(r.tone).toBe('neutral');   // 변동성·위치는 우호/비우호가 아니다
  });

  it('표본이 1년에 못 미치면 "최근 N거래일"로 정직하게', () => {
    const r = interpretPriceContext({
      volatility: null,
      range: { high: 90000, low: 50000, days: 40, positionPct: 10 },
    });
    expect(r.text).toContain('최근 40거래일');
    expect(r.text).not.toContain('1년');
    expect(r.text).toContain('아래쪽');
  });

  it('변동성 밴드 — 임계값(3%/1.5%)과 문구 일치', () => {
    const v = (dailyPct: number) => interpretPriceContext({ volatility: { dailyPct, days: 20 }, range: null }).text;
    expect(v(3.4)).toContain('크게 오르내리는 편');
    expect(v(2.0)).toContain('보통 수준');
    expect(v(1.1)).toContain('잔잔하게 움직이는 편');
    expect(v(2.0)).toContain('±2% 수준');
  });

  it('위치 정의 불가(positionPct null)면 위치 문장을 만들지 않는다', () => {
    const r = interpretPriceContext({ volatility: { dailyPct: 2, days: 20 }, range: { high: 100, low: 100, days: 30, positionPct: null } });
    expect(r.text).not.toContain('지점');
    expect(r.available).toBe(true);
  });

  it('데이터 없음 → available:false', () => {
    expect(interpretPriceContext(null).available).toBe(false);
    expect(interpretPriceContext({ volatility: null, range: null }).available).toBe(false);
  });
});

describe('관점 3종 금지어 전수 스윕', () => {
  it('전 브랜치 출력에 판단어가 없다', () => {
    const outputs: string[] = [];
    for (const rev of [null, 20, -12.5, 0]) {
      for (const prof of [null, 10, -30, 0]) {
        for (const turn of [null, 'to_profit', 'to_loss', 'stay_loss']) {
          const r = interpretGrowth({
            available: true,
            revenue: rev === null ? null : { current: 1, previous: 1, changePct: rev, turnaround: null },
            profit: prof === null && turn === null ? null : { current: 1, previous: 1, changePct: prof, turnaround: turn as never, label: '영업이익' },
          } as never, '2025 3Q', '2024 3Q');
          if (r.available) outputs.push(r.text);
        }
      }
    }
    for (const operating of [-50, 0, 80, 150]) {
      for (const netIncome of [null, -20, 100]) {
        for (const ratio of [null, 0.6, 1.5]) {
          const r = interpretCashflowQuality({ available: true, operating, netIncome, ratio }, '2025 3Q');
          if (r.available) outputs.push(r.text);
        }
      }
    }
    for (const dailyPct of [0.5, 2, 4]) {
      for (const days of [30, 250]) {
        for (const positionPct of [0, 50, 100]) {
          const r = interpretPriceContext({ volatility: { dailyPct, days: 20 }, range: { high: 100, low: 50, days, positionPct } });
          if (r.available) outputs.push(r.text);
        }
      }
    }

    for (const t of new Set(outputs)) {
      for (const w of FORBIDDEN_BASE) {
        expect(t.includes(w), `"${t}" 에 금지어 "${w}" 포함`).toBe(false);
      }
    }
  });
});
