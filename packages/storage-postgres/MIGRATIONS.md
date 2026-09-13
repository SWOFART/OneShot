# PostgreSQL migration operations

Migrations are append-only and run in filename order. Each file is checksummed;
an already-applied version whose checksum changes fails startup.

Each migration runs in one transaction with an advisory lock. A failed file is
rolled back and its version is not recorded. Before production migration, take
a database backup and disable API/worker writers when a migration changes data
shape. Rollback means deploying the prior application and restoring the backup
or applying a separately reviewed forward repair; migration files are never
silently edited or automatically reversed.

## Current schema digest

The append-only ledger, resumable-jobs, provider-identity, personal MCP
credential, Graph evidence capture, and historical Graph evidence backfill
migration set (`001` through `013`) has
SHA-256 digest:

```text
065214281bd4eb77b7df16de81f27b377cd97bdced241124448f6a9a08f88056
```

## Containerized Testing Command

To run the integration test suite against an ephemeral containerized PostgreSQL instance:

```shell
TEST_POSTGRES=1 pnpm test:integration
```

The test runner starts a dedicated `postgres:16.4-alpine` container via Testcontainers, applies all migrations, runs concurrency and rollback suites, and terminates the container upon completion.
