import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { PostgresRateLimiter } from '../src/rate-limit.js';

describe('PostgresRateLimiter', () => {
  it('shares a fixed window and rejects requests after the configured limit', async () => {
    let requestCount = 0;
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.startsWith('INSERT')) {
          requestCount = Math.min(requestCount + 1, 3);
          return { rows: [{ request_count: requestCount }] };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;
    const limiter = new PostgresRateLimiter(pool, {
      maxRequests: 2,
      windowMs: 60_000,
      now: () => 1_735_689_600_000,
    });
    const input = { correlationId: 'cid', key: 'client', route: '/v1/intents' };

    await expect(limiter.allow(input)).resolves.toBe(true);
    await expect(limiter.allow(input)).resolves.toBe(true);
    await expect(limiter.allow(input)).resolves.toBe(false);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (bucket_start, client_key, route)'),
      [new Date(1_735_689_600_000), 'client', '/v1/intents', 2],
    );
  });

  it('fails closed when PostgreSQL is unavailable', async () => {
    const pool = {
      query: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    } as unknown as Pool;
    const limiter = new PostgresRateLimiter(pool, { maxRequests: 60, windowMs: 60_000 });

    await expect(
      limiter.allow({ correlationId: 'cid', key: 'client', route: '/v1/intents' }),
    ).resolves.toBe(false);
  });
});
