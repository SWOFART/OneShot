import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { enabled: false },
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', '**/dist/**'],
    include: ['{apps,packages}/**/*.{test,spec}.{ts,mjs}'],
  },
});
