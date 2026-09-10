# Operations Runbook and Release Operations

This runbook is the operational guide and acceptance evidence for Milestone A06
(`milestone/a06-release-operations`). It automates local bootstrap and fixture
resets, scripts all seven core invariant scenarios, provides operational
observability guidelines, and details the release procedures.

## 1. System overview and invariants

OneShot's core promise is:

```text
One job. Many retries. One settlement.
```

- **Invariant 1**: Exactly one Business Intent maps to at most one committed
  on-chain settlement (`settlementCount <= 1`).
- **Invariant 2**: A single stable `business_intent_id` is preserved across
  retries, process crashes, parallel workers, and reconciliation.
- **Invariant 3**: Any ambiguous external response (`POSSIBLY_SUBMITTED`,
  socket timeout, truncated HTTP response) transitions the intent into
  `UNKNOWN`. Blind payment retries are strictly forbidden.
- **Invariant 4**: Monetary amounts are stored and processed strictly as integer
  atomic units (`bigint` string representation), never floating-point.
- **Invariant 5**: External chain history is immutable; local resets never touch
  or mutate external ledger state.

## 2. Prerequisites and environment configuration

### Required runtime components

- Node.js 24.19.0 (via `.nvmrc`).
- pnpm 11.19.0.
- PostgreSQL 16+ (local instance, Testcontainers, or Cloud SQL).

### Environment variables classification

| Variable                              | Classification  | Purpose                                           | Default / Requirement  |
| :------------------------------------ | :-------------- | :------------------------------------------------ | :--------------------- |
| `DATABASE_URL`                        | Secret / Config | PostgreSQL TCP connection string                  | Required for local/CI  |
| `INSTANCE_CONNECTION_NAME`            | Config          | Google Cloud SQL connection name                  | Used on Cloud Run      |
| `DB_USER` / `DB_PASS`                 | Secret          | Cloud SQL credentials                             | Required for Cloud SQL |
| `DB_NAME`                             | Config          | PostgreSQL database name                          | Default: `oneshot`     |
| `SERVICE_BEARER_TOKEN`                | Secret          | Shared bearer token for Fastify API               | Required, min 16 chars |
| `ONESHOT_ARC_PROFILE`                 | Public          | Deployment profile identifier                     | `arc-testnet`          |
| `ONESHOT_ARC_RPC_URL`                 | Public          | RPC endpoint URL for Arc                          | Validated on startup   |
| `ONESHOT_SUBMISSIONS_DISABLED`        | Public          | Safe disable configuration switch                 | `false`                |
| `ONESHOT_API_RATE_LIMIT_MAX_REQUESTS` | Public          | Maximum POST requests per client and route window | `60`                   |
| `ONESHOT_API_RATE_LIMIT_WINDOW_MS`    | Public          | Shared API rate-limit window in milliseconds      | `60000`                |

Secrets must be provided via Google Secret Manager in Cloud Run or local `.env`
files. Secrets are **never** logged, checked into version control, or passed to
review agents.

## 3. Database bootstrap and safe fixture reset (A06.1)

### Safe database bootstrap

To bootstrap or migrate a local or remote PostgreSQL instance to the frozen
schema:

```bash
pnpm db:bootstrap
```

Or programmatically via `@oneshot/storage-postgres`:

```typescript
import { bootstrapDatabase } from '@oneshot/storage-postgres';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const result = await bootstrapDatabase(pool);
// result.schemaDigest === STORAGE_V1_SCHEMA_DIGEST ('5d5888894ff...')
```

Key guarantees:

- Concurrency-safe advisory transaction locking:
  `SELECT pg_advisory_xact_lock(hashtext('oneshot:migrations'))`.
- Append-only checksum verification via `schema_versions` table.
- Fails closed if any applied migration file has been tampered with.

### Safe demo fixture reset

To reset local demo state for fresh demonstration runs without manual database
surgery:

```bash
pnpm db:reset-demo
```

Safety guardrails:

- Clears only mutable business data: `outbox_jobs`, `evidence_observations`,
  `settlements`, `attempts`, and `business_intents`.
- **Preserves** `schema_versions` so migration integrity remains intact.
- **Never touches or mutates external chain history**.
- Fails closed with an error if `NODE_ENV === 'production'` or
  `ONESHOT_ARC_PROFILE === 'arc-mainnet'` unless the `--force` flag is
  explicitly passed.

## 4. Invariant scenarios and verification (A06.2)

OneShot includes an automated suite and standalone CLI runner that exercises the
complete lifecycle under 7 distinct adversarial and edge-case conditions.

### Running the invariant scenario suite

```bash
pnpm scenarios:invariants
```

### Scripted scenarios and evidence table

| Scenario               | Business Intent ID                | Durable Final State | Attempts | Settlements | Invariant Satisfied |  Status  |
| :--------------------- | :-------------------------------- | :------------------ | :------: | :---------: | :-----------------: | :------: |
| `identical-replay`     | `intent-a06-identical-replay`     | `COMMITTED`         |    1     |      1      |     YES (<= 1)      | **PASS** |
| `conflicting-replay`   | `intent-a06-conflicting-replay`   | `COMMITTED`         |    1     |      1      |     YES (<= 1)      | **PASS** |
| `ten-parallel-workers` | `intent-a06-ten-parallel-workers` | `COMMITTED`         |    1     |      1      |     YES (<= 1)      | **PASS** |
| `two-processes`        | `intent-a06-two-processes`        | `COMMITTED`         |    1     |      1      |     YES (<= 1)      | **PASS** |
| `restart`              | `intent-a06-restart-recovery`     | `COMMITTED`         |    1     |      1      |     YES (<= 1)      | **PASS** |
| `lost-response`        | `intent-a06-lost-response`        | `COMMITTED`         |    1     |      1      |     YES (<= 1)      | **PASS** |
| `downstream-failure`   | `intent-a06-downstream-failure`   | `FAILED_SAFE`       |    1     |      0      |     YES (<= 1)      | **PASS** |

### Scenario descriptions

1. **`identical-replay`**: Submitting an identical payload with the same
   Business Intent ID returns `REPLAY_IDENTICAL` (200 OK) without creating a new
   submission or duplicate payment.
2. **`conflicting-replay`**: Submitting a modified payload with an existing
   Business Intent ID returns `INTENT_PAYLOAD_CONFLICT` (409 Conflict). The
   original intent and its canonical payload remain completely immutable.
3. **`ten-parallel-workers`**: Ten concurrent worker threads race to claim
   submission ownership for a single intent. Exactly one worker acquires the CAS
   lock (`READY -> SUBMITTING`); nine workers fail the claim. Exactly one
   settlement is executed.
4. **`two-processes`**: Two distinct processes attempt concurrent state
   transitions. Optimistic concurrency control via `version = expectedVersion`
   prevents race conditions and lost updates.
5. **`restart`**: A worker process crashes while an intent is in `SUBMITTING`.
   Upon restart, `RestartRunner` / `runStartupRecovery` identifies the orphaned
   lease, transitions the intent to `UNKNOWN`, and triggers reconciliation to
   `COMMITTED` without initiating a duplicate payment.
6. **`lost-response`**: An external settlement call suffers a premature socket
   closure or truncated HTTP response. The worker records `POSSIBLY_SUBMITTED`
   and moves the intent to `UNKNOWN`. Any blind resend is strictly refused.
   Authoritative reconciliation via provider evidence confirms settlement.
7. **`downstream-failure`**: A definite upstream refusal (e.g. policy denial,
   zero-address recipient) moves the intent to `FAILED_SAFE` with zero
   settlements.

## 5. Operational evidence and controls (A06.3)

### Liveness and readiness boundaries

- `GET /health/live`: Fast process health check confirming event loop liveness.
- `GET /health/ready`: Deep readiness probe verifying:
  - PostgreSQL database connectivity and pool health.
  - Frozen contract version (`1.0.0`) and network identity (`eip155:5042002`).
  - Submission state (`submissions_disabled: false`).

### Safe disable mode

When emergency maintenance or downstream provider degradation occurs, operators
can pause all new payment submissions without restarting the cluster:

```bash
export ONESHOT_SUBMISSIONS_DISABLED=true
```

Effect of safe disable:

- `POST /v1/intents` remains available and may persist an idempotent intent.
  The worker refuses the `READY -> SUBMITTING` ownership transition, so it does
  not call the settlement port while disabled.
- `GET /v1/intents/:id` **remains fully operational**, allowing clients to
  monitor in-flight payments.
- `POST /v1/intents/:id/reconcile` **remains fully operational**, allowing
  pending and `UNKNOWN` intents to be healed and settled.
- Worker processes do not claim new `READY` intents for submission. A call
  already in flight when the disabled worker revision becomes active may still
  complete and must be reconciled normally.

### Observability and alerting

The system provides structured metric evaluation via
`evaluateAlerts(systemMetrics)` in `@oneshot/domain`:

`GET /v1/metrics` reads the state gauges and durable operational event counters
from PostgreSQL. The event stream records duplicate requests, failed CAS
claims, authorization policy denials, ambiguous provider submissions, and
reconciliation target outcomes. Event payloads contain only bounded event
types/outcomes and a business-intent foreign key; they never contain tokens,
wallet credentials, or raw request bodies. Event recording is best-effort and
never grants settlement permission or changes a ledger transition.

1. **`UNKNOWN` State Alert**:
   - Condition: `activeUnknownIntents > 0`.
   - Severity: `CRITICAL`.
   - Action: Check logs for provider timeouts or network partitions. Reconciler
     automatically queries known-identity evidence and the configured Graph
     source. Arc Testnet uses the pinned Studio GraphQL endpoint; MCP is only
     used when explicitly configured for a Network deployment.
2. **Outbox Queue Lag Alert**:
   - Condition: `queueLagSeconds > 60` (Warning), `> 300` (Critical).
   - Severity: `WARNING` / `CRITICAL`.
   - Action: Inspect PostgreSQL connection pool and worker concurrency.
3. **Structured Redacted Logging**:
   - All state transitions are logged with `correlationId`, `businessIntentId`,
     `fromState`, `toState`, `attemptId`, and `timestamp`.
   - Sensitive fields (auth tokens, private keys, authorization headers) are
     automatically masked with `[REDACTED]`.

### Zero database surgery recovery

Under normal operation, **no manual SQL updates** (`UPDATE business_intents
...`) are ever required. Orphaned jobs are healed automatically via:

- Periodic lease expiry sweep in `RestartRunner`.
- Autonomous reconciliation via `RecoveryService` (`PrivyArcEvidenceBridge` +
  `The Graph` candidate discovery).

## 6. Architecture and interface links (A06.4)

- **Domain Architecture**: [`DOMAIN_ARCHITECTURE.md`](DOMAIN_ARCHITECTURE.md)
- **Fastify Server Runtime**: [`SERVER_RUNTIME.md`](SERVER_RUNTIME.md)
- **Settlement Configuration v1**:
  [`settlement/SETTLEMENT_CONFIG_V1.md`](settlement/SETTLEMENT_CONFIG_V1.md)
- **Adapter Contracts v1**:
  [`settlement/ADAPTER_CONTRACT_V1.md`](settlement/ADAPTER_CONTRACT_V1.md)
- **Safe Disable Runbook**:
  [`SAFE_DISABLE_RUNBOOK.md`](SAFE_DISABLE_RUNBOOK.md)
- **Restart Runner Specification**: [`RESTART_RUNNER.md`](RESTART_RUNNER.md)
- **Dashboards and Alerts Specification**:
  [`DASHBOARDS_AND_ALERTS.md`](DASHBOARDS_AND_ALERTS.md)
- **Gate P4 Seam Manifest**: [`GATE_P4_MANIFEST.md`](GATE_P4_MANIFEST.md)
- **Mainnet Readiness Package**:
  [`MAINNET_READINESS.md`](MAINNET_READINESS.md)

## 7. Rollback and release checklist

### Rollback procedure

1. **Application Rollback**:
   - In Cloud Run: Route 100% traffic back to the previous stable revision:
     `gcloud run services update-traffic oneshot-api --to-revisions=PREVIOUS_REVISION=100`.
   - In Cloudflare Pages/Workers: Deploy previous commit artifact via
     `wrangler deploy`.
2. **Database Rollback**:
   - Database migrations in `@oneshot/storage-postgres` follow the expand/contract
     pattern.
   - Column additions (such as Gate P4 audit fields) are strictly additive and
     nullable.
   - If an application rollback is executed, older application binaries
     continue to operate safely on the expanded database schema without schema
     downgrades.

### Release checklist for Gate P6

- [x] All 7 invariant scenarios pass deterministically
      (`pnpm scenarios:invariants`).
- [x] Schema digest matches frozen `STORAGE_V1_SCHEMA_DIGEST`.
- [x] Unit, integration, and contract tests pass with 0 failures
      (`pnpm test`).
- [x] Contract artifacts match schema with 0 drift (`pnpm check:generated`).
- [x] All UI and contract fixtures validate against JSON Schema
      (`pnpm validate:fixtures`).
- [x] TypeScript compiler and linters pass cleanly (`pnpm typecheck`,
      `pnpm lint`).
- [x] Formatter passes (`pnpm format:check`).
- [x] Markdown lint passes without bare URLs or syntax issues
      (`npx markdownlint-cli2`).
- [x] Mainnet profile is confirmed disabled (`enabled: false`) and fails closed
      in `MAINNET_READINESS.md`.
