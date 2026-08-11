// 매수/매도 "관찰(observation)" 신호 계산 모듈 (3.11차).
//
// 설계 원칙 (반드시 준수):
//   1. 신호는 "매수/매도 신호"가 아니라 관찰 결과로 서술 — 명령형("사세요") 금지.
//   2. 방향 중립 신호(스퀴즈)는 방향을 단정하지 않는다.
//   3. 모든 계산은 어제 종가 기준 일봉 데이터 (실시간 아님).
//   4. 데이터 부족 시 해당 detect 함수는 null 반환 — 전체 실패로 이어지지 않게.
//   5. 백테스팅 미검증 상태 → "예측"이 아닌 "관찰"로 표현.
//
// 각 detect 함수는 { id, type, label, description, date? } 또는 null 반환.
//   type: 'positive' | 'caution' | 'neutral'
//   date: (선택) 신호 발생일 'YYYYMMDD' — 차트 마커 매칭용.
import pool from '../../db/connection.js';
import { getCached, setCache } from '../../helpers/cache.js';

const asOfLabel = '어제 종가 기준';

// ── 수학 헬퍼 ──
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// 단순이동평균 시계열 — price 인덱스에 정렬. period 미만 구간은 null.
function smaSeries(prices, period) {
    const out = new Array(prices.length).fill(null);
    let sum = 0;
    for (let i = 0; i < prices.length; i++) {
        sum += prices[i];
        if (i >= period) sum -= prices[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

// 지수이동평균 시계열 — price 인덱스에 정렬. period 미만 구간은 null.
// 초기값은 첫 period개의 SMA로 시드 (indicators.js와 동일 관례).
function emaSeries(data, period) {
    const out = new Array(data.length).fill(null);
    const k = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) continue;
        if (i === period - 1) {
            prev = avg(data.slice(0, period));
        } else {
            prev = data[i] * k + prev * (1 - k);
        }
        out[i] = prev;
    }
    return out;
}

// ── 1. 골든/데드크로스 (SMA5 vs SMA20 교차) ──
// 어제→오늘 교차 여부 판정. SMA20을 이틀 연속 확보하려면 최소 21일.
function detectCross(history) {
    const prices = history.map(h => h.price);
    const n = prices.length;
    if (n < 21) return null;
    const s5 = smaSeries(prices, 5);
    const s20 = smaSeries(prices, 20);
    const s5T = s5[n - 1], s20T = s20[n - 1], s5P = s5[n - 2], s20P = s20[n - 2];
    if ([s5T, s20T, s5P, s20P].some(v => v == null)) return null;
    const date = history[n - 1].date;
    // 골든크로스: 어제 5일선 <= 20일선, 오늘 5일선 > 20일선
    if (s5P <= s20P && s5T > s20T) {
        return {
            id: 'cross', type: 'positive', label: '골든크로스', date,
            description: '단기 이평선이 중기 이평선을 위로 뚫었어요. 보통 단기 상승 전환 신호로 봐요.',
        };
    }
    // 데드크로스: 어제 5일선 >= 20일선, 오늘 5일선 < 20일선
    if (s5P >= s20P && s5T < s20T) {
        return {
            id: 'cross', type: 'caution', label: '데드크로스', date,
            description: '단기 이평선이 중기 이평선을 아래로 뚫었어요. 보통 단기 하락 전환 신호로 봐요.',
        };
    }
    return null;
}

// ── 차트 마커용: 최근 windowDays 구간의 모든 골든/데드크로스 ──
// 신호 패널용 detectCross(어제 1일)와 별개. 차트는 20일을 표시하므로 창 내 전체 교차를 수집해야
// 마커가 실질적으로 보인다(SIG-4 정상화). return: [{ date:'YYYYMMDD', type:'golden'|'dead' }].
export function detectCrossHistory(history, windowDays = 20) {
    const prices = history.map(h => h.price);
    const n = prices.length;
    if (n < 21) return [];
    const s5 = smaSeries(prices, 5);
    const s20 = smaSeries(prices, 20);
    const out = [];
    // i-1의 SMA20이 유효하려면 i >= 20. 최근 windowDays 바만 검사.
    const start = Math.max(20, n - windowDays);
    for (let i = start; i < n; i++) {
        const a5 = s5[i], a20 = s20[i], p5 = s5[i - 1], p20 = s20[i - 1];
        if ([a5, a20, p5, p20].some(v => v == null)) continue;
        if (p5 <= p20 && a5 > a20) out.push({ date: history[i].date, type: 'golden' });
        else if (p5 >= p20 && a5 < a20) out.push({ date: history[i].date, type: 'dead' });
    }
    return out;
}

// ── 2. 볼린저 스퀴즈 + 밴드 돌파 ──
// 20일 이평 ± 2표준편차. 밴드폭 = (상단-하단)/중앙선.
// 스퀴즈: 오늘 밴드폭이 최근 20일 중 하위 20% 수준.
// 돌파: 가격이 밴드 상/하단을 거래량 증가와 함께 벗어남 (돌파가 스퀴즈보다 우선).
function detectBollingerSqueeze(history) {
    const prices = history.map(h => h.price);
    const n = prices.length;
    if (n < 40) return null; // 최근 20일치 밴드폭 각각 20일 필요 → 최소 39, 여유 40

    const bandAt = (t) => {
        const window = prices.slice(t - 19, t + 1);
        const mean = avg(window);
        const sd = Math.sqrt(avg(window.map(p => (p - mean) ** 2)));
        const upper = mean + 2 * sd;
        const lower = mean - 2 * sd;
        return { upper, lower, mean, width: mean > 0 ? (upper - lower) / mean : 0 };
    };

    const widths = [];
    for (let t = n - 20; t < n; t++) widths.push(bandAt(t).width);
    const today = bandAt(n - 1);
    const price = prices[n - 1];
    const date = history[n - 1].date;

    // 거래량 증가 확인 (직전 20일 평균 대비 1.5배 이상)
    const vols = history.map(h => h.volume);
    const avgVol20 = avg(vols.slice(n - 21, n - 1));
    const volUp = avgVol20 > 0 && vols[n - 1] >= avgVol20 * 1.5;

    // 밴드 돌파 (방향 확정) — 스퀴즈보다 우선.
    if (price > today.upper && volUp) {
        return {
            id: 'bollinger', type: 'positive', label: '상단 돌파', date,
            description: '가격이 밴드 상단을 거래량 증가와 함께 넘었어요. 상승 쪽으로 움직이기 시작했어요.',
        };
    }
    if (price < today.lower && volUp) {
        return {
            id: 'bollinger', type: 'caution', label: '하단 이탈', date,
            description: '가격이 밴드 하단을 거래량 증가와 함께 벗어났어요. 하락 쪽으로 움직이기 시작했어요.',
        };
    }

    // 스퀴즈 (방향 미확정) — 하위 20% 밴드폭.
    const sorted = [...widths].sort((a, b) => a - b);
    const threshold = sorted[Math.floor((sorted.length - 1) * 0.2)];
    if (today.width <= threshold) {
        return {
            id: 'bollinger', type: 'neutral', label: '변동성 축소(스퀴즈)', date,
            description: '밴드 폭이 크게 좁아졌어요. 보통 이런 뒤 큰 움직임이 나오는 경우가 많아요. 위·아래 방향은 아직 알 수 없으니 돌파 방향과 거래량을 함께 지켜보세요.',
        };
    }
    return null;
}

// ── 3. RSI 과매도/과매수 (14일) ──
// indicators.js와 동일한 14일 평균 이득/손실 방식.
function detectRSI(history) {
    const prices = history.map(h => h.price);
    if (prices.length < 15) return null;
    let gains = 0, losses = 0;
    for (let i = prices.length - 14; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    if (rsi <= 30) {
        return {
            id: 'rsi', type: 'positive', label: '과매도',
            description: '과매도 구간이에요. 단기 반등 가능성을 지켜볼 수 있어요.',
        };
    }
    if (rsi >= 70) {
        return {
            id: 'rsi', type: 'caution', label: '과매수',
            description: '과매수 구간이에요. 단기 조정 가능성에 주의하며 지켜보세요.',
        };
    }
    return null;
}

// ── 4. MACD 히스토그램 전환 (12, 26, 9) ──
// 히스토그램 부호가 어제→오늘 음→양(상승 전환) / 양→음(하락 전환)으로 바뀌었는지.
// 두 시점 히스토그램 확보에 최소 35일 필요.
function detectMACD(history) {
    const prices = history.map(h => h.price);
    const n = prices.length;
    if (n < 35) return null;
    const ema12 = emaSeries(prices, 12);
    const ema26 = emaSeries(prices, 26);
    const macdLine = prices.map((_, i) => (ema12[i] != null && ema26[i] != null) ? ema12[i] - ema26[i] : null);
    const macdStart = macdLine.findIndex(v => v != null);
    if (macdStart < 0) return null;
    const macdSeq = macdLine.slice(macdStart);
    const signalSeq = emaSeries(macdSeq, 9);
    const histAt = (priceIdx) => {
        const mi = priceIdx - macdStart;
        if (mi < 0) return null;
        const m = macdSeq[mi];
        const s = signalSeq[mi];
        if (m == null || s == null) return null;
        return m - s;
    };
    const hT = histAt(n - 1), hP = histAt(n - 2);
    if (hT == null || hP == null) return null;
    if (hP <= 0 && hT > 0) {
        return {
            id: 'macd', type: 'positive', label: 'MACD 상승 전환',
            description: '매수 힘이 매도 힘보다 강해지기 시작했어요. 단기 흐름이 위로 돌아섰어요.',
        };
    }
    if (hP >= 0 && hT < 0) {
        return {
            id: 'macd', type: 'caution', label: 'MACD 하락 전환',
            description: '매도 힘이 매수 힘보다 강해지기 시작했어요. 단기 흐름이 아래로 돌아섰어요.',
        };
    }
    return null;
}

// ── 5. OBV(누적 거래량) 매집/분산 ──
// OBV = 종가 상승일 +거래량, 하락일 -거래량 누적.
// OBV 10일 상승 + 주가 횡보/하락 → 매집. OBV 하락 + 주가 상승 → 약세 다이버전스.
function detectOBV(history) {
    const n = history.length;
    if (n < 11) return null;
    const obvSeries = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
        const diff = history[i].price - history[i - 1].price;
        obvSeries[i] = obvSeries[i - 1] + (diff > 0 ? history[i].volume : diff < 0 ? -history[i].volume : 0);
    }
    const obvNow = obvSeries[n - 1], obv10 = obvSeries[n - 11];
    const priceNow = history[n - 1].price, price10 = history[n - 11].price;
    if (price10 <= 0) return null;
    const priceUp = priceNow > price10 * 1.02;        // 주가 2%+ 상승
    const priceFlatOrDown = priceNow <= price10 * 1.02; // 횡보 또는 하락
    if (obvNow > obv10 && priceFlatOrDown) {
        return {
            id: 'obv', type: 'positive', label: '매집 흐름',
            description: '거래량 흐름상 조용히 사들이는 모습이 보여요. 세력 매집 가능성을 참고만 하세요.',
        };
    }
    if (obvNow < obv10 && priceUp) {
        return {
            id: 'obv', type: 'caution', label: '거래량 미확인 상승',
            description: '주가는 오르지만 거래량이 받쳐주지 않아요. 상승 힘이 약할 수 있어요.',
        };
    }
    return null;
}

// ── 6. 거래량 급증 ──
// 오늘 거래량이 직전 20일 평균의 2배 이상 + 주가 방향.
function detectVolumeSpike(history) {
    const n = history.length;
    if (n < 21) return null;
    const vols = history.map(h => h.volume);
    const avg20 = avg(vols.slice(n - 21, n - 1)); // 오늘 제외 직전 20일
    if (avg20 <= 0) return null;
    if (vols[n - 1] >= avg20 * 2) {
        const up = history[n - 1].price >= history[n - 2].price;
        const date = history[n - 1].date;
        if (up) {
            return {
                id: 'volume', type: 'positive', label: '거래량 급증(상승)', date,
                description: '평소보다 거래가 크게 늘며 올랐어요. 상승에 힘이 실린 모습이에요.',
            };
        }
        return {
            id: 'volume', type: 'caution', label: '거래량 급증(하락)', date,
            description: '평소보다 거래가 크게 늘며 내렸어요. 하락에 힘이 실린 모습이에요.',
        };
    }
    return null;
}

// ── 7. 외국인/기관 연속 순매수 (investor_history) ──
// 최근일부터 연속 순매수 일수 카운트. 3일 이상이면 신호.
async function detectInvestorFlow(code) {
    const { rows } = await pool.query(
        'SELECT date, institution, foreign_net FROM investor_history WHERE code = $1 ORDER BY date DESC LIMIT 10',
        [code]
    );
    if (rows.length === 0) return [];
    let fCount = 0;
    for (const r of rows) { if (Number(r.foreign_net) > 0) fCount++; else break; }
    let iCount = 0;
    for (const r of rows) { if (Number(r.institution) > 0) iCount++; else break; }

    const out = [];
    if (fCount >= 3 && iCount >= 3) {
        const days = Math.min(fCount, iCount);
        out.push({
            id: 'investor_both', type: 'positive', label: '수급 동반',
            description: `외국인과 기관이 ${days}일 연속 함께 사고 있어요. 수급이 좋은 편이에요. 단기 흐름만으로 판단하진 마세요.`,
        });
    } else {
        if (fCount >= 3) {
            out.push({
                id: 'investor_foreign', type: 'positive', label: '외국인 순매수',
                description: `외국인이 ${fCount}일 연속 사고 있어요. 단기 흐름만으로 판단하진 마세요.`,
            });
        }
        if (iCount >= 3) {
            out.push({
                id: 'investor_institution', type: 'positive', label: '기관 순매수',
                description: `기관이 ${iCount}일 연속 사고 있어요. 단기 흐름만으로 판단하진 마세요.`,
            });
        }
    }
    return out;
}

// ── 통합 ──
export async function computeSignals(code) {
    const cacheKey = `signals:${code}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const { rows } = await pool.query(
        'SELECT date, price, open, high, low, volume FROM stock_history WHERE code = $1 ORDER BY date ASC',
        [code]
    );
    const history = rows.map(h => ({
        date: h.date,
        price: Number(h.price),
        open: Number(h.open),
        high: Number(h.high),
        low: Number(h.low),
        volume: Number(h.volume),
    }));

    // 3.12차 P2 — stale 가드: 최신 history가 10일 이상 오래됐으면 신호 계산 중단.
    // 상장폐지·거래정지 종목이 6개월 전 데이터로 "어제 종가 기준" 신호를 내는 것을 구조적으로 차단.
    if (history.length > 0) {
        const latestDate = history[history.length - 1].date; // 'YYYYMMDD'
        const iso = `${latestDate.slice(0, 4)}-${latestDate.slice(4, 6)}-${latestDate.slice(6, 8)}`;
        const daysSince = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        if (daysSince > 10) {
            const staleResult = {
                signals: [],
                consensus: {
                    positive: 0, caution: 0, total: 0,
                    summary: '최근 데이터를 수집하지 못해 신호를 계산할 수 없어요. 거래가 중단된 종목일 수 있어요.',
                },
                asOf: `${iso} 기준 (오래된 데이터)`,
                stale: true,
            };
            setCache(cacheKey, staleResult);
            return staleResult;
        }
    }

    const signals = [];
    // 개별 신호 계산 — 하나가 던져도 나머지는 계속.
    for (const fn of [detectCross, detectBollingerSqueeze, detectRSI, detectMACD, detectOBV, detectVolumeSpike]) {
        try {
            const s = fn(history);
            if (s) signals.push(s);
        } catch (e) {
            console.error(`Signal ${fn.name} failed for ${code}:`, e.message);
        }
    }
    try {
        const inv = await detectInvestorFlow(code);
        signals.push(...inv);
    } catch (e) {
        console.error(`Signal detectInvestorFlow failed for ${code}:`, e.message);
    }

    const positive = signals.filter(s => s.type === 'positive').length;
    const caution = signals.filter(s => s.type === 'caution').length;

    // B3 — 신호 '등급' 통보("대체로 긍정적인 흐름이에요", "관망이 안전할 수 있어요") 제거.
    // 개수는 사실이므로 남기고, 그 개수가 무엇을 뜻하는지 단정하지 않는다(저울질은 사용자 몫).
    let summary;
    if (signals.length === 0) {
        summary = '어제 종가 기준으로 잡힌 신호가 없어요.';
    } else if (positive === 0 && caution === 0) {
        // 방향 중립 신호(스퀴즈 등)만 있는 경우.
        summary = `방향이 정해지지 않은 중립 신호만 ${signals.length}개 잡혔어요.`;
    } else {
        summary = `우호 신호 ${positive}개, 주의 신호 ${caution}개가 잡혔어요. 개수가 많은 쪽이 정답은 아니니 각 신호를 직접 저울질해 주세요.`;
    }

    const result = {
        signals,
        consensus: { positive, caution, total: signals.length, summary },
        asOf: asOfLabel,
        markers: detectCrossHistory(history, 20),   // 3.12차 S5 — 차트 크로스 마커(최근 20일)
    };
    setCache(cacheKey, result);
    return result;
}
