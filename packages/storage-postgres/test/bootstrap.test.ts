import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import {
  bootstrapDatabase,
  DEMO_PRESERVED_TABLES,
  DEMO_RESETTABLE_TABLES,
  resetDemoDatabase,
} from '../src/index.js';

describe('Storage bootstrap and demo reset (A06.1)', () => {
  it('defines correct tables for demo reset and preservation', () => {
    expect(DEMO_RESETTABLE_TABLES).toContain('business_intents');
    expect(DEMO_RESETTABLE_TABLES).toContain('attempts');
    expect(DEMO_RESETTABLE_TABLES).toContain('settlements');
    expect(DEMO_RESETTABLE_TABLES).toContain('outbox_jobs');
    expect(DEMO_RESETTABLE_TABLES).toContain('evidence_observations');

    expect(DEMO_PRESERVED_TABLES).toContain('schema_versions');
    expect(DEMO_RESETTABLE_TABLES).not.toContain('schema_versions');
  });

  it('refuses to reset demo database in production without force', async () => {
    const mockPool = {} as Pool;
    await expect(resetDemoDatabase(mockPool, { environment: 'production' })).rejects.toThrow(
      /production environment without explicit force/u,
    );
  });

  it('refuses to reset demo database when arcProfile is arc-mainnet without force', async () => {
    const mockPool = {} as Pool;
    await expect(
      resetDemoDatabase(mockPool, {
        environment: 'development',
        arcProfile: 'arc-mainnet',
      }),
    ).rejects.toThrow(/arc-mainnet without explicit force/u);
  });

  it('executes safe truncation when valid environment and profile are provided', async () => {
    const queries: string[] = [];
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn(async () => mockClient),
    } as unknown as Pool;

    const result = await resetDemoDatabase(mockPool, {
      environment: 'development',
      arcProfile: 'arc-testnet',
    });

    expect(result.success).toBe(true);
    expect(result.clearedTables).toEqual([...DEMO_RESETTABLE_TABLES]);
    expect(result.preservedTables).toEqual([...DEMO_PRESERVED_TABLES]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('TRUNCATE');
    expect(queries[0]).toContain('business_intents');
    expect(queries[0]).not.toContain('schema_versions');
  });

  it('allows reset in production when explicit force override is provided', async () => {
    const mockClient = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn(async () => mockClient),
    } as unknown as Pool;

    const result = await resetDemoDatabase(mockPool, {
      environment: 'production',
      force: true,
    });

    expect(result.success).toBe(true);
  });

  it('bootstraps database and reports schema digest and version count', async () => {
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT count(*)::text AS count FROM schema_versions')) {
          return { rows: [{ count: '3' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as Pool;

    const result = await bootstrapDatabase(mockPool);
    expect(result.databaseReady).toBe(true);
    expect(result.versionCount).toBe(3);
    expect(result.schemaDigest).toBeDefined();
  });
});
