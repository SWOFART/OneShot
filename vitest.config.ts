import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { enabled: false },
    include: ['packages/**/*.{test,spec}.{ts,mjs}'],
  },
});
