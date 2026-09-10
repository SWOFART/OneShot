# Session Context: settlement safety hardening

## Date/time

- UTC: 2026-09-10T14:30:08Z

## User goal

Create a new branch and fix the six correctness issues identified in the repository/deployment review: safe-disable outbox loss, authorization-unavailable stranding, missing FAILED_SAFE retry path, permissive production composition, fabricated recovery submission identity, and unsafe metric failure handling.

## Original prompt/request

"okay create a new branch and start fixing this 6 issues"

## Assumptions

- Work starts from the merged `origin/develop` at `c1404056239358317006b2ae9fb9e6517dc51b64`.
- The branch is focused on the six correctness issues; deployment automation and documentation cleanup are follow-up scope unless required to specify the new behavior.
- Arc Mainnet remains disabled and no live funds are used; tests use isolated fakes or PostgreSQL integration fixtures.

## Plan

1. Inspect ledger, worker, recovery, composition, schema, and existing failure tests.
2. Implement the smallest coherent durable-state changes for all six issues.
3. Add focused tests covering safe-disable, authorization outage, safe failure retry policy, production fail-closed composition, provider identity binding, and metric failure isolation.
4. Run formatting, lint, typecheck, build, unit tests, and applicable PostgreSQL/failure-injection matrix cases.
5. Stage only intended files, capture Gate A identities, and prepare for human review; do not merge.

## Key decisions

- Preserve `1 business intent -> N attempts -> <=1 committed settlement`.
- `UNKNOWN` remains reconciliation-only and never becomes a retry permission.
- A `FAILED_SAFE` retry, if implemented, must be an explicit policy-authorized new attempt for the same business intent and must be atomically guarded.
- Safe disable must defer work without acknowledging it as delivered.
- Metric recording must not be able to abort a ledger transaction.

## Files/components touched

- `apps/worker/src/worker.ts` and worker tests: preserve disabled submission jobs and back off authorization-unavailable jobs; queue adapters signal retryable delivery failures.
- `packages/storage-postgres/src/ledger.ts` and storage integration tests: record authorization outages, isolate metric failures with savepoints, and add an atomic FAILED_SAFE retry primitive.
- `apps/worker/src/composition.ts` and composition/runtime tests: require production authorization, provider identity, and recovery dependencies.
- `apps/worker/src/recovery-bridge.ts` and P4 tests: bind recovery envelopes to durable provider references and fail closed when absent.
- `docs/RECOVERY_HARDENING.md` and `apps/worker/FAILURE_CATALOG.md`: document metric isolation and safe FAILED_SAFE retry semantics.

## Commands/checks

- `git switch -c fix/settlement-safety-hardening origin/develop` - passed.
- Initial branch was clean; branch tracks `origin/develop`.
- `pnpm.cmd typecheck` - passed.
- Focused worker tests - passed (5 files, 37 tests).
- Storage package tests - passed (2 files, 8 tests; integration cases skipped without PostgreSQL).
- `pnpm.cmd test` - passed (64 files, 957 tests, build included).
- `pnpm.cmd scenarios:invariants` - passed (7/7 isolated at-most-once scenarios).
- `pnpm.cmd --filter @oneshot/web test:browser` - passed (7 Chromium tests; existing large Privy chunk warning remains).
- `pnpm.cmd lint` - passed.
- `pnpm.cmd format:check` - passed.
- `pnpm.cmd check:generated` - passed.
- `TEST_POSTGRES=1 pnpm.cmd --filter @oneshot/worker test:integration` - blocked: no working container runtime (Docker/Testcontainers unavailable); suites failed during container setup, not assertions.

## External-doc findings

- Repository policy and the idempotency/failure-injection skills require durable state assertions, external-effect boundary tests, and fresh Gate A/B review before merge.

## Unresolved questions

- The public API intentionally still has no generic retry endpoint. A policy/authorization layer must call `scheduleFailedSafeRetry` when product requirements define the operator approval workflow.

## Git and PR state

- Branch: `fix/settlement-safety-hardening`
- Base: `origin/develop` at `c1404056239358317006b2ae9fb9e6517dc51b64`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Complete implementation and focused tests.
2. Re-run validation after every candidate-tree change, then follow Gate A and PR/CI/Gate B policy.
