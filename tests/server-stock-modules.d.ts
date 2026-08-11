// 큐레이션 reason 스윕이 server/domains/stock/data.js의 시드 배열을 import한다.
// 루트 tsconfig는 allowJs:false라 무타입 .js import가 TS7016을 낸다.
// 이 시드는 JS가 정본(server/*.js)이고 런타임 동작은 vitest가 검증하므로,
// 테스트 타입체크 목적상 해당 모듈군을 any로 선언한다(정본 JS엔 영향 없음).
declare module '@/server/domains/stock/*';
