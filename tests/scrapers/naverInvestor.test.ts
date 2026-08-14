// Phase 4 세션 3 — 투자자 순매매 파서(순수). 네트워크 없이 HTML만으로 검증한다.
//
// 실측 헤더(2026-08-14 frgn.naver):
//   날짜 · 종가 · 전일비 · 등락률 · 거래량 · 기관 순매매량 · 외국인 순매매량 · 외국인 보유주수 · 보유율
import { describe, it, expect } from 'vitest';
import { parseInvestorRows } from '@/server/scrapers/naverInvestor';

// 실제 페이지 구조를 축약한 픽스처(전일비·등락률에 img/span이 섞여 있는 것까지 재현).
const row = (date: string, inst: string, forn: string, hold = '3,100,000') => `
<tr onmouseover="mouseOver(this)">
  <td class="tc">${date}</td>
  <td class="num">70,000</td>
  <td class="num"><img src="/images/ico_up.gif" alt="상승"><span class="tah p11 red01">500</span></td>
  <td class="num"><span class="tah p11 red01">+0.72%</span></td>
  <td class="num">12,345,678</td>
  <td class="num">${inst}</td>
  <td class="num">${forn}</td>
  <td class="num">${hold}</td>
  <td class="num">52.31%</td>
</tr>`;

const page = (...rows: string[]) => `
<table class="type2">
  <tr><th>날짜</th><th>종가</th><th>전일비</th><th>등락률</th><th>거래량</th><th>기관</th><th>외국인</th></tr>
  <tr class="blank"><td colspan="9"></td></tr>
  ${rows.join('\n')}
</table>`;

describe('parseInvestorRows', () => {
    it('날짜를 YYYYMMDD로 정규화한다', () => {
        const r = parseInvestorRows(page(row('2026.08.13', '1,000', '2,000')));
        expect(r).toHaveLength(1);
        expect(r[0].date).toBe('20260813');
    });

    it('index 5=기관 · 6=외국인 순매매량을 집는다 (쉼표 제거)', () => {
        const r = parseInvestorRows(page(row('2026.08.13', '1,234,567', '7,654,321')));
        expect(r[0].institution).toBe(1234567);
        expect(r[0].foreign_net).toBe(7654321);
    });

    it('음수를 보존한다 — 순매도가 순매수로 뒤집히면 점수 부호가 통째로 바뀐다', () => {
        const r = parseInvestorRows(page(row('2026.08.13', '-1,234', '-56,789')));
        expect(r[0].institution).toBe(-1234);
        expect(r[0].foreign_net).toBe(-56789);
    });

    it('individual은 항상 null — 이 페이지엔 개인 순매매 컬럼이 없다', () => {
        // index 7은 '외국인 보유주수'다. 기존 라이브 스크래퍼는 이걸 individual로 넣고 있다.
        const r = parseInvestorRows(page(row('2026.08.13', '1', '2', '9,999,999')));
        expect(r[0].individual).toBeNull();
        // 보유주수가 어느 필드로도 새어 들어가지 않는지 확인
        expect(Object.values(r[0])).not.toContain(9999999);
    });

    it('헤더·빈 행·잘린 행을 건너뛴다', () => {
        const junk = '<tr><th>날짜</th><th>종가</th></tr><tr class="blank"><td colspan="9"></td></tr><tr><td>2026.08.13</td><td>1</td></tr>';
        expect(parseInvestorRows(page(junk))).toHaveLength(0);
    });

    it('날짜 형식이 아닌 첫 셀은 행 전체를 버린다', () => {
        expect(parseInvestorRows(page(row('합계', '1,000', '2,000')))).toHaveLength(0);
    });

    it('여러 행을 페이지 순서(최신 우선) 그대로 돌려준다', () => {
        const r = parseInvestorRows(page(
            row('2026.08.13', '1', '1'),
            row('2026.08.12', '2', '2'),
            row('2026.08.11', '3', '3'),
        ));
        expect(r.map((x: { date: string }) => x.date)).toEqual(['20260813', '20260812', '20260811']);
    });

    it('빈 입력·null에 던지지 않는다 (fail-soft)', () => {
        expect(parseInvestorRows('')).toEqual([]);
        expect(parseInvestorRows(null)).toEqual([]);
        expect(parseInvestorRows(undefined)).toEqual([]);
        expect(parseInvestorRows('<html>에러 페이지</html>')).toEqual([]);
    });

    it('0은 0으로 남는다 (결측과 구분되지 않지만 네이버가 실제로 0을 준다)', () => {
        const r = parseInvestorRows(page(row('2026.08.13', '0', '0')));
        expect(r[0].institution).toBe(0);
        expect(r[0].foreign_net).toBe(0);
    });
});
