import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const defaultMigrationDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);
const migrationName = /^(?<version>[0-9]{3})_[a-z0-9_]+\.sql$/u;

interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

async function migrationFiles(directory: string): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const versions = new Set<number>();
  const files: MigrationFile[] = [];
  for (const name of names) {
    const match = migrationName.exec(name);
    if (!match?.groups) throw new Error(`Invalid migration filename: ${name}`);
    const version = Number(match.groups.version);
    if (versions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    versions.add(version);
    const rawSql = await readFile(resolve(directory, name), 'utf8');
    const sql = rawSql.replace(/\r\n/g, '\n');
    files.push({
      version,
      name,
      sql,
      checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
    });
  }
  return files;
}

export const STORAGE_V1_SCHEMA_DIGEST =
  'fac546d0052a4f4f243791fcd83d74b5cbf5be123a40cea5b2da8dabb1a9fa8c';

export async function migrationDigest(directory = defaultMigrationDirectory): Promise<string> {
  const files = await migrationFiles(directory);
  const hash = createHash('sha256');
  for (const file of files) hash.update(`${file.name}\0${file.checksum}\n`, 'utf8');
  return hash.digest('hex');
}

export async function migrate(pool: Pool, directory = defaultMigrationDirectory): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const migration of await migrationFiles(directory)) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('oneshot:migrations'))");
      const applied = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_versions WHERE version = $1',
        [migration.version],
      );
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch at version ${migration.version}`);
        }
        await client.query('COMMIT');
        continue;
      }
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_versions (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
