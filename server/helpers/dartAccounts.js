// 4.5a차 — DART 재무제표(fnlttSinglAcntAll)에서 [기업] 탭에 쓸 핵심 계정만 표준화.
//
// DART는 회사·기간마다 계정을 100+개 반환하고, 표준계정코드가 없는 항목은 account_id가
// '-표준계정코드 미사용-'로 중복돼 (code,year,quarter,fs_div,account_id) PK 충돌을 유발한다.
// 그래서 우리가 필요한 계정만 골라 **canonical id**로 저장한다(PK 안정, 엔드포인트 단순).
//
// 매칭(운영자 조건 3): 1차 표준 account_id, 2차 account_nm 키워드. 둘 다 실패하면 skip.
// sj_div로 섹션을 먼저 가둬 손익/현금흐름의 '영업' 계정이 서로 섞이지 않게 한다.

// nameKeys는 **정확 일치**용(공백 제거 후 ===). 부분 일치는 귀속·계속영업 하위라인을
// 합계로 오인하므로 금지 — 합계의 이름 변형(예: '영업이익(손실)')을 명시 나열한다.
export const TARGET_ACCOUNTS = [
    // section: 'income' | 'balance' | 'cashflow'
    // 손익 계정은 IS(손익계산서)만 — 포괄손익계산서(CIS)에도 순이익이 실려 이중 매칭·PK 충돌을
    // 유발했다(부트 샘플: net_income 10건 매칭 → unique 9). CIS 순이익은 IS와 동일 값이거나
    // 포괄손익 조정이 섞여 초보자에게 혼란이라 제외한다(문제 2, 권장 A).
    { id: 'revenue',          section: 'income',   label: '매출액',          sjDiv: ['IS'], stdIds: ['ifrs-full_Revenue', 'ifrs_Revenue'], nameKeys: ['매출액', '수익(매출액)', '영업수익'] },
    { id: 'operating_income', section: 'income',   label: '영업이익',        sjDiv: ['IS'], stdIds: ['dart_OperatingIncomeLoss', 'ifrs-full_ProfitLossFromOperatingActivities'], nameKeys: ['영업이익', '영업이익(손실)'] },
    { id: 'net_income',       section: 'income',   label: '당기순이익',      sjDiv: ['IS'], stdIds: ['ifrs-full_ProfitLoss'], nameKeys: ['당기순이익', '당기순이익(손실)', '분기순이익', '분기순이익(손실)', '반기순이익', '반기순이익(손실)'] },
    { id: 'assets',           section: 'balance',  label: '자산총계',        sjDiv: ['BS'], stdIds: ['ifrs-full_Assets'], nameKeys: ['자산총계'] },
    { id: 'liabilities',      section: 'balance',  label: '부채총계',        sjDiv: ['BS'], stdIds: ['ifrs-full_Liabilities'], nameKeys: ['부채총계'] },
    { id: 'equity',           section: 'balance',  label: '자본총계',        sjDiv: ['BS'], stdIds: ['ifrs-full_Equity'], nameKeys: ['자본총계'] },
    { id: 'cf_operating',     section: 'cashflow', label: '영업활동현금흐름', sjDiv: ['CF'], stdIds: ['ifrs-full_CashFlowsFromUsedInOperatingActivities'], nameKeys: ['영업활동현금흐름', '영업활동으로인한현금흐름'] },
    { id: 'cf_investing',     section: 'cashflow', label: '투자활동현금흐름', sjDiv: ['CF'], stdIds: ['ifrs-full_CashFlowsFromUsedInInvestingActivities'], nameKeys: ['투자활동현금흐름', '투자활동으로인한현금흐름'] },
    { id: 'cf_financing',     section: 'cashflow', label: '재무활동현금흐름', sjDiv: ['CF'], stdIds: ['ifrs-full_CashFlowsFromUsedInFinancingActivities'], nameKeys: ['재무활동현금흐름', '재무활동으로인한현금흐름'] },
];

// 2차 name 매칭에서 제외할 하위/귀속/구분 라인 — 합계가 아니라 세부 항목이라
// canonical 계정으로 오인되면 PK 충돌·오값을 유발한다
// (예: '지배기업 소유주 귀속 당기순이익', '비지배지분 순이익', '계속영업이익', '중단영업이익').
const NAME_EXCLUDE = ['지배', '비지배', '계속영업', '중단영업', '기타포괄'];

export const SECTIONS = ['income', 'balance', 'cashflow'];

const byId = Object.fromEntries(TARGET_ACCOUNTS.map(t => [t.id, t]));
export function accountMeta(id) { return byId[id] || null; }

// DART 계정 item → 매칭된 TARGET 또는 null. 1차 표준 id, 2차 account_nm 키워드.
export function matchAccount(item) {
    if (!item || typeof item !== 'object') return null;
    const sj = String(item.sj_div || '').trim();
    const accId = String(item.account_id || '').trim();
    const nmClean = String(item.account_nm || '').replace(/\s/g, '');

    // 1차: 표준 account_id (섹션 가드) — 가장 정확.
    for (const t of TARGET_ACCOUNTS) {
        if (!t.sjDiv.includes(sj)) continue;
        if (accId && t.stdIds.includes(accId)) return t;
    }
    // 2차: account_nm **정확 일치** (공백 제거). 부분 일치는 귀속/계속영업 하위라인을
    //      합계로 오인해 PK 충돌·오값을 유발하므로 금지. 하위/귀속 라인은 사전 배제.
    if (nmClean && !NAME_EXCLUDE.some(x => nmClean.includes(x))) {
        for (const t of TARGET_ACCOUNTS) {
            if (!t.sjDiv.includes(sj)) continue;
            if (t.nameKeys.some(k => nmClean === k.replace(/\s/g, ''))) return t;
        }
    }
    return null;
}

// reprt_code → 우리 quarter 표기. (11013=1Q, 11012=반기(누적2Q), 11014=3Q, 11011=사업(4Q))
export const REPRT_CODES = [
    { code: '11013', quarter: '1Q' },
    { code: '11012', quarter: '2Q' },
    { code: '11014', quarter: '3Q' },
    { code: '11011', quarter: '4Q' },
];
export function quarterOf(reprtCode) {
    return REPRT_CODES.find(r => r.code === reprtCode)?.quarter || null;
}
