// 4.5b차 — 파서 레지스트리 + 디스패치 (순수). 브로커 추가 = 어댑터 추가 + 이 맵에 등록.
import { detectBroker } from './detectBroker.js';
import { normalizeTrades } from './normalize.js';
import { parseKiwoom } from './parseKiwoom.js';
import { parseToss } from './parseToss.js';
import { parseSamsung } from './parseSamsung.js';

export const PARSERS = {
    kiwoom: parseKiwoom,
    toss: parseToss,
    samsung: parseSamsung,
};

export const SUPPORTED_BROKERS = Object.keys(PARSERS);

// csvText → { broker, trades: Trade[] }
// brokerHint 있으면 우선. 없으면 헤더 감지. 감지 실패/0행이면 전 파서 시도 후 최다 유효행 채택
// (내 헤더 시노님이 실제와 어긋나도 최대한 살리는 폴백).
export function parseTrades(csvText, brokerHint) {
    const hint = brokerHint && PARSERS[brokerHint] ? brokerHint : null;
    const detected = hint || detectBroker(csvText).broker;

    if (detected && PARSERS[detected]) {
        const trades = normalizeTrades(PARSERS[detected](csvText), detected);
        if (trades.length > 0 || hint) return { broker: detected, trades };
    }

    // 폴백: 전 파서 시도 → 유효행 가장 많은 브로커 채택
    let best = { broker: detected || null, trades: [] };
    for (const [broker, fn] of Object.entries(PARSERS)) {
        const trades = normalizeTrades(fn(csvText), broker);
        if (trades.length > best.trades.length) best = { broker, trades };
    }
    return best;
}
