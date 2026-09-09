import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { enabled: false },
    exclude: [
      '**/*.integration.test.ts',
      'apps/web/test/**/*.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
    ],
    include: ['{apps,packages}/**/*.{test,spec}.{ts,mjs}'],
  },
});
