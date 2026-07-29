// 4.5b차 — 토스증권 거래내역 CSV 파서. RawTrade[]만 반환.
// ⚠️ 토스는 종목코드 컬럼이 없을 수 있음 → name 기반 매핑 폴백(service가 stocks 테이블로 해석).
//    헤더 시노님은 추정 — 실제 파일로 운영자 검증 필요.
// PII 화이트리스트: 6개 필드만 추출.
import { parseCsv, pick } from './normalize.js';

const SYN = {
    code: ['종목코드', '단축코드'],
    name: ['종목명', '종목'],
    side: ['거래구분', '구분', '주문구분', '매매구분'],
    quantity: ['수량', '체결수량'],
    price: ['단가', '체결가격', '거래단가', '체결단가', '가격'],
    tradedAt: ['주문일시', '체결일시', '거래일시', '일시', '거래일자', '체결일자', '일자'],
};

export function parseToss(text) {
    const { rows } = parseCsv(text);
    return rows.map(r => ({
        code: pick(r, SYN.code),
        name: pick(r, SYN.name),
        side: pick(r, SYN.side),
        quantity: pick(r, SYN.quantity),
        price: pick(r, SYN.price),
        tradedAt: pick(r, SYN.tradedAt),
    }));
}
