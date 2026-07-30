// 4.5b차 — 편향 전략 오케스트레이션. 각 전략은 metrics만 산출(판단 텍스트 없음).
// 순서 고정(프론트 표시 순서와 일치): 처분효과 → 과매매 → 추격매수 → 앵커링.
import { disposition } from './disposition.js';
import { overtrading } from './overtrading.js';
import { chasing } from './chasing.js';
import { anchoring } from './anchoring.js';

// { trades, roundtrips, priceReader } → Bias[]
// priceReader는 chasing 전용 가격조회 포트(async). 나머지는 순수.
export async function computeBiases({ trades, roundtrips, priceReader }) {
    return [
        disposition(roundtrips),
        overtrading(trades, roundtrips),
        await chasing(trades, priceReader),
        anchoring(roundtrips),
    ];
}
