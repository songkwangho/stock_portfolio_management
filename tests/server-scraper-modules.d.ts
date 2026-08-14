// 세션 3 — 투자자 파서 테스트가 server/scrapers의 순수 JS를 import한다.
// 루트 tsconfig는 allowJs:false라 무타입 .js import가 TS7016을 낸다.
// 스크래퍼는 JS가 정본(server/*.js)이고 런타임 동작은 vitest가 검증하므로 any로 선언한다
// (tests/stockDetail·journal·attention의 shim과 동일 패턴, 정본 JS엔 영향 없음).
declare module '@/server/scrapers/*';
