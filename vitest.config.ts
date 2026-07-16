import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 최소 설정. summary.ts는 `import type`만 쓰므로 런타임 alias 불필요하지만,
// 향후 확장 대비 `@` → 프로젝트 루트 매핑을 둔다.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
