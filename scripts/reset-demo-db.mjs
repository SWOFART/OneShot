#!/usr/bin/env node
/**
 * Safe local demo database reset runner (A06.1).
 * Resets local demo intent/settlement records without touching migrations or external chain state.
 */
import { Pool } from 'pg';
import { resetDemoDatabase } from '../packages/storage-postgres/dist/index.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (
    !connectionString &&
    !process.env.INSTANCE_CONNECTION_NAME &&
    !process.env.INSTANCE_UNIX_SOCKET
  ) {
    process.stderr.write('Missing database configuration. Set DATABASE_URL.\n');
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

  const isForce = process.argv.includes('--force');

  try {
    process.stdout.write('Resetting OneShot demo database state...\n');
    const result = await resetDemoDatabase(pool, { force: isForce });
    process.stdout.write(
      `${result.message}\nCleared tables: ${result.clearedTables.join(', ')}\nPreserved tables: ${result.preservedTables.join(', ')}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(
    `Demo reset failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
