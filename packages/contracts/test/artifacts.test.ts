import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

describe('generated contract artifacts', () => {
  it('have no drift', () => {
    expect(() =>
      execFileSync(process.execPath, ['scripts/generate-contracts.mjs', '--check'], {
        cwd: packageRoot,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('exposes the frozen HTTP seam without a payment retry endpoint', () => {
    const document = JSON.parse(
      readFileSync(resolve(packageRoot, 'openapi/openapi.v1.json'), 'utf8'),
    ) as {
      paths: Record<string, Record<string, { security?: readonly unknown[] }>>;
    };

    expect(Object.keys(document.paths).sort()).toEqual([
      '/health/live',
      '/health/ready',
      '/v1/activity',
      '/v1/activity/refresh',
      '/v1/intents',
      '/v1/intents/{id}',
      '/v1/intents/{id}/reconcile',
      '/v1/intents/{id}/recovery-view',
      '/v1/jobs',
      '/v1/jobs/quote',
      '/v1/jobs/{jobId}',
      '/v1/jobs/{jobId}/result',
      '/v1/jobs/{jobId}/resume',
    ]);
    expect(Object.keys(document.paths).every((path) => !path.includes('retry'))).toBe(true);

    for (const [path, operations] of Object.entries(document.paths)) {
      if (!path.startsWith('/v1/')) continue;
      for (const operation of Object.values(operations)) {
        expect(operation.security).toEqual([{ serviceBearer: [] }]);
      }
    }
  });
});
