import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@oneshot/recovery-ui/styles.css': fileURLToPath(
        new URL('../../packages/recovery-ui/src/styles.css', import.meta.url),
      ),
      '@oneshot/settlement-ui/styles.css': fileURLToPath(
        new URL('../../packages/settlement-ui/src/styles.css', import.meta.url),
      ),
      '@oneshot/recovery-ui': fileURLToPath(
        new URL('../../packages/recovery-ui/src/index.ts', import.meta.url),
      ),
      '@oneshot/settlement-ui': fileURLToPath(
        new URL('../../packages/settlement-ui/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
