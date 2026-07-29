// 4.5b차 — CSV 헤더 시그니처로 증권사 판별 (순수).
// 헤더가 브로커마다 겹칠 수 있어 점수제. 확신이 낮으면 index.js가 "전 파서 시도 후 최다 유효행" 폴백.
// ⚠️ 시그니처 토큰은 추정 — 실제 파일로 운영자 검증 필요.
import { parseCsv } from './normalize.js';

// 각 브로커의 "그 브로커에서 특히 자주 보이는" 헤더 토큰 (가중치 합산).
const SIGNATURES = {
    kiwoom: ['체결수량', '체결단가', '주문번호', '주문일자', '주문구분'],
    toss: ['거래구분', '주문일시', '체결일시'],
    samsung: ['거래일', '약정일', '매매구분'],
};

export function detectBroker(text) {
    const { headers } = parseCsv(text);
    if (!headers.length) return { broker: null, confidence: 0 };
    const joined = headers.join('|').replace(/\s/g, '');
    const scores = {};
    for (const [broker, tokens] of Object.entries(SIGNATURES)) {
        scores[broker] = tokens.reduce((s, t) => s + (joined.includes(t) ? 1 : 0), 0);
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [broker, score] = ranked[0];
    return { broker: score > 0 ? broker : null, confidence: score };
}
