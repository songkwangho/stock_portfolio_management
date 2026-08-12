// Technical Indicators Calculation (RSI, MACD, Bollinger) with beginner-friendly summary
// 각 지표마다 *_available 플래그를 함께 반환한다 (sma_available과 동일 패턴).
// UI는 플래그가 false일 때 "데이터 수집 중" 안내를 표시해야 한다.
// 필요 히스토리: RSI 15일, MACD 26일, 볼린저밴드 20일 (해당 일수가 없으면 false)
//
// PostgreSQL 전환: pool/async 시그니처. pg는 NUMERIC/BIGINT를 string으로 반환하므로 Number() 캐스팅.
export async function calculateIndicators(pool, code) {
    const { rows: rawHistory } = await pool.query(
        'SELECT date, price, open, high, low, volume FROM stock_history WHERE code = $1 ORDER BY date ASC',
        [code]
    );
    const history = rawHistory.map(h => ({
        date: h.date,
        price: Number(h.price),
        open: Number(h.open),
        high: Number(h.high),
        low: Number(h.low),
        volume: Number(h.volume),
    }));

    const histLen = history.length;
    const availability = {
        rsi_available: histLen >= 15,
        macd_available: histLen >= 26,
        bollinger_available: histLen >= 20,
        history_days: histLen,
    };

    if (histLen < 2) {
        return { rsi: null, macd: null, bollinger: null, summary: null, ...availability };
    }

    const prices = history.map(h => h.price);

    // RSI (14-day)
    let rsi = null;
    if (prices.length >= 15) {
        let gains = 0, losses = 0;
        for (let i = prices.length - 14; i < prices.length; i++) {
            const diff = prices[i] - prices[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        const avgGain = gains / 14;
        const avgLoss = losses / 14;
        rsi = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
    }

    // MACD (12, 26, 9)
    let macd = null;
    if (prices.length >= 26) {
        const ema = (data, period) => {
            const k = 2 / (period + 1);
            let emaVal = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
            for (let i = period; i < data.length; i++) {
                emaVal = data[i] * k + emaVal * (1 - k);
            }
            return emaVal;
        };
        const ema12 = ema(prices, 12);
        const ema26 = ema(prices, 26);
        const macdLine = parseFloat((ema12 - ema26).toFixed(0));
        const recentMacds = [];
        for (let i = Math.max(26, prices.length - 20); i <= prices.length; i++) {
            const slice = prices.slice(0, i);
            if (slice.length >= 26) recentMacds.push(ema(slice, 12) - ema(slice, 26));
        }
        const signal = recentMacds.length >= 9
            ? parseFloat((recentMacds.slice(-9).reduce((a, b) => a + b, 0) / 9).toFixed(0))
            : macdLine;
        const histogram = parseFloat((macdLine - signal).toFixed(0));
        macd = { macdLine, signal, histogram };
    }

    // Bollinger Bands (20, 2)
    let bollinger = null;
    if (prices.length >= 20) {
        const recent20 = prices.slice(-20);
        const sma20 = recent20.reduce((a, b) => a + b, 0) / 20;
        const stdDev = Math.sqrt(recent20.reduce((a, p) => a + Math.pow(p - sma20, 2), 0) / 20);
        const upper = Math.round(sma20 + 2 * stdDev);
        const lower = Math.round(sma20 - 2 * stdDev);
        const currentPrice = prices[prices.length - 1];
        const percentB = stdDev > 0 ? parseFloat(((currentPrice - lower) / (upper - lower) * 100).toFixed(1)) : 50;
        bollinger = { upper, middle: Math.round(sma20), lower, percentB };
    }

    // Summary for beginners
    const details = [];
    if (rsi !== null) {
        // 방향 예측('쉬어갈/반등할 수 있어요') 제거 — 지표가 재는 것(최근 14일 등락폭)만 말한다.
        if (rsi >= 70) details.push({ indicator: 'RSI', signal: '과매수', description: '최근 14일 오름폭이 큰 구간이에요.', color: 'red' });
        else if (rsi <= 30) details.push({ indicator: 'RSI', signal: '과매도', description: '최근 14일 내림폭이 큰 구간이에요.', color: 'green' });
        else details.push({ indicator: 'RSI', signal: '보통', description: '최근 14일 등락폭이 보통 수준이에요.', color: 'neutral' });
    }
    if (macd) {
        // MACD는 '매수/매도 힘'을 재지 않는다 — 두 이동평균의 간격이다. 재는 값 그대로 서술.
        if (macd.histogram > 0) details.push({ indicator: 'MACD', signal: '단기선 우위', description: '단기 이동평균이 장기 이동평균 위에 있어요.', color: 'green' });
        else details.push({ indicator: 'MACD', signal: '장기선 우위', description: '단기 이동평균이 장기 이동평균 아래에 있어요.', color: 'red' });
    }
    if (bollinger) {
        if (bollinger.percentB > 80) details.push({ indicator: '볼린저밴드', signal: '상단 근접', description: '주가가 평소보다 많이 올라간 상태예요.', color: 'red' });
        else if (bollinger.percentB < 20) details.push({ indicator: '볼린저밴드', signal: '하단 근접', description: '주가가 평소보다 많이 내려간 상태예요.', color: 'green' });
        else details.push({ indicator: '볼린저밴드', signal: '중간', description: '주가가 평균 부근에서 움직이고 있어요.', color: 'neutral' });
    }

    // M5 — 세 지표를 하나로 뭉친 판정(signal: 긍정적/주의/중립 + "여러 지표가 긍정적인 신호를
    // 보이고 있어요")을 **개수 균형 요약**으로 바꾼다. 다수결로 방향을 통보하는 건 R2에서
    // 걷어낸 market_opinion 배지와 같은 형태다 — 어느 지표가 세고 약한지는 아래 개별 카드가
    // 이미 보여주고, 무엇을 더 무겁게 볼지는 사용자가 정한다.
    // signal은 프론트가 방향색·배지로 쓰던 필드라 제거한다(남기면 색으로 판정이 되살아난다).
    // 임계·색 분류(green/red/neutral)는 개별 카드용으로 그대로 유지 — provisional.
    const upCount = details.filter(d => d.color === 'green').length;
    const downCount = details.filter(d => d.color === 'red').length;
    const flatCount = details.filter(d => d.color === 'neutral').length;
    const parts = [];
    if (upCount) parts.push(`상승 쪽 ${upCount}개`);
    if (downCount) parts.push(`하락 쪽 ${downCount}개`);
    if (flatCount) parts.push(`중립 ${flatCount}개`);
    const description = details.length === 0
        ? '지표를 계산할 데이터가 아직 부족해요.'
        : `관찰한 지표 ${details.length}개 중 ${parts.join(' · ')}예요.`
          + (upCount && downCount ? ' 지표끼리 서로 엇갈려요.' : '')
          + ' 어느 지표를 더 무겁게 볼지는 직접 판단해 주세요. 아직 백테스팅으로 검증된 기준은 아니에요.';
    const summary = { counts: { up: upCount, down: downCount, flat: flatCount }, description, details };

    return { rsi, macd, bollinger, summary, ...availability };
}
