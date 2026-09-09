import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.config.ts'],
  {
    env: {
      ...process.env,
      // Playwright 1.52's TS ESM loader can hang under Node 24 on Windows.
      PW_DISABLE_TS_ESM: '1',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
