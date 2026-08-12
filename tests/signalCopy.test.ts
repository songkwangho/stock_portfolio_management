import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_BASE } from './forbiddenWords';

// signals.js(7종 관찰 신호)·indicators.js(개별 지표 카드)의 사용자 노출 문구를 스윕한다.
//
// 이 파일들의 detect 함수는 모듈 내부 함수라 import로 호출할 수 없고, computeSignals는 DB를
// 잡는다. 그래서 **소스에서 문자열 리터럴을 뽑아 정적으로 검사**한다 — export를 강제하는
// 리팩터 없이도 문구 재유입을 막을 수 있고, 새 분기를 추가해도 자동으로 걸린다.

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../server/domains/analysis/${rel}`, import.meta.url)), 'utf8');

// description / label / signal 의 문자열 값만 수집한다.
//
// 두 가지를 반드시 지켜야 스윕이 제 역할을 한다:
//  1) **주석 먼저 제거.** 주석에는 "'매수 힘'을 제거했다" 같은 이력을 적는데, 이를 훑으면
//     기록을 남길수록 테스트가 깨진다. (실제로 M5 주석의 `signal:` 언급이 잡혔었다.)
//  2) **행머리 앵커 금지.** signals.js는 한 줄에 한 키씩이지만 indicators.js는
//     `details.push({ indicator: 'RSI', signal: '과매수', description: '…' })`처럼 인라인이다.
//     앵커를 걸면 0건이 잡히고 스윕이 조용히 공회전한다(아래 최소 개수 단언이 이걸 잡았다).
// 따옴표 3종('/"/백틱)을 모두 받되 같은 따옴표로 닫히는 구간만 캡처한다 — 백틱 템플릿을
// 홑따옴표 규칙으로 읽으면 코드까지 함께 삼킨다.
function userFacingStrings(code: string): string[] {
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, '')     // 블록 주석
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 행 주석 (URL의 '//'는 앞 문자가 ':'라 보존)
  const out: string[] = [];
  const re = /\b(?:description|label|signal):\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const m of stripped.matchAll(re)) out.push(m[2]);
  return out;
}

// 이 표면에서 실제로 걷어낸 표현. 재유입되면 즉시 실패한다.
const FORBIDDEN_SIGNAL = [
  ...FORBIDDEN_BASE,
  '매수 힘', '매도 힘', '힘이 실린', '힘이 약',      // MACD·거래량이 재지 않는 '힘' 프레이밍
  '세력', '매집',                                   // 확인 불가능한 주체·의도 추측
  '위로 돌아섰', '아래로 돌아섰',                    // 방향 전환 단정
  '긍정적 추세', '강세', '좋은 신호',                 // 스윕 전역 공통 verdict
];

describe('관찰 신호 문구 — 사용자 노출 문자열 스윕', () => {
  for (const file of ['signals.js', 'indicators.js']) {
    it(`${file}: 노출 문구에 금지 표현이 없다`, () => {
      const strings = userFacingStrings(src(file));
      // 수집이 실패하면 스윕이 공회전한다 → 최소 개수를 못 박는다.
      expect(strings.length, `${file}에서 문구를 못 뽑았다`).toBeGreaterThan(5);
      for (const t of strings) {
        for (const w of FORBIDDEN_SIGNAL) {
          expect(t.includes(w), `${file} "${t}" 에 금지 표현 "${w}" 포함`).toBe(false);
        }
      }
    });
  }

  it('MACD 문구가 두 파일에서 같은 기준(이동평균 위치)을 쓴다', () => {
    // indicators.js와 signals.js가 갈리면 한쪽이 다시 '힘' 서술로 돌아간 것이다.
    const all = [...userFacingStrings(src('signals.js')), ...userFacingStrings(src('indicators.js'))];
    const macd = all.filter(t => t.includes('MACD') || t.includes('이동평균') || t.includes('단기선'));
    expect(macd.length).toBeGreaterThan(0);
    for (const t of macd) {
      expect(t.includes('힘'), `"${t}"`).toBe(false);
    }
  });
});
