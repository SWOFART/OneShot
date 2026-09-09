import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@oneshot/recovery-ui': `${workspaceRoot}packages/recovery-ui/src/index.ts`,
      '@oneshot/settlement-ui': `${workspaceRoot}packages/settlement-ui/src/index.ts`,
    },
  },
  test: {
    environment: 'jsdom',
    coverage: { enabled: false },
    exclude: [
      '**/*.integration.test.ts',
      'apps/web/browser/**',
      'apps/web/test/**/*.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
    ],
    include: ['{apps,packages}/**/*.{test,spec}.{ts,mjs}'],
  },
});
