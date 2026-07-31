// 4.5b차 — 키움증권 거래내역 CSV 파서 (Port&Adapter). RawTrade[]만 반환, 정규화는 normalize가 담당.
// ⚠️ 헤더 시노님은 대표적 export 포맷 기준 추정 — 실제 파일로 운영자 검증 필요(DART 부트샘플 방식).
//    검증 후 시노님만 보강하면 되고 파이프라인은 그대로.
// PII 화이트리스트: 아래 6개 필드만 뽑는다. 계좌번호·예수금·성명 컬럼은 여기서 버려진다.
import { parseCsv, pick } from './normalize.js';

// ✅ 실파일 대조(2026-07-31): 실헤더 = 거래일자,종목명,거래수량,…,매체구분,…,거래구분,거래단가,…
// K1: side에 '거래구분' 명시(bare '구분' 삭제) — bare '구분'이 '매체구분'(값=영웅문S#)에 greedy 매칭돼
//     parseSide('영웅문S#')=null → 전행 드롭되던 버그. '거래구분'은 '매체구분'에 부분매칭되지 않아 안전.
//     수량/단가/일자는 기존 시노님('수량'→거래수량,'단가'→거래단가,'거래일자')으로 이미 매칭됨.
//     코드 컬럼은 실파일에 없음 → 종목명 기반 매핑(service).
const SYN = {
    code: ['종목코드', '종목번호', '단축코드'],
    name: ['종목명'],
    side: ['거래구분', '매매구분', '주문구분', '매도수구분'],
    quantity: ['체결수량', '수량', '주문수량'],
    price: ['체결단가', '단가', '체결가격', '거래단가'],
    tradedAt: ['주문일자', '체결일자', '거래일자', '체결일', '거래일', '일자'],
};

export function parseKiwoom(text) {
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
