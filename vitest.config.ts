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
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/browser/**'],
  },
});
