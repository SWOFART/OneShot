import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.ts'],
    exclude: ['test/**/*.integration.test.ts'],
  },
});
