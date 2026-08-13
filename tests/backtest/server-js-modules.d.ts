// Phase 4 백테스팅 하네스 테스트가 순수 .mjs 모듈과 server의 순수 JS를 import한다.
// 루트 tsconfig는 allowJs:false라 무타입 import가 TS7016을 낸다.
// 하네스는 JS(.mjs)가 정본이고 런타임 동작은 vitest가 검증하므로 any로 선언한다
// (tests/stockDetail·journal·attention의 shim과 동일 패턴).
declare module '@/scripts/backtest/*';
