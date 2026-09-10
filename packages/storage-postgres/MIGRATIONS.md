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

The frozen `storage-v1` migration set (`001_core_ledger.sql`, `002_query_indexes.sql`, `003_worker_jobs.sql`, `004_operational_metrics.sql`)
has SHA-256 digest:

```text
9af3339865c54f19e351f00b4ca552d352d34d23e3ec9e0fa2e23230ce4f8fde
```

## Containerized Testing Command

To run the integration test suite against an ephemeral containerized PostgreSQL instance:

```shell
TEST_POSTGRES=1 pnpm test:integration
```

The test runner starts a dedicated `postgres:16.4-alpine` container via Testcontainers, applies all migrations, runs concurrency and rollback suites, and terminates the container upon completion.
