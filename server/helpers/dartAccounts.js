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
    //
    // 손익 계정은 IS(손익계산서) + CIS(포괄손익계산서) 양쪽에서 받는다.
    //
    // 처음엔 이중 매칭이 걱정돼 IS만 봤는데(부트 샘플: net_income 10건 매칭 → unique 9),
    // 그 결과 **단일 포괄손익계산서로 보고하는 회사는 손익 계정이 통째로 누락**됐다.
    // IFRS는 손익을 (a) IS + CIS 2표 또는 (b) CIS 1표 중 하나로 낼 수 있는데, (b)를 고르면
    // 매출·영업이익·순이익이 전부 CIS에만 실린다. 실제로 유유제약(000220)은 적재 후에도
    // dart_financials에 손익 3계정이 0건이었다(자산·부채·자본·현금흐름만). 재료가 없으니
    // derive.js의 성장(YoY)·현금흐름 질(cf_operating ÷ net_income)이 계산되지 않는다.
    //
    // 이중 매칭은 세 겹으로 막혀 있어 CIS를 열어도 안전하다:
    //   1) sync-dart-financials.js의 **first-wins 디둡** — pk가 (year|quarter|fsDiv|canonical id)
    //      라 sj_div를 포함하지 않는다. 같은 계정이 IS·CIS 양쪽에 있으면 먼저 온 하나만 남는다.
    //   2) 그 '먼저'를 API 응답 순서에 맡기지 않고 orderBySection()으로 **IS 우선을 고정**한다
    //      (아래 SJ_PRIORITY). 2표 보고 회사는 항상 IS 값이 저장된다.
    //   3) NAME_EXCLUDE('기타포괄'…) + nameKeys **정확 일치** — CIS 뒤쪽의 기타포괄손익·
    //      총포괄손익·귀속 라인은 애초에 매칭되지 않는다.
    // 매출·순이익은 IS·CIS에 같은 값이 실리므로 어느 쪽이 남아도 값은 동일하다.
    { id: 'revenue',          section: 'income',   label: '매출액',          sjDiv: ['IS', 'CIS'], stdIds: ['ifrs-full_Revenue', 'ifrs_Revenue'], nameKeys: ['매출액', '수익(매출액)', '영업수익'] },
    // 영업이익은 2표 보고의 CIS엔 없는 게 보통이다(있으면 단일표). 없어도 무해 —
    // derive.js가 영업이익을 못 찾으면 당기순이익으로 폴백한다.
    { id: 'operating_income', section: 'income',   label: '영업이익',        sjDiv: ['IS', 'CIS'], stdIds: ['dart_OperatingIncomeLoss', 'ifrs-full_ProfitLossFromOperatingActivities'], nameKeys: ['영업이익', '영업이익(손실)'] },
    { id: 'net_income',       section: 'income',   label: '당기순이익',      sjDiv: ['IS', 'CIS'], stdIds: ['ifrs-full_ProfitLoss'], nameKeys: ['당기순이익', '당기순이익(손실)', '분기순이익', '분기순이익(손실)', '반기순이익', '반기순이익(손실)'] },
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

// 재무제표 섹션 처리 순서. 손익을 IS→CIS 순으로 고정하려고 둔다.
// (BS/CF/SCE의 상대 순서는 canonical id가 겹치지 않아 의미 없지만, 전 섹션을 나열해
//  '표에 없는 sj_div'만 뒤로 밀리게 한다.)
export const SJ_PRIORITY = { BS: 0, IS: 1, CIS: 2, CF: 3, SCE: 4 };

// DART 계정 목록을 섹션 우선순위로 **안정 정렬**한다.
//
// 왜 필요한가: 적재 쪽 디둡이 first-wins라, 같은 계정이 IS와 CIS에 모두 있을 때
// '어느 쪽이 먼저 오느냐'가 저장 값을 결정한다. DART가 IS를 먼저 준다고 알려져 있지만
// 그건 문서화된 계약이 아니라 관찰이다 — 응답 순서에 정확도를 걸지 않고 여기서 고정한다.
//
// **안정 정렬이어야 한다**: 섹션 안의 원래 순서(DART가 합계를 하위·귀속 라인보다 먼저
// 나열하는 관례)가 보존돼야 first-wins가 계속 '합계'를 고른다. Array#sort는 ES2019부터
// 안정성이 보장되므로 그대로 쓴다.
export function orderBySection(items) {
    const rank = (it) => SJ_PRIORITY[String(it?.sj_div || '').trim()] ?? 99;
    return [...(items || [])].sort((a, b) => rank(a) - rank(b));
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
