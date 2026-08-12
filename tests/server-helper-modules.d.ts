// DART 계정 매칭 스윕이 server/helpers/dartAccounts.js를 import한다.
// 루트 tsconfig는 allowJs:false라 무타입 .js import가 TS7016을 낸다.
// 백엔드 헬퍼는 JS가 정본이고 런타임 동작은 vitest가 검증하므로 any로 선언한다
// (tests/stockDetail·journal·attention의 shim과 동일 패턴, 정본 JS엔 영향 없음).
declare module '@/server/helpers/*';
