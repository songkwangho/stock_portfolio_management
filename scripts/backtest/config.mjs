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
    AXES: ['technical', 'trend'],        // 세션1: 이 둘만. supply/value는 데이터 미비로 공란
    BENCHMARK: 'KOSPI',                  // market_index_history 심볼. 데이터 없으면 자동 skip
    MIN_CROSS_SECTION: 10,               // 횡단면 IC를 낼 최소 종목 수(그날 신호난 종목)
    TRADING_DAYS_PER_YEAR: 252,          // ICIR 연환산용
    OUT_DIR: 'scripts/backtest/out',     // 산출물(gitignore)
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
    // 참고용 부분합(기술+추세, 0~5). **밸류·수급 제외** — MarketOpinion 7/4 컷 검증이 아니다.
    partialSum: [
        { label: '[0,1)', min: 0, max: 1 },
        { label: '[1,2)', min: 1, max: 2 },
        { label: '[2,3)', min: 2, max: 3 },
        { label: '[3,4)', min: 3, max: 4 },
        { label: '[4,5]', min: 4, max: 5.0001 },
    ],
};
