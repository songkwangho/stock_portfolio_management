import { describe, it, expect } from 'vitest';
import { parseTrades } from '@/server/domains/journal/parsers/index.js';
import { detectBroker } from '@/server/domains/journal/parsers/detectBroker.js';
import {
  parseSide, parseTradedAt, cleanNumber, cleanInt, cleanCode, normalizeTrades, parseCsv,
} from '@/server/domains/journal/parsers/normalize.js';

// ⚠️ 픽스처 헤더는 파서 시노님 기준 — 실제 증권사 export와의 정합은 운영자 검증 필요(DART 부트샘플 방식).
//    실제 헤더가 다르면 각 parseX.js의 SYN 시노님만 보강하면 되고 파이프라인은 그대로.

const KIWOOM = `주문일자,종목코드,종목명,매매구분,체결수량,체결단가
2026-01-05,005930,삼성전자,매수,10,"75,000"
2026-02-10,005930,삼성전자,매도,10,"80,000"`;

const TOSS = `주문일시,종목명,거래구분,수량,단가
2026-01-05 09:30:00,삼성전자,매수,10,75000`;

const SAMSUNG = `거래일,종목코드,종목명,매매구분,수량,단가
2026-01-05,005930,삼성전자,매수,10,75000`;

describe('detectBroker', () => {
  it('키움 헤더 시그니처', () => expect(detectBroker(KIWOOM).broker).toBe('kiwoom'));
  it('토스 헤더 시그니처', () => expect(detectBroker(TOSS).broker).toBe('toss'));
  it('삼성 헤더 시그니처', () => expect(detectBroker(SAMSUNG).broker).toBe('samsung'));
  it('빈 텍스트 → null', () => expect(detectBroker('').broker).toBe(null));
});

describe('parseTrades — 정규화 canonical Trade', () => {
  it('키움: 2건, 코드/방향/수량/가격/일자', () => {
    const { broker, trades } = parseTrades(KIWOOM);
    expect(broker).toBe('kiwoom');
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ code: '005930', side: 'buy', quantity: 10, price: 75000, tradedAt: '2026-01-05' });
    expect(trades[1]).toMatchObject({ code: '005930', side: 'sell', quantity: 10, price: 80000, tradedAt: '2026-02-10' });
  });
  it('토스: 코드 없음 → name 보존(코드 해석은 service 담당)', () => {
    const { broker, trades } = parseTrades(TOSS);
    expect(broker).toBe('toss');
    expect(trades[0]).toMatchObject({ code: null, name: '삼성전자', side: 'buy', quantity: 10, price: 75000, tradedAt: '2026-01-05' });
  });
  it('삼성: 코드 매핑', () => {
    const { broker, trades } = parseTrades(SAMSUNG);
    expect(broker).toBe('samsung');
    expect(trades[0]).toMatchObject({ code: '005930', side: 'buy' });
  });
  it('canonical Trade는 화이트리스트 필드만 — PII 컬럼 미유출', () => {
    const withPII = `주문일자,종목코드,종목명,매매구분,체결수량,체결단가,계좌번호,예수금,성명
2026-01-05,005930,삼성전자,매수,10,75000,123-456-7890,5000000,홍길동`;
    const { trades } = parseTrades(withPII);
    expect(Object.keys(trades[0]).sort()).toEqual(['code', 'name', 'price', 'quantity', 'side', 'source', 'tradedAt']);
    // PII 값이 어떤 필드에도 스며들지 않았는지
    const blob = JSON.stringify(trades);
    expect(blob).not.toContain('123-456-7890');
    expect(blob).not.toContain('홍길동');
    expect(blob).not.toContain('5000000');
  });
});

describe('값 정제 헬퍼', () => {
  it('parseSide — 현금/신용 접두어·영문', () => {
    expect(parseSide('현금매수')).toBe('buy');
    expect(parseSide('신용매도')).toBe('sell');
    expect(parseSide('매입')).toBe('buy');
    expect(parseSide('BUY')).toBe('buy');
    expect(parseSide('입금')).toBe(null);
  });
  it('parseTradedAt — 다양한 포맷', () => {
    expect(parseTradedAt('2026-01-05')).toBe('2026-01-05');
    expect(parseTradedAt('2026/1/5')).toBe('2026-01-05');
    expect(parseTradedAt('2026.01.05')).toBe('2026-01-05');
    expect(parseTradedAt('20260105')).toBe('2026-01-05');
    expect(parseTradedAt('2026-01-05 09:30:00')).toBe('2026-01-05');
    expect(parseTradedAt('없음')).toBe(null);
    expect(parseTradedAt('2026-13-40')).toBe(null);
  });
  it('cleanNumber/cleanInt/cleanCode', () => {
    expect(cleanNumber('75,000원')).toBe(75000);
    expect(cleanInt('10주')).toBe(10);
    expect(cleanInt('-10')).toBe(10);
    expect(cleanCode('A005930')).toBe('005930');
    expect(cleanCode('삼성')).toBe(null);
  });
  it('normalizeTrades — 검증 실패행 드롭(가격/일자 누락)', () => {
    const raw = [
      { code: '005930', name: '삼성전자', side: '매수', quantity: '10', price: '75000', tradedAt: '2026-01-05' },
      { code: '005930', name: '삼성전자', side: '매수', quantity: '10', price: '', tradedAt: '2026-01-05' },   // 가격 없음
      { code: '005930', name: '삼성전자', side: '매수', quantity: '10', price: '75000', tradedAt: '없음' },      // 일자 불량
      { code: '', name: '', side: '매수', quantity: '10', price: '75000', tradedAt: '2026-01-05' },              // 코드/명 둘다 없음
    ];
    expect(normalizeTrades(raw, 'kiwoom')).toHaveLength(1);
  });
  it('parseCsv — 프리앰블(제목행) 스킵 + 구분자 감지', () => {
    const withPreamble = `거래내역 조회 결과
조회기간: 2026-01-01 ~ 2026-02-28

주문일자,종목코드,종목명,매매구분,체결수량,체결단가
2026-01-05,005930,삼성전자,매수,10,75000`;
    const { headers, rows } = parseCsv(withPreamble);
    expect(headers).toContain('종목코드');
    expect(rows).toHaveLength(1);
  });
});
