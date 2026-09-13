#!/usr/bin/env node
/**
 * Safe database bootstrap and migration runner (A06.1).
 */
import { Pool } from 'pg';
import { bootstrapDatabase } from '../packages/storage-postgres/dist/index.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (
    !connectionString &&
    !process.env.INSTANCE_CONNECTION_NAME &&
    !process.env.INSTANCE_UNIX_SOCKET
  ) {
    process.stderr.write(
      'Missing database configuration. Set DATABASE_URL, INSTANCE_CONNECTION_NAME, or INSTANCE_UNIX_SOCKET.\n',
    );
    process.exit(1);
  }

  const pool = new Pool(
    connectionString
      ? { connectionString, max: 5 }
      : {
          host:
            process.env.INSTANCE_UNIX_SOCKET ?? `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
          user: process.env.DB_USER,
          password: process.env.DB_PASS,
          database: process.env.DB_NAME,
          max: 5,
        },
  );

  try {
    process.stdout.write('Bootstrapping OneShot PostgreSQL database...\n');
    const result = await bootstrapDatabase(pool);
    if (!result.success) {
      throw new Error('Schema digest does not match the frozen storage contract');
    }
    process.stdout.write(
      `Database bootstrap successful: schema digest ${result.schemaDigest}, applied versions: ${result.versionCount}.\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(
    `Database bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
