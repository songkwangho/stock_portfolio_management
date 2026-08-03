import { describe, it, expect } from 'vitest';
import { buildNameIndex, norm } from '@/server/domains/journal/universe';

describe('universe — 종목명→코드 인덱스 (T2 유니버스 확장)', () => {
  it('유일 종목명은 매핑되고, 코드셋에 전 코드 포함', () => {
    const { codeSet, nameToCode } = buildNameIndex([
      { code: '005930', name: '삼성전자' },
      { code: '035720', name: '카카오' },
    ]);
    expect(codeSet.has('005930')).toBe(true);
    expect(codeSet.has('035720')).toBe(true);
    expect(nameToCode.get('삼성전자')).toBe('005930');
    expect(nameToCode.get('카카오')).toBe('035720');
  });

  it('공백 정규화 — 조회 키는 공백 제거본', () => {
    const { nameToCode } = buildNameIndex([{ code: '000660', name: 'SK 하이닉스' }]);
    expect(nameToCode.get(norm('SK하이닉스'))).toBe('000660');
    expect(nameToCode.get('SK하이닉스')).toBe('000660');
  });

  it('동명 종목(한 이름 2코드)은 오매핑 대신 제외 — nameToCode 미포함, 코드셋엔 둘 다', () => {
    // 넓은 유니버스(디렉토리)에서 실재하는 충돌: 잘못된 코드로 때우면 지표가 조용히 오염됨.
    const { codeSet, nameToCode } = buildNameIndex([
      { code: '111111', name: '대한제강' },
      { code: '222222', name: '대한제강' },
    ]);
    expect(nameToCode.has('대한제강')).toBe(false);   // 모호 → 매핑 안 함(호출부에서 unmatched로 남김)
    expect(codeSet.has('111111')).toBe(true);
    expect(codeSet.has('222222')).toBe(true);
  });

  it('빈/누락 입력 안전', () => {
    expect(buildNameIndex([]).nameToCode.size).toBe(0);
    expect(buildNameIndex([]).codeSet.size).toBe(0);
    expect(buildNameIndex(undefined).codeSet.size).toBe(0);   // null/undefined 방어
    // 이름만 있고 코드 없는 행은 매핑 불가 → nameToCode 제외
    const { nameToCode, codeSet } = buildNameIndex([{ code: '005930' }, { name: '이름만' }]);
    expect(nameToCode.size).toBe(0);
    expect(codeSet.has('005930')).toBe(true);
  });
});
