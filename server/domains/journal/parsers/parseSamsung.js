// 4.5b차 — 삼성증권 거래내역 CSV 파서. RawTrade[]만 반환.
// ⚠️ 헤더 시노님은 추정 — 실제 파일로 운영자 검증 필요.
// PII 화이트리스트: 6개 필드만 추출.
import { parseCsv, pick } from './normalize.js';

const SYN = {
    code: ['종목코드', '단축코드', '종목번호'],
    name: ['종목명'],
    side: ['매매구분', '거래구분', '구분'],
    quantity: ['수량', '체결수량', '거래수량'],
    price: ['단가', '체결단가', '거래단가', '체결가격'],
    tradedAt: ['거래일', '거래일자', '체결일자', '약정일', '일자'],
};

export function parseSamsung(text) {
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
