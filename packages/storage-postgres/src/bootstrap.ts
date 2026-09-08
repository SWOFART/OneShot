import type { Pool } from 'pg';
import { migrate, migrationDigest, STORAGE_V1_SCHEMA_DIGEST } from './migrations.js';

export interface BootstrapResult {
  readonly success: boolean;
  readonly schemaDigest: string;
  readonly databaseReady: boolean;
  readonly versionCount: number;
}

export interface ResetDemoOptions {
  /** Explicit override flag required if attempting to reset in restricted environments */
  readonly force?: boolean;
  /** Runtime environment to check against (default: process.env.NODE_ENV) */
  readonly environment?: string;
  /** Active Arc profile to guard against mainnet resets (default: process.env.ONESHOT_ARC_PROFILE) */
  readonly arcProfile?: string;
}

export interface ResetDemoResult {
  readonly success: boolean;
  readonly clearedTables: readonly string[];
  readonly preservedTables: readonly string[];
  readonly message: string;
}

export const DEMO_RESETTABLE_TABLES = [
  'outbox_jobs',
  'evidence_observations',
  'settlements',
  'attempts',
  'business_intents',
] as const;

export const DEMO_PRESERVED_TABLES = ['schema_versions'] as const;

/**
 * Automate safe database bootstrap and migration check (A06.1).
 */
export async function bootstrapDatabase(
  pool: Pool,
  migrationDirectory?: string,
): Promise<BootstrapResult> {
  await migrate(pool, migrationDirectory);

  const digest = await migrationDigest(migrationDirectory);
  const client = await pool.connect();
  try {
    const versionRes = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM schema_versions',
    );
    const versionCount = Number(versionRes.rows[0]?.count ?? '0');

    await client.query('SELECT 1');

    return {
      success: digest === STORAGE_V1_SCHEMA_DIGEST,
      schemaDigest: digest,
      databaseReady: true,
      versionCount,
    };
  } finally {
    client.release();
  }
}

/**
 * Safely reset local demo database fixtures without mutating external chain state (A06.1).
 * Never deletes schema versions or migrations.
 * Fails closed if run in production or against mainnet profile without explicit force override.
 */
export async function resetDemoDatabase(
  pool: Pool,
  options?: ResetDemoOptions,
): Promise<ResetDemoResult> {
  const env = options?.environment ?? process.env.NODE_ENV ?? 'development';
  const profile = options?.arcProfile ?? process.env.ONESHOT_ARC_PROFILE ?? 'arc-testnet';
  const isForce = options?.force === true;

  if (env === 'production' && !isForce) {
    throw new Error(
      'Refusing to reset database in production environment without explicit force flag',
    );
  }

  if (profile === 'arc-mainnet' && !isForce) {
    throw new Error(
      'Refusing to reset database when ONESHOT_ARC_PROFILE is arc-mainnet without explicit force flag',
    );
  }

  const client = await pool.connect();
  try {
    await client.query(`TRUNCATE ${DEMO_RESETTABLE_TABLES.join(', ')} RESTART IDENTITY`);

    return {
      success: true,
      clearedTables: [...DEMO_RESETTABLE_TABLES],
      preservedTables: [...DEMO_PRESERVED_TABLES],
      message: 'Demo state safely reset. Schema versions and external chain history preserved.',
    };
  } finally {
    client.release();
  }
}
