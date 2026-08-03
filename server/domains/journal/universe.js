// 유니버스 확장(T2) — 거래일지 종목 식별 인덱스. 순수(DB 의존 없음) → 단위 테스트 가능.
//
// 왜 분리했나: journal 매핑 대상을 187 stocks → 전 상장목록 stocks_directory(~2,600)로 넓히면
// 동명 종목(중복 상호·우선주 접미사)이 실재한다. 잘못된 코드로 때우면 지표가 조용히 오염되므로,
// 종목명→코드는 **정확 일치(공백 제거)로 유일할 때만** 매핑한다. 모호하면 매핑하지 않고
// 호출부에서 unmatched로 남겨 지속 캐비엇(C-1)이 투명 고지한다 — "오매핑보다 skip이 안전".

// 종목명 정규화(공백 제거)로 매핑 견고화.
export const norm = (s) => String(s || '').replace(/\s/g, '');

// universe: [{ code, name }] → { codeSet, nameToCode }
//   codeSet   — 6자리 코드 직매핑용(전 상장 코드)
//   nameToCode — norm(name) → code. **유일 매핑만** 포함(동명이면 제외).
export function buildNameIndex(universe) {
    const codeSet = new Set();
    const byName = new Map();   // norm(name) → Set(codes) — 충돌 감지용
    for (const r of universe || []) {
        if (r.code) codeSet.add(r.code);
        if (r.name) {
            const key = norm(r.name);
            let set = byName.get(key);
            if (!set) { set = new Set(); byName.set(key, set); }
            if (r.code) set.add(r.code);
        }
    }
    const nameToCode = new Map();
    for (const [key, codes] of byName) if (codes.size === 1) nameToCode.set(key, [...codes][0]);
    return { codeSet, nameToCode };
}
