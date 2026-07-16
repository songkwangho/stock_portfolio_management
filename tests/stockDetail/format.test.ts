import { describe, it, expect } from 'vitest';
import { formatVol } from '@/lib/stockDetail/format';

// 현재 동작을 고정하는 테스트 (behavior-pinning). 함수를 고치지 않는다.
describe('formatVol', () => {
  it('1만 미만은 그대로 천단위 콤마', () => {
    expect(formatVol(9999)).toBe('9,999');
    expect(formatVol(0)).toBe('0');
    expect(formatVol(1234)).toBe('1,234');
  });

  it('1만 경계(10000)는 "만" 단위 반올림', () => {
    expect(formatVol(10000)).toBe('1만');
    expect(formatVol(12345)).toBe('1만');   // round(1.2345)=1
    expect(formatVol(25000)).toBe('3만');   // round(2.5)=3 (JS Math.round 반올림)
  });

  it('1억 미만 상단(99999999)은 "만" 단위 (반올림으로 10000만)', () => {
    // 99999999 / 10000 = 9999.9999 → round → 10000 → "10000만" (현재 동작)
    expect(formatVol(99999999)).toBe('10000만');
  });

  it('1억 경계(100000000)는 "억" 단위 소수 1자리', () => {
    expect(formatVol(100000000)).toBe('1.0억');
    expect(formatVol(250000000)).toBe('2.5억');
  });
});
