// A차(주목 레이어) — 서버 원시 사실 → 중립 배지 문자열. 순수 함수(4.5b·4.5c interpret과 동일 구조).
//
// 안전 원칙(절대 준수):
// 1. **R2 — 이벤트 배지 O, 이벤트 해석 X.** 공시가 났다는 사실은 말하되 호재/악재로 부르지 않는다.
// 2. **인과 미서술.** 배지는 나란히 놓기만 한다. "공시 때문에 급락" 류 연결 문장을 만들지 않는다.
// 3. 방향(상승/하락)은 **색으로만**(dir) 전달하고, 텍스트는 크기·방향의 사실만 담는다.
// 4. 절대 임계 라벨(위험/기회/우량) 금지, 개인화 매수/매도 신호·목표가 금지.
//    tests/attention/interpret.test.ts가 전 출력을 FORBIDDEN_ATTENTION으로 전수 검사한다.
// 5. 임계값은 실증 검증 전(provisional) — UI가 뱃지로 고지한다.

export interface AttentionFacts {
  held: boolean;
  priced: boolean;
  ret5d: number | null;
  volSurge: number | null;
  unrealizedPct: number | null;
  discCount: number;
  discLatestDaysAgo: number | null;
  discCategories: string[];
}

// dir은 한국 증시 색 배정용(up=rise 빨강 / down=fall 파랑 / none=무채색)이지
// 좋음·나쁨의 판정이 아니다. 점수에는 방향이 들어가지 않는다(R1).
export type AttentionDir = 'up' | 'down' | 'none';
export interface AttentionBadge {
  key: 'disclosure' | 'category' | 'move' | 'volume' | 'unrealized' | 'unpriced';
  text: string;
  dir: AttentionDir;
}

export const ATTENTION_TITLE = '최근 변화가 있는 내 종목';
export const ATTENTION_EMPTY = '최근 두드러진 변화가 없어요.';
export const ATTENTION_PROVISIONAL = '실증 검증 전';
export const ATTENTION_DISCLAIMER =
  '※ 최근 변화가 큰 순서로 나열한 목록이에요. 매매 판단의 근거가 아니라, 어떤 종목을 먼저 살펴볼지 고르는 참고용이에요.';

// 거래량 배지 문턱 — 직전 20거래일 평균의 몇 배부터 표시할지. provisional.
export const ATTENTION_VOL_SURGE = 2;

const signed = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const dirOf = (v: number): AttentionDir => (v > 0 ? 'up' : v < 0 ? 'down' : 'none');

export function attentionSourceLabel(item: { held: boolean }): string {
  return item.held ? '보유' : '관심';
}

// 최근 종가 날짜 고지 — "지금" 금지(C-2와 동일 원칙). 날짜 없으면 빈 문자열.
export function attentionAsOfNote(asOfDate?: string | null): string {
  if (!asOfDate) return '';
  return `가격·거래량은 ${asOfDate} 종가 기준이에요.`;
}

// 원시 사실 → 배지 목록. 순서 고정(공시 → 분류 → 가격 → 거래량 → 미실현).
export function attentionBadges(f: AttentionFacts): AttentionBadge[] {
  const badges: AttentionBadge[] = [];

  // 공시 — 건수와 최신성이라는 사실만. 어떤 공시인지의 평가는 하지 않는다(R2).
  if (f.discCount > 0) {
    const when =
      f.discLatestDaysAgo == null ? null :
      f.discLatestDaysAgo === 0 ? '오늘' :
      `${f.discLatestDaysAgo}일 전`;
    badges.push({ key: 'disclosure', text: when ? `공시 ${f.discCount}건 · ${when}` : `공시 ${f.discCount}건`, dir: 'none' });
    if (f.discCategories.length > 0) {
      badges.push({ key: 'category', text: f.discCategories.join(' · '), dir: 'none' });
    }
  }

  // 시세를 못 얻은 종목(승격 전)은 가격 계열 배지를 만들지 않고 그 사실만 중립 표기.
  if (!f.priced) {
    badges.push({ key: 'unpriced', text: '시세 정보 없음', dir: 'none' });
    return badges;
  }

  if (f.ret5d != null) {
    badges.push({ key: 'move', text: `5일 ${signed(f.ret5d)}`, dir: dirOf(f.ret5d) });
  }
  if (f.volSurge != null && f.volSurge >= ATTENTION_VOL_SURGE) {
    // 거래량은 방향이 아니라 크기 → 무채색.
    badges.push({ key: 'volume', text: `거래량 평소의 ${f.volSurge.toFixed(1)}배`, dir: 'none' });
  }
  // 미실현은 포지션이 있어야 성립 → 보유만.
  if (f.held && f.unrealizedPct != null) {
    badges.push({ key: 'unrealized', text: `미실현 ${signed(f.unrealizedPct)}`, dir: dirOf(f.unrealizedPct) });
  }

  return badges;
}
