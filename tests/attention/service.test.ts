import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB는 스텁 — 로컬에 DATABASE_URL이 없고, 여기서 검증할 건 SQL 결과가 아니라 **조립**이다.
// (실DB 경로는 운영자 검증 — journal C-1/C-2와 동일 방침.)
const queryMock = vi.fn();
vi.mock('@/server/db/connection.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: vi.fn(),
  default: {},
}));

const { getAttention } = await import('@/server/domains/attention/service');

type Rows = { rows: Record<string, unknown>[] };
// SQL 텍스트로 분기하는 라우팅 스텁.
function stubDb(tables: { holdings?: Rows; watchlist?: Rows; history?: Rows; disclosures?: Rows; directory?: Rows }) {
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('holding_stocks')) return tables.holdings ?? { rows: [] };
    if (sql.includes('watchlist')) return tables.watchlist ?? { rows: [] };
    if (sql.includes('stock_history')) return tables.history ?? { rows: [] };
    if (sql.includes('dart_disclosures')) return tables.disclosures ?? { rows: [] };
    if (sql.includes('stocks_directory')) return tables.directory ?? { rows: [] };
    throw new Error(`unexpected SQL: ${sql}`);
  });
}

// 최근 N거래일 히스토리 — 마지막 종가만 지정해 5거래일 변동을 만든다.
const histRows = (code: string, closes: number[], volumes?: number[]) =>
  closes.map((price, i) => ({
    code, date: `202608${String(i + 1).padStart(2, '0')}`, price, volume: volumes ? volumes[i] : 1000,
  }));

// 중괄호 필수 — mockReset()은 mock(호출 가능 객체)을 반환하고,
// beforeEach가 반환한 함수는 Vitest가 teardown으로 간주해 인자 없이 호출한다(= query() 오호출).
beforeEach(() => { queryMock.mockReset(); });

describe('attention service — 조립', () => {
  it('보유·관심이 모두 없으면 available:false (블록 미표시)', async () => {
    stubDb({});
    expect(await getAttention('dev-1')).toEqual({ available: false, reason: 'empty' });
  });

  it('device 스코프 — 모든 사용자 데이터 조회에 deviceId가 바인딩된다', async () => {
    stubDb({ holdings: { rows: [{ code: '005930', name: '삼성전자', avg_price: '70000', quantity: 10, weight: 25, price: 80000 }] } });
    await getAttention('dev-42');
    const userQueries = queryMock.mock.calls.filter(([sql]) => /holding_stocks|watchlist/.test(sql as string));
    expect(userQueries).toHaveLength(2);
    for (const [, params] of userQueries) expect(params).toEqual(['dev-42']);
  });

  it('보유 종목 — 미실현·비중·5거래일 변동을 원시 사실로 반환', async () => {
    stubDb({
      holdings: { rows: [{ code: '005930', name: '삼성전자', avg_price: '70000', quantity: 10, weight: 25, price: 71000 }] },
      history: { rows: histRows('005930', [80000, 80000, 80000, 80000, 80000, 80000, 88000]) },
    });
    const out = await getAttention('dev-1');
    expect(out.available).toBe(true);
    const item = out.items[0];
    expect(item.code).toBe('005930');
    expect(item.source).toBe('holding');
    expect(item.ret5d).toBe(10);              // 80000 → 88000
    expect(item.unrealizedPct).toBe(25.71);   // 최신 종가 88000 기준 (stocks.price 아님)
    expect(item.weightPct).toBe(25);
    expect(item.priced).toBe(true);
    expect(item.discCount).toBe(0);           // DART 미적재 = 정상 경로
    expect(out.asOfDate).toBe('2026-08-07');
  });

  it('히스토리 없는 보유 종목 — stocks.price로 폴백, 없으면 priced:false', async () => {
    stubDb({
      holdings: {
        rows: [
          { code: '000001', name: '폴백', avg_price: '1000', quantity: 1, weight: 40, price: 1500 },
          { code: '000002', name: '승격전', avg_price: '1000', quantity: 1, weight: 40, price: null },
        ],
      },
    });
    const out = await getAttention('dev-1');
    const byCode = Object.fromEntries(out.items.map((i: { code: string }) => [i.code, i]));
    expect(byCode['000001'].priced).toBe(true);
    expect(byCode['000001'].unrealizedPct).toBe(50);
    expect(byCode['000001'].ret5d).toBeNull();
    // 시세를 못 얻은 종목은 미실현도 null — 모르는 값을 만들지 않는다.
    expect(byCode['000002']?.priced ?? false).toBe(false);
  });

  it('관심 종목 — 미실현·비중은 항상 null, source=watchlist', async () => {
    stubDb({
      watchlist: { rows: [{ code: '035420', name: 'NAVER', price: 200000 }] },
      history: { rows: histRows('035420', [200000, 200000, 200000, 200000, 200000, 200000, 180000]) },
    });
    const out = await getAttention('dev-1');
    expect(out.items[0].source).toBe('watchlist');
    expect(out.items[0].held).toBe(false);
    expect(out.items[0].unrealizedPct).toBeNull();
    expect(out.items[0].weightPct).toBeNull();
    expect(out.items[0].ret5d).toBe(-10);
  });

  it('보유·관심 중복 코드는 한 번만, 보유로', async () => {
    stubDb({
      holdings: { rows: [{ code: '005930', name: '삼성전자', avg_price: '70000', quantity: 10, weight: 30, price: 90000 }] },
      watchlist: { rows: [{ code: '005930', name: '삼성전자', price: 90000 }] },
      history: { rows: histRows('005930', [80000, 80000, 80000, 80000, 80000, 80000, 90000]) },
    });
    const out = await getAttention('dev-1');
    expect(out.items).toHaveLength(1);
    expect(out.items[0].source).toBe('holding');
  });

  it('stocks에 이름이 없으면 stocks_directory로 보강', async () => {
    stubDb({
      holdings: { rows: [{ code: '900001', name: null, avg_price: '1000', quantity: 1, weight: 40, price: 1400 }] },
      directory: { rows: [{ code: '900001', name: '디렉토리이름' }] },
    });
    const out = await getAttention('dev-1');
    expect(out.items[0].name).toBe('디렉토리이름');
  });

  it('공시 — 룩백 집계가 건수·경과일·중립 라벨로 붙는다', async () => {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    stubDb({
      holdings: { rows: [{ code: '005930', name: '삼성전자', avg_price: '70000', quantity: 10, weight: 25, price: 71000 }] },
      disclosures: { rows: [{ code: '005930', rcept_dt: today, category: 'earnings' }] },
    });
    const out = await getAttention('dev-1');
    expect(out.items[0].discCount).toBe(1);
    expect(out.items[0].discLatestDaysAgo).toBe(0);
    expect(out.items[0].discCategories).toEqual(['실적']);
  });
});

// (조립 스텁 테스트 — 실DB 경로는 운영자 검증)
