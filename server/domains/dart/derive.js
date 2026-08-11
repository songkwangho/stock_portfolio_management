// Phase A — DART 재무제표에서 '실적 성장 추세'·'현금흐름 질' 원시 사실을 뽑는 순수 모듈.
// DB 접근 없음 → 단위 테스트 대상. 계정 매핑은 helpers/dartAccounts.js의 canonical id를 그대로 쓴다
// (router.js와 같은 소스 — 중복 구현 금지).
//
// 안전(계산-문구 일치): 여기서는 **숫자 사실만** 만든다. 한국어 서술은 프론트
// lib/stockDetail/interpret.ts가 담당한다. 계산할 수 없는 값은 만들어내지 않고 null을 돌려준다.
//
// ⚠️ DART 손익·현금흐름은 **연초부터 누적(YTD)** 이다(반기=2Q누적, 3분기=3Q누적, 사업=연간).
//    그래서 비교는 반드시 **같은 분기끼리(YoY)** 한다 — 3Q누적 vs 3Q누적.
//    직전 분기와 비교하면 누적 기간이 달라 무의미하다.

const QUARTER_ORDER = { '1Q': 1, '2Q': 2, '3Q': 3, '4Q': 4 };

// 분모가 0 이하이면 변화율을 만들지 않는다 — 적자→흑자 같은 전환에서 음수 나눗셈이
// 부호가 뒤집힌 거짓 %를 만든다(예: -100 → 50 이면 -150%가 아니라 '흑자 전환'이 사실).
function changePct(current, previous) {
    if (current == null || previous == null) return null;
    if (previous <= 0) return null;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}

// current/previous 부호로 전환 여부를 사실 그대로 분류(퍼센트를 못 쓰는 경우의 대안 서술용).
function turnaround(current, previous) {
    if (current == null || previous == null) return null;
    if (previous <= 0 && current > 0) return 'to_profit';    // 적자 → 흑자
    if (previous > 0 && current <= 0) return 'to_loss';      // 흑자 → 적자
    if (previous <= 0 && current <= 0) return 'stay_loss';   // 적자 지속
    return null;
}

// rows: [{ year, quarter, fs_div, account_id, amount }] (dart_financials 전 행)
// → { available, fsDiv, period, prevPeriod, growth, cashflow }
export function deriveFinancialTrends(rows) {
    const list = (rows || []).filter(r => r && r.year != null && r.quarter && r.account_id);
    if (list.length === 0) return { available: false };

    // 최신 기간 찾기 (year DESC, quarter DESC).
    const sorted = [...list].sort((a, b) =>
        (b.year - a.year) || ((QUARTER_ORDER[b.quarter] || 0) - (QUARTER_ORDER[a.quarter] || 0)));
    const latestYear = sorted[0].year;
    const latestQuarter = sorted[0].quarter;

    // fs_div 선택 — router.js와 동일 규칙: **최신 기간 기준** 연결(CFS) 우선, 없으면 별도(OFS).
    const latestRows = sorted.filter(r => r.year === latestYear && r.quarter === latestQuarter);
    const fsDiv = latestRows.some(r => r.fs_div === 'CFS') ? 'CFS' : 'OFS';

    const amt = {};
    for (const r of list) {
        if (r.fs_div !== fsDiv) continue;
        amt[`${r.year}|${r.quarter}|${r.account_id}`] = r.amount == null ? null : Number(r.amount);
    }
    const get = (year, quarter, id) => {
        const v = amt[`${year}|${quarter}|${id}`];
        return v == null || !Number.isFinite(v) ? null : v;
    };

    const prevYear = latestYear - 1;   // 같은 분기 전년 동기 (YTD 누적 정합)
    const period = `${latestYear} ${latestQuarter}`;
    const prevPeriod = `${prevYear} ${latestQuarter}`;

    // ── A1 실적 성장: 매출 + 이익(영업이익 우선, 없으면 당기순이익) YoY ──
    const revCur = get(latestYear, latestQuarter, 'revenue');
    const revPrev = get(prevYear, latestQuarter, 'revenue');

    let profitId = 'operating_income';
    let profCur = get(latestYear, latestQuarter, 'operating_income');
    let profPrev = get(prevYear, latestQuarter, 'operating_income');
    if (profCur == null || profPrev == null) {
        const nCur = get(latestYear, latestQuarter, 'net_income');
        const nPrev = get(prevYear, latestQuarter, 'net_income');
        if (nCur != null && nPrev != null) { profitId = 'net_income'; profCur = nCur; profPrev = nPrev; }
    }

    const growth = (revCur != null && revPrev != null) || (profCur != null && profPrev != null)
        ? {
            available: true,
            revenue: revCur != null && revPrev != null
                ? { current: revCur, previous: revPrev, changePct: changePct(revCur, revPrev), turnaround: turnaround(revCur, revPrev) }
                : null,
            profit: profCur != null && profPrev != null
                ? { account: profitId, label: profitId === 'operating_income' ? '영업이익' : '당기순이익',
                    current: profCur, previous: profPrev, changePct: changePct(profCur, profPrev), turnaround: turnaround(profCur, profPrev) }
                : null,
        }
        : { available: false };

    // ── A2 현금흐름 질: 영업활동현금흐름 vs 당기순이익 (같은 기간·같은 fs_div) ──
    const cfo = get(latestYear, latestQuarter, 'cf_operating');
    const net = get(latestYear, latestQuarter, 'net_income');
    const cashflow = cfo != null
        ? {
            available: true,
            operating: cfo,
            netIncome: net,
            // 순이익이 0 이하면 배수는 의미가 없다(부호 뒤집힘) → null. 부호 사실만 남긴다.
            ratio: net != null && net > 0 ? Number((cfo / net).toFixed(2)) : null,
        }
        : { available: false };

    return { available: true, fsDiv, period, prevPeriod, growth, cashflow };
}
