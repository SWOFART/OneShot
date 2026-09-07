# PostgreSQL migration operations

Migrations are append-only and run in filename order. Each file is checksummed;
an already-applied version whose checksum changes fails startup.

Each migration runs in one transaction with an advisory lock. A failed file is
rolled back and its version is not recorded. Before production migration, take
a database backup and disable API/worker writers when a migration changes data
shape. Rollback means deploying the prior application and restoring the backup
or applying a separately reviewed forward repair; migration files are never
silently edited or automatically reversed.

## Storage V1 Schema Digest

The frozen `storage-v1` migration set (`001_core_ledger.sql`, `002_query_indexes.sql`)
has SHA-256 digest:

```text
09b7fc0ce90a3db9dfd0437ae1abdac7260603154216b223116d0e123967d742
```

## Containerized Testing Command

To run the integration test suite against an ephemeral containerized PostgreSQL instance:

```shell
TEST_POSTGRES=1 pnpm test:integration
```

The test runner starts a dedicated `postgres:16.4-alpine` container via Testcontainers, applies all migrations, runs concurrency and rollback suites, and terminates the container upon completion.
