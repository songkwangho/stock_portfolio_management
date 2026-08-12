import { describe, it, expect } from 'vitest';
import { matchAccount, orderBySection, SJ_PRIORITY } from '@/server/helpers/dartAccounts';
import { deriveFinancialTrends } from '@/server/domains/dart/derive';

// DART 손익 계정 CIS 폴백.
//
// 배경: IFRS는 손익을 (a) 손익계산서(IS) + 포괄손익계산서(CIS) 2표, 또는 (b) CIS 1표로
// 낼 수 있다. 파서가 손익을 IS로만 한정하던 동안 (b) 방식 회사는 매출·영업이익·순이익이
// **한 건도 적재되지 않았다**(유유제약 000220: 자산·부채·자본·현금흐름만 존재).
// 그러면 derive.js의 성장(YoY)·현금흐름 질이 재료를 못 얻어 관점이 통째로 빠진다.
//
// 여기서 지키는 것 두 가지:
//   1) CIS 손익은 잡되, 포괄손익 조정·귀속 라인은 계속 걸러진다(오값 저장 차단).
//   2) IS·CIS에 같은 계정이 있으면 **IS가 이긴다** — 응답 순서가 아니라 orderBySection으로.

type Item = { sj_div: string; account_id?: string; account_nm: string; thstrm_amount?: string };
const item = (sj_div: string, account_nm: string, account_id = '-표준계정코드 미사용-'): Item =>
  ({ sj_div, account_id, account_nm });

const idOf = (it: Item) => matchAccount(it)?.id ?? null;
// 서버 JS는 shim으로 any라 반환 타입을 여기서 좁힌다(스윕이 조용히 any로 미끄러지지 않게).
const ordered = (list: unknown): Item[] => orderBySection(list) as Item[];

describe('matchAccount — CIS(포괄손익계산서) 손익 폴백', () => {
  it('CIS의 매출액·영업이익·당기순이익을 표준 account_id로 잡는다', () => {
    expect(idOf(item('CIS', '매출액', 'ifrs-full_Revenue'))).toBe('revenue');
    expect(idOf(item('CIS', '영업이익', 'dart_OperatingIncomeLoss'))).toBe('operating_income');
    expect(idOf(item('CIS', '당기순이익', 'ifrs-full_ProfitLoss'))).toBe('net_income');
  });

  it('표준계정코드가 없는 CIS 항목도 account_nm 정확일치로 잡는다', () => {
    // 중소형사는 '-표준계정코드 미사용-'이 흔하다 — 2차 name 매칭이 실제 커버리지를 만든다.
    expect(idOf(item('CIS', '매출액'))).toBe('revenue');
    expect(idOf(item('CIS', '당기순이익(손실)'))).toBe('net_income');
    expect(idOf(item('CIS', '반기순이익'))).toBe('net_income');
  });

  it('IS 매칭은 그대로 유지된다', () => {
    expect(idOf(item('IS', '매출액', 'ifrs-full_Revenue'))).toBe('revenue');
    expect(idOf(item('IS', '영업이익(손실)'))).toBe('operating_income');
    expect(idOf(item('IS', '당기순이익', 'ifrs-full_ProfitLoss'))).toBe('net_income');
  });
});

describe('matchAccount — CIS를 열어도 새는 곳이 없다', () => {
  it('포괄손익 조정 라인은 매칭되지 않는다', () => {
    // CIS는 순이익 아래로 기타포괄손익을 쌓아 총포괄손익으로 끝난다.
    // 이걸 net_income으로 오인하면 '순이익'이 환산손익·재평가까지 포함한 값이 된다.
    expect(idOf(item('CIS', '기타포괄손익'))).toBeNull();
    expect(idOf(item('CIS', '기타포괄손익-세후'))).toBeNull();
    expect(idOf(item('CIS', '총포괄손익'))).toBeNull();
    expect(idOf(item('CIS', '당기총포괄손익', 'ifrs-full_ComprehensiveIncome'))).toBeNull();
  });

  it('귀속·계속영업 하위 라인은 CIS에서도 매칭되지 않는다', () => {
    expect(idOf(item('CIS', '지배기업 소유주지분 당기순이익'))).toBeNull();
    expect(idOf(item('CIS', '비지배지분 당기순이익'))).toBeNull();
    expect(idOf(item('CIS', '계속영업당기순이익'))).toBeNull();
    expect(idOf(item('CIS', '중단영업당기순이익'))).toBeNull();
  });

  it('현금흐름표의 당기순이익은 여전히 손익으로 잡히지 않는다', () => {
    // 간접법 CF는 당기순이익에서 출발한다 — 섹션 가드가 없으면 손익과 섞인다.
    expect(idOf(item('CF', '당기순이익', 'ifrs-full_ProfitLoss'))).toBeNull();
    expect(idOf(item('CF', '영업활동현금흐름'))).toBe('cf_operating');
  });

  it('자본변동표(SCE)는 어떤 계정으로도 잡히지 않는다', () => {
    expect(idOf(item('SCE', '당기순이익', 'ifrs-full_ProfitLoss'))).toBeNull();
    expect(idOf(item('SCE', '자본총계', 'ifrs-full_Equity'))).toBeNull();
  });

  it('재무상태표 매칭은 영향받지 않는다', () => {
    expect(idOf(item('BS', '자산총계', 'ifrs-full_Assets'))).toBe('assets');
    expect(idOf(item('BS', '부채총계'))).toBe('liabilities');
    expect(idOf(item('BS', '자본총계'))).toBe('equity');
  });
});

describe('orderBySection — IS가 CIS보다 먼저 처리된다', () => {
  it('IS < CIS 우선순위', () => {
    expect(SJ_PRIORITY.IS).toBeLessThan(SJ_PRIORITY.CIS);
  });

  it('응답이 CIS를 먼저 주더라도 IS 항목이 앞으로 온다', () => {
    const list = [item('CIS', '당기순이익'), item('CF', '영업활동현금흐름'), item('IS', '당기순이익')];
    expect(ordered(list).map(i => i.sj_div)).toEqual(['IS', 'CIS', 'CF']);
  });

  it('섹션 내부 순서는 보존된다 (합계 first-wins가 계속 성립)', () => {
    // 안정 정렬이 아니면 '합계 → 귀속' 순서가 뒤집혀 하위 라인이 먼저 매칭될 수 있다.
    const list = [
      item('IS', '당기순이익'), item('IS', '지배기업 소유주지분 당기순이익'), item('IS', '비지배지분 당기순이익'),
    ];
    expect(ordered(list).map(i => i.account_nm)).toEqual(list.map(i => i.account_nm));
  });

  it('알 수 없는 sj_div는 뒤로 밀린다 (앞질러 매칭되지 않게)', () => {
    const list = [item('XX', '매출액'), item('IS', '매출액')];
    expect(ordered(list).map(i => i.sj_div)).toEqual(['IS', 'XX']);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const list = [item('CIS', '당기순이익'), item('IS', '당기순이익')];
    const before = list.map(i => i.sj_div);
    ordered(list);
    expect(list.map(i => i.sj_div)).toEqual(before);
  });

  it('null/undefined 입력에도 빈 배열을 돌려준다', () => {
    expect(ordered(null)).toEqual([]);
    expect(ordered(undefined)).toEqual([]);
  });
});

// 적재 스크립트(sync-dart-financials.js)의 디둡 루프를 그대로 옮긴 축소판.
// 실제 저장 값이 무엇이 되는지를 검증하려면 매칭만으로는 부족하다.
function ingest(list: Item[], year: number, quarter: string, fsDiv = 'CFS') {
  const seen = new Set<string>();
  const rows: { year: number; quarter: string; fs_div: string; account_id: string; amount: number }[] = [];
  for (const it of ordered(list)) {
    const matched = matchAccount(it);
    if (!matched) continue;
    const pk = `${year}|${quarter}|${fsDiv}|${matched.id}`;
    if (seen.has(pk)) continue;          // first-wins
    seen.add(pk);
    rows.push({ year, quarter, fs_div: fsDiv, account_id: matched.id, amount: Number(it.thstrm_amount) });
  }
  return rows;
}

const amt = (it: Item, v: number): Item => ({ ...it, thstrm_amount: String(v) });

describe('적재 결과 — 2표 보고와 단일표 보고가 모두 손익을 얻는다', () => {
  it('IS·CIS에 순이익이 모두 있으면 IS 값이 저장된다 (CIS가 응답 앞에 와도)', () => {
    const rows = ingest([
      amt(item('CIS', '당기순이익'), 999),   // 응답 순서상 먼저지만
      amt(item('IS', '당기순이익'), 500),    // IS가 이겨야 한다
      amt(item('CIS', '기타포괄손익'), 30),
      amt(item('CIS', '총포괄손익'), 530),
    ], 2025, '3Q');
    expect(rows).toHaveLength(1);
    expect(rows[0].account_id).toBe('net_income');
    expect(rows[0].amount).toBe(500);
  });

  it('단일 포괄손익계산서(CIS만)여도 손익 3계정이 모두 적재된다', () => {
    // 이 케이스가 회귀의 본체다 — 이전 파서에선 rows가 0건이었다.
    const rows = ingest([
      amt(item('BS', '자산총계'), 10_000),
      amt(item('CIS', '매출액'), 1_200),
      amt(item('CIS', '영업이익'), 150),
      amt(item('CIS', '당기순이익'), 120),
      amt(item('CIS', '기타포괄손익'), 5),
      amt(item('CF', '영업활동현금흐름'), 180),
    ], 2025, '3Q');
    const ids = rows.map(r => r.account_id);
    expect(ids).toContain('revenue');
    expect(ids).toContain('operating_income');
    expect(ids).toContain('net_income');
    expect(ids).not.toContain(undefined);
    expect(rows.find(r => r.account_id === 'net_income')!.amount).toBe(120);
  });

  it('단일표 보고 종목도 성장·현금흐름 관점이 계산된다', () => {
    // 파서 → derive 연결까지 확인한다. 파서만 고쳐도 관점이 안 뜨면 의미가 없다.
    const cur = ingest([
      amt(item('CIS', '매출액'), 1_200), amt(item('CIS', '당기순이익'), 120),
      amt(item('CF', '영업활동현금흐름'), 180),
    ], 2025, '3Q');
    const prev = ingest([
      amt(item('CIS', '매출액'), 1_000), amt(item('CIS', '당기순이익'), 100),
    ], 2024, '3Q');

    const d = deriveFinancialTrends([...cur, ...prev]);
    expect(d.available).toBe(true);
    expect(d.growth.available).toBe(true);
    expect(d.growth.revenue.changePct).toBe(20);          // 1000 → 1200
    expect(d.growth.profit.account).toBe('net_income');   // 영업이익 없음 → 순이익 폴백
    expect(d.growth.profit.changePct).toBe(20);           // 100 → 120
    expect(d.cashflow.available).toBe(true);
    expect(d.cashflow.ratio).toBe(1.5);                   // 180 ÷ 120 — 배수형 서술 가능
  });

  it('손익이 IS에만 있는 기존 종목도 그대로 동작한다 (회귀)', () => {
    const cur = ingest([amt(item('IS', '매출액'), 1_200), amt(item('IS', '영업이익'), 200)], 2025, '3Q');
    const prev = ingest([amt(item('IS', '매출액'), 1_000), amt(item('IS', '영업이익'), 160)], 2024, '3Q');
    const d = deriveFinancialTrends([...cur, ...prev]);
    expect(d.growth.revenue.changePct).toBe(20);
    expect(d.growth.profit.account).toBe('operating_income');
    expect(d.growth.profit.changePct).toBe(25);
  });
});
