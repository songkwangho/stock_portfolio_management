// A차 — 테스트가 server/domains/attention의 순수 JS 모듈을 import한다.
// 루트 tsconfig는 allowJs:false라 무타입 .js import가 TS7016을 낸다.
// 이 백엔드 로직은 JS가 정본(server/*.js)이고 런타임 동작은 vitest가 검증하므로,
// 테스트 타입체크 목적상 해당 모듈군을 any로 선언한다(정본 JS엔 영향 없음).
declare module '@/server/domains/attention/*';
