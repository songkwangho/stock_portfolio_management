// Phase A — 테스트가 server의 순수 JS 모듈(derive/priceContext)을 import한다.
// 루트 tsconfig는 allowJs:false라 무타입 .js import가 TS7016을 낸다.
// 백엔드 로직은 JS가 정본이고 런타임 동작은 vitest가 검증하므로 any로 선언한다.
declare module '@/server/domains/dart/*';
declare module '@/server/domains/analysis/*';
