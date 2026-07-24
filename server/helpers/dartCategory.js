// 4.5a차 — DART 공시 보고서명(report_nm) 규칙 기반 분류. AI 없음, 순수 문자열 매칭.
//
// ⚠️ 분류는 **표시용**이지 신호가 아니다. 어떤 카테고리도 호재/악재 판정을 하지 않는다.
//    (예: 유상증자 = 나쁨 같은 단정 금지.) label은 중립 뱃지 문구, hint는 중립 설명.
//
// 순서 주의: '주요사항보고서(유상증자결정)'처럼 major 래퍼 안에 구체 이벤트가 들어오므로
//           구체 키워드(증자/감자/배당/자사주 등)를 major보다 먼저 검사한다.

const RULES = [
    { category: 'capital_increase', label: '증자', keywords: ['유상증자', '무상증자'] },
    { category: 'capital_decrease', label: '감자', keywords: ['감자'] },
    { category: 'dividend',         label: '배당', keywords: ['배당'] },
    { category: 'treasury',         label: '자사주', keywords: ['자기주식', '자사주'] },
    { category: 'earnings',         label: '실적', keywords: ['사업보고서', '분기보고서', '반기보고서', '결산실적', '잠정실적', '영업실적'] },
    { category: 'merger',           label: '구조변경', keywords: ['합병', '분할', '영업양수', '영업양도'] },
    // 주가 급변 시 자주 나오는 유형 — 별도 카테고리로 초보자에게 맥락 제공(과분류 아님, 빈발·의미 명확).
    { category: 'clarification',    label: '해명', keywords: ['풍문', '조회공시'] },
    { category: 'major',            label: '주요사항', keywords: ['주요사항보고서'] },
];

// 초보자용 중립 설명 (호재/악재 아님).
const HINTS = {
    earnings: '실적을 담은 정기·수시 보고서예요.',
    capital_increase: '주식 수가 늘 수 있어요. 기존 주주 지분이 희석될 수 있어요.',
    capital_decrease: '주식 수가 줄어드는 결정이에요.',
    dividend: '배당 관련 결정이에요.',
    treasury: '회사가 자기 주식을 사거나 파는 결정이에요.',
    merger: '사업 구조가 바뀌는 결정이에요 (합병·분할 등).',
    clarification: '회사가 소문·보도에 대해 입장을 밝힌 공시예요.',
    major: '회사의 중요한 변동을 알리는 보고서예요.',
    other: '그 밖의 공시예요.',
};

// report_nm → { category, label }. 매칭 없으면 other.
// report_nm에 꼬리 공백이 흔해(예: "...해명(미확정)        ") 매칭 전 trim.
export function categorizeDisclosure(reportNm) {
    const name = (typeof reportNm === 'string' ? reportNm : '').trim();
    for (const rule of RULES) {
        if (rule.keywords.some(kw => name.includes(kw))) {
            return { category: rule.category, label: rule.label };
        }
    }
    return { category: 'other', label: '기타' };
}

// category id → 초보자 중립 설명.
export function categoryHint(category) {
    return HINTS[category] || HINTS.other;
}

// category id → 뱃지 라벨 (endpoint에서 categoryLabel 구성용).
export function categoryLabel(category) {
    const found = RULES.find(r => r.category === category);
    return found ? found.label : '기타';
}

// ─────────────────────────────────────────────────────────────
// 4.5a차 — 초보자에게 노이즈인 공시 제외(블랙리스트).
// 삼성전자는 월 778건 공시 중 대부분이 임원·주요주주 소유상황보고서라 초보자에게 무의미.
// ⚠️ other 전체를 버리지 않는다 — 분류 못 한 신규 유형이 섞일 수 있으므로, **명시 패턴만** 제외.
// 중간점(ㆍ/·) 변형에 견디도록 점 없는 핵심 부분문자열로 매칭한다(공백 제거 후 includes).
// ─────────────────────────────────────────────────────────────
export const NOISE_PATTERNS = [
    '특정증권등소유상황보고서',   // 임원ㆍ주요주주 소유상황 (가장 다발)
    '대량보유상황보고서',          // 주식등의 대량보유(5%) 보고
    '의결권대리행사권유',          // 위임장 권유 참고서류
];

// report_nm이 노이즈 패턴에 걸리면 true(=미저장). 그 외(분류 안 된 other 포함)는 false(=저장).
export function isNoise(reportNm) {
    const name = (typeof reportNm === 'string' ? reportNm : '').replace(/\s/g, '');
    return NOISE_PATTERNS.some(p => name.includes(p.replace(/\s/g, '')));
}
