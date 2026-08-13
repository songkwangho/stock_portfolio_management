import { describe, it, expect } from 'vitest';
import { forwardReturn, excessReturn, signalIndices, smaAt } from '@/scripts/backtest/returns.mjs';

// 누수 가드가 이 파일의 핵심이다. 여기가 새면 IC가 전부 거짓이 된다.

const series = (prices: (number | null)[], start = 20260101) =>
  prices.map((p, i) => ({ date: String(start + i), price: p as number }));

describe('forwardReturn — 엄격히 t+1..t+N', () => {
  const s = series([100, 110, 120, 130, 140]);

  it('진입 i, 청산 i+N의 종가비 - 1', () => {
    const r = forwardReturn(s, 0, 2);
    expect(r.ok).toBe(true);
    expect(r.ret).toBeCloseTo(0.2, 10);          // 120/100 - 1
    expect(r.entryDate).toBe('20260101');
    expect(r.exitDate).toBe('20260103');
  });

  it('i+N이 시계열 끝을 넘으면 제외 — 마지막 가격으로 메우지 않는다', () => {
    // 억지 채움은 상장폐지·거래정지 종목의 손실을 0으로 둔갑시킨다.
    const r = forwardReturn(s, 3, 2);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('horizon_beyond_series');
    expect(r.ret).toBeUndefined();
  });

  it('마지막 인덱스는 어떤 호라이즌에서도 표본이 아니다', () => {
    expect(forwardReturn(s, 4, 1).ok).toBe(false);
  });

  it('청산일 종가 결측(거래정지·폐지)이면 제외', () => {
    const gap = series([100, 110, null, 130]);
    const r = forwardReturn(gap, 0, 2);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('exit_price_missing');
  });

  it('진입가 결측·0이면 제외 (분모가 되면 Infinity가 샌다)', () => {
    expect(forwardReturn(series([0, 110, 120]), 0, 2).reason).toBe('entry_price_missing');
    expect(forwardReturn(series([null, 110, 120]), 0, 2).reason).toBe('entry_price_missing');
  });

  it('잘못된 인덱스·호라이즌은 조용히 실패', () => {
    expect(forwardReturn(s, -1, 2).ok).toBe(false);
    expect(forwardReturn(s, 99, 2).ok).toBe(false);
    expect(forwardReturn(s, 0, 0).ok).toBe(false);
    expect(forwardReturn(null, 0, 2).ok).toBe(false);
  });

  it('하락도 그대로 음수로 낸다', () => {
    expect(forwardReturn(series([100, 50]), 0, 1).ret).toBeCloseTo(-0.5, 10);
  });
});

describe('excessReturn — 같은 캘린더 구간 벤치마크', () => {
  const bench = new Map([['20260101', 2000], ['20260103', 2100]]);

  it('종목 수익 - 같은 날짜 구간의 지수 변화율', () => {
    const r = excessReturn(0.2, '20260101', '20260103', bench);
    expect(r.ok).toBe(true);
    expect(r.excess).toBeCloseTo(0.2 - 0.05, 10);
  });

  it('벤치 구간 양끝이 없으면 초과수익만 제외 (원수익은 호출부가 유지)', () => {
    expect(excessReturn(0.2, '20260102', '20260103', bench).ok).toBe(false);
    expect(excessReturn(0.2, '20260101', '20260104', bench).reason).toBe('bench_missing');
  });

  it('벤치 자체가 없으면 no_benchmark', () => {
    expect(excessReturn(0.2, '20260101', '20260103', null).reason).toBe('no_benchmark');
  });
});

describe('signalIndices — 워밍업 이후, 최대 호라이즌이 들어갈 자리까지', () => {
  it('minWarmup부터 step 간격, 끝에서 maxHorizon만큼 여유를 둔다', () => {
    expect(signalIndices(100, { minWarmup: 60, stepDays: 5, maxHorizon: 20 })).toEqual([60, 65, 70, 75]);
  });

  it('모든 신호일이 최대 호라이즌 forward를 가진다 (표본 날짜가 축·호라이즌 간 동일)', () => {
    const len = 200, maxH = 60;
    for (const i of signalIndices(len, { minWarmup: 60, stepDays: 5, maxHorizon: maxH })) {
      expect(i + maxH).toBeLessThan(len);
    }
  });

  it('길이가 모자라면 빈 배열', () => {
    expect(signalIndices(50, { minWarmup: 60, stepDays: 5, maxHorizon: 20 })).toEqual([]);
  });
});

describe('smaAt — 프로덕션 getSMA와 동일 정의', () => {
  it('최근 N개 종가 평균을 Math.round (round를 빼면 정배열 경계가 갈린다)', () => {
    const s = series([100, 101, 102, 103, 105]);
    expect(smaAt(s, 4, 5)).toBe(Math.round((100 + 101 + 102 + 103 + 105) / 5));   // 102.2 → 102
    expect(smaAt(s, 4, 2)).toBe(104);                                             // (103+105)/2
  });

  it('시점 t를 **포함**한 최근 N개다 (t-1까지가 아니다)', () => {
    const s = series([10, 20, 30, 40]);
    expect(smaAt(s, 2, 3)).toBe(20);   // (10+20+30)/3
    expect(smaAt(s, 3, 3)).toBe(30);   // (20+30+40)/3
  });

  it('표본 부족이면 null — 프로덕션 getSMA도 null을 낸다', () => {
    const s = series([100, 101, 102]);
    expect(smaAt(s, 2, 5)).toBeNull();
    expect(smaAt(s, 0, 2)).toBeNull();
  });

  it('구간에 결측 가격이 있으면 null (평균을 지어내지 않는다)', () => {
    const s = series([100, null, 102, 103, 104]);
    expect(smaAt(s, 4, 5)).toBeNull();
    expect(smaAt(s, 4, 3)).toBe(103);   // 결측 밖 구간은 정상
  });
});
