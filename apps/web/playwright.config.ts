import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const webServer = {
  command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173',
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  url: 'http://127.0.0.1:4173',
  reuseExistingServer: process.env.CI !== 'true',
  timeout: 30_000,
};

export default defineConfig({
  testDir: '.',
  testMatch: ['browser/**/*.spec.ts', 'test/gate-p5.spec.ts'],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: process.env.CI === 'true' ? 'github' : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Audit the settled page. The contrast checks run immediately after
    // navigation, so with motion enabled axe samples mid-transition and reads
    // every colour composited against whatever sits behind it — a panel still
    // fading in reports its ink as a blend rather than the colour it settles
    // on. All motion in styles.css sits behind `prefers-reduced-motion:
    // no-preference`, so reducing it here removes the sampling race instead of
    // hiding a real contrast failure.
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer,
});
