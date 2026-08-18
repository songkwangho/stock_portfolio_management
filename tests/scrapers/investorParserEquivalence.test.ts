// 투자자 파서 통합 동치 — 라이브 적재 경로가 backfill과 **같은 표를 같게 읽는지** 고정한다.
//
// 배경: 네이버 frgn 표를 세 곳이 각자 파싱했고(service.js 인라인 정규식 / naver.js
// scrapeInvestorData(죽음) / naverInvestor.js parseInvestorRows), 그 드리프트가 `individual`
// 값 불일치로 드러났다. 이제 파서는 `parseInvestorRows` 하나다.
//
// 이 테스트는 삭제된 인라인 정규식을 **레거시 참조 구현**으로 박제해 두고 실제 HTML 픽스처에서
// 두 경로가 일치함을 단언한다 — 세션 1 `computeTechnicalFromHistory` 동치 테스트와 같은 규율.
// (리팩터 안전망이 아니라 "적재 결과가 바뀌지 않았다"는 증거다.)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseInvestorRows } from '@/server/scrapers/naverInvestor';

// 실물 픽스처: finance.naver.com/item/frgn.naver?code=005930&page=1 의 type2 표(EUC-KR 디코드 후).
// 공개 시세 페이지라 민감정보 없음.
const FIXTURE = fs.readFileSync(
    path.join(process.cwd(), 'tests/fixtures/naver-frgn-005930.html'),
    'utf-8'
);

type Entry = { date: string; institution: number; foreign: number; individual: null };

// ── 레거시 참조 구현 (service.js에서 제거된 인라인 정규식 그대로) ──────────
// 그룹: 1=날짜 2=종가 3=거래량 4=기관순매매 5=외국인순매매
const LEGACY_RE = /<tr.*?>\s*<td.*?><span.*?>([\d.]{10})<\/span><\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?>[\s\S]*?<\/td>\s*<td.*?><span.*?>([\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>\s*<td.*?><span.*?>([+-]?[\d,]+)<\/span><\/td>/g;

function legacyParse(html: string) {
    const re = new RegExp(LEGACY_RE.source, 'g');
    const out: Entry[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && out.length < 20) {
        out.push({
            date: m[1].replace(/\./g, ''),
            institution: parseInt(m[4].replace(/,/g, ''), 10),
            foreign: parseInt(m[5].replace(/,/g, ''), 10),
            individual: null,
        });
    }
    return out;
}

// service.js가 실제로 만드는 형태 — parseInvestorRows 결과를 응답 계약(`foreign` 키)으로 옮긴다.
// 반환 타입을 명시한다: parseInvestorRows는 무타입 JS(ambient shim)라 추론하면 any[]가 된다.
function currentParse(html: string): Entry[] {
    return parseInvestorRows(html).slice(0, 20).map((r: {
        date: string; institution: number; foreign_net: number; individual: null;
    }) => ({
        date: r.date,
        institution: r.institution,
        foreign: r.foreign_net,
        individual: r.individual,
    }));
}

describe('투자자 파서 통합 — 레거시 인라인 정규식 == parseInvestorRows', () => {
    const legacy = legacyParse(FIXTURE);
    const current = currentParse(FIXTURE);

    it('픽스처가 실제로 데이터를 담고 있다 (비공회전 가드)', () => {
        // 둘 다 0행이면 아래 동치 단언이 공회전한다 — 먼저 표본이 있는지 확인한다.
        expect(legacy.length).toBeGreaterThanOrEqual(15);
        expect(legacy.some(r => r.institution !== 0)).toBe(true);
        expect(legacy.some(r => r.foreign !== 0)).toBe(true);
        // 부호가 실제로 섞여 있어야 부호 처리 동치가 의미를 갖는다
        const signs = new Set(legacy.map(r => Math.sign(r.institution)));
        expect(signs.size).toBeGreaterThan(1);
    });

    it('행 수가 같다', () => {
        expect(current.length).toBe(legacy.length);
    });

    it('date·institution·foreign이 전 행 완전 일치', () => {
        expect(current).toEqual(legacy);
    });

    it('individual은 양쪽 다 null — 측정 안 한 값을 만들지 않는다', () => {
        expect(current.every(r => r.individual === null)).toBe(true);
        expect(legacy.every(r => r.individual === null)).toBe(true);
    });

    it('20행 상한을 지킨다 (옛 matches.length < 20 계약)', () => {
        expect(current.length).toBeLessThanOrEqual(20);
    });

    it('service.js는 .reverse()로 오름차순 적재한다 — 순서 계약 확인', () => {
        // parseInvestorRows는 페이지 순서(최신 우선) → reverse하면 과거→최신
        const ascending = [...current].reverse();
        for (let i = 1; i < ascending.length; i++) {
            expect(ascending[i].date > ascending[i - 1].date).toBe(true);
        }
    });

    it('부호(순매도)를 보존한다 — 픽스처의 음수가 그대로 나온다', () => {
        const negatives = legacy.filter(r => r.institution < 0);
        expect(negatives.length).toBeGreaterThan(0);
        for (const n of negatives) {
            const match = current.find(c => c.date === n.date)!;
            expect(match.institution).toBe(n.institution);
            expect(match.institution).toBeLessThan(0);
        }
    });
});
