// Phase 4 세션 1 — 백테스팅 하네스 상수 SSOT.
//
// ⚠️ 프레이밍: 이 하네스는 **내부 임계값 보정용**이다. 사용자에게 "오르는 확률"을 약속하는
//    물건이 아니고, 결과는 내부 문서에만 남는다. UI·R2 원칙은 불변.
//
// 재현성: 모든 설정을 여기 고정한다. 실행마다 값을 바꾸려면 이 파일을 고치고 그 diff를
// 리포트에 남긴다(커맨드라인 플래그로 슬쩍 바꾸면 무엇으로 만든 숫자인지 추적이 끊긴다).

export const CONFIG = {
    SEED: 20260813,                      // 고정 시드. 계산 자체는 결정적이라 샘플링에만 쓴다.
    HORIZONS: [5, 20, 60],               // forward return 거래일(N)
    MIN_HISTORY: 600,                    // 종목 최소 히스토리 행 → 178종목 유니버스
    MIN_WARMUP: 60,                      // 시점 t 이전 최소 봉 수(MACD 26 + 20 룩백, 볼린저 20)
    PERIOD: { start: null, end: null },   // null = 전체. 'YYYYMMDD'로 제한 가능
    TEST_HOLDOUT_FROM: null,             // sacred test set 시작일. null이면 신호일의 마지막 20%
    HOLDOUT_FRACTION: 0.2,               // TEST_HOLDOUT_FROM이 null일 때의 자동 분할 비율
    STEP_DAYS: 5,                        // 신호일 그리드 간격(거래일). 중첩 완화
    // 세션1: 기술·추세만. 세션3에서 수급을 추가 — investor_history backfill 후에만 표본이 생긴다
    // (미적재 상태로 돌리면 수급 표본이 0이라 IC 행이 '—'로 비고, 나머지 축은 그대로 나온다).
    // 밸류는 여전히 공란 — calculateValuationScore가 stocks 현재 스냅샷을 써서 look-ahead.
    AXES: ['technical', 'trend', 'supplyDemand'],

    // ── 세션 3: 수급축 ────────────────────────────────────────
    // 시점 t의 투자자 행 슬라이스 크기. 프로덕션 쿼리(`ORDER BY date DESC LIMIT 20`)와 맞춘다.
    SUPPLY_LOOKBACK_ROWS: 20,
    // 표본을 채택할 최소 행 수. **프로덕션과 의도적으로 다르다** — 프로덕션은 3행만 있어도
    // 점수를 내지만(그게 사용자에게 보여줄 수 있는 최선), 백테스트에서 얕은 창을 섞으면
    // 같은 날짜 횡단면 안에 서로 다른 깊이의 추정치가 들어가고, 무엇보다 `rows<3 → total:0`이
    // **"순매수 없음"과 구분되지 않는 가짜 0 덩어리**를 만든다(IC를 통째로 오염시킨다).
    // 그래서 창이 다 안 차면 점수를 내지 않고 표본에서 뺀다(억지 채움 금지 — 세션1 규율).
    SUPPLY_MIN_ROWS: 20,
    BENCHMARK: 'KOSPI',                  // market_index_history 심볼. 데이터 없으면 자동 skip
    MIN_CROSS_SECTION: 10,               // 횡단면 IC를 낼 최소 종목 수(그날 신호난 종목)
    TRADING_DAYS_PER_YEAR: 252,          // ICIR 연환산용
    OUT_DIR: 'scripts/backtest/out',     // 산출물(gitignore)

    // ── 세션 2: HoldingOpinion 정책 시뮬레이션 ────────────────
    // 손절 문턱 스윕. -0.07이 **변곡점인지 임의값인지**를 보는 게 목적이다.
    STOP_THRESHOLDS: [-0.05, -0.07, -0.10, -0.15],
    HOLDING_HORIZONS: [5, 20, 60],       // 보유 상한(거래일). HORIZONS와 같게 둔다
    // 청산 실행 지연(거래일). 0 = 트리거 당일 종가, 1 = 다음 거래일 종가.
    //
    // ⚠️ 0은 낙관적이다 — 종가는 장이 끝나야 알 수 있는데 그 종가로 파는 셈이다. 게다가
    //    프로덕션은 어제 종가로 판정해 다음날 08:00에 알림을 준다(alert 스케줄) → 실제
    //    사용자는 최소 1일 지연으로 움직인다. 손절 효과가 지연에 얼마나 민감한지가
    //    "−7%가 하방을 지킨다"는 결론의 강건성을 좌우하므로 **둘 다 낸다**.
    EXIT_LAG_DAYS: [0, 1],
    // 액면분할·무상증자 등으로 무수정 종가가 기계적으로 튀는 표본 처리.
    // 'exclude' = 1차 표에서 제외(별도 카운트), 'flag' = 포함하되 표시만.
    SPLIT_SCREEN: 'exclude',
    // 일일 가격제한폭(±30%)을 넘는 단일일 하락 = 기계적 변동 의심(분할 등).
    SPLIT_SUSPECT_DAILY_DROP: -0.30,
};

// 축 점수 버킷 경계 — **데이터에서 학습한 값이 아니라 점수 공간의 상수**다.
// 그래서 walk-forward에서 '학습 구간에서 경계를 정한다'는 절차가 필요 없다(적합할 게 없음).
// holdout은 그래도 따로 보고한다 — 관찰 자체의 일반화를 보려고.
export const BUCKETS = {
    // 기술 0~3 연속값 → 저/중/고
    technical: [
        { label: '[0,1)', min: 0, max: 1 },
        { label: '[1,2)', min: 1, max: 2 },
        { label: '[2,3]', min: 2, max: 3.0001 },
    ],
    // 추세는 이산값만 낸다(calculateTrendScore: 2.0 / 1.0 / 0.5 / 0.0)
    trend: [
        { label: '0.0 (양 이평선 아래)', min: -0.0001, max: 0.0001 },
        { label: '0.5 (20일선 위·5일선 아래)', min: 0.4999, max: 0.5001 },
        { label: '1.0 (5일선 위·역배열/데이터부족)', min: 0.9999, max: 1.0001 },
        { label: '2.0 (정배열)', min: 1.9999, max: 2.0001 },
    ],
    // 수급 0~2 — foreignScore(0~1.2) + instScore(0~0.8)의 합. 정규화 특성상 값이
    // 상단(1.2·2.0 부근)에 몰릴 수 있어 균등폭 4구간으로 두고 n을 함께 본다.
    supplyDemand: [
        { label: '[0.0,0.5)', min: -0.0001, max: 0.5 },
        { label: '[0.5,1.0)', min: 0.5, max: 1.0 },
        { label: '[1.0,1.5)', min: 1.0, max: 1.5 },
        { label: '[1.5,2.0]', min: 1.5, max: 2.0001 },
    ],
    // 참고용 부분합(기술+추세, 0~5). **밸류·수급 제외** — MarketOpinion 7/4 컷 검증이 아니다.
    // ⚠️ 세션3에서 수급축이 붙어도 이 정의는 **바꾸지 않는다** — 바꾸면 세션1 결과와 같은
    //    이름의 다른 숫자가 되어 비교가 끊긴다.
    partialSum: [
        { label: '[0,1)', min: 0, max: 1 },
        { label: '[1,2)', min: 1, max: 2 },
        { label: '[2,3)', min: 2, max: 3 },
        { label: '[3,4)', min: 3, max: 4 },
        { label: '[4,5]', min: 4, max: 5.0001 },
    ],
};
