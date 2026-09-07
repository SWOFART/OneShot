# Session Context: A04 Restart Safety, Operations, and Simulator Composition

## Date/time

- UTC: 2026-09-07T17:45:00Z

## User goal

Implement Coder A Milestone A04: restart safety, safe operations disable, structured telemetry with redaction, simulator composition profile, and Gate P4 preparation.

## Key decisions

- Startup recovery (`recoverOrphanedSubmissions`) detects `SUBMITTING` records with expired leases and routes them to `UNKNOWN` with reconciliation enqueued. Invariant holds: lease expiry NEVER grants a new settlement claim.
- Safe disable (`submissionsDisabled: true`) pauses new submission ownership while keeping liveness, readiness, status reads, and reconciliation ingestion active.
- Readiness check (`/health/ready`) verifies database connectivity, chain identity, and contract version compatibility, failing closed without leaking sensitive data.
- Telemetry module enforces explicit redaction of private keys, tokens, auth headers, and sensitive payloads.
- Port composition defines frozen simulator profiles for Arc settlement and Privy authorization, creating clean dependency injection boundaries for Gate P4.

## Files touched/created

- `packages/domain/src/telemetry.ts`
- `packages/domain/src/index.ts`
- `packages/storage-postgres/src/ledger.ts`
- `apps/api/src/app.ts`
- `apps/worker/src/types.ts`
- `apps/worker/src/worker.ts`
- `apps/worker/src/composition.ts`
- `apps/worker/src/restart-runner.ts`
- `apps/worker/src/index.ts`
- `apps/worker/test/composition.test.ts`
- `apps/worker/test/restart-recovery.integration.test.ts`
- `docs/COMPOSITION_MANIFEST.md`
- `docs/SIMULATOR_LOCK.md`
- `docs/RESTART_RUNNER.md`
- `docs/DASHBOARDS_AND_ALERTS.md`
- `docs/SAFE_DISABLE_RUNBOOK.md`
- `docs/GATE_P4_CHECKLIST.md`

## Review gates

- Gate A: Pending
- Gate B: Pending
