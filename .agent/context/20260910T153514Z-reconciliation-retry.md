# Session Context: reconciliation retry

## Date/time

- UTC: 2026-09-10T15:35:14Z

## User goal

Restore live Arc recovery by using the published Graph Studio subgraph, identify
remaining blockers, and finish fixes through the repository review gates.

## Original prompt/request

The Arc deployment is not served by The Graph Network everywhere. Verify that
Graph Studio returns indexed Arc data and change the recovery approach if the
official Subgraph MCP cannot query it; continue fixing the live failure.

## Assumptions

- Graph Studio GraphQL is an operational read-only recovery source, but it is
  not evidence of official Subgraph MCP qualification.
- Production validation must keep settlement submissions disabled.

## Plan

1. Allow one reconciliation job to be pending per intent and permit a new
   read-only retry after the previous job is delivered.
2. Run the full validation stack, Gate A, CI, and Gate B on a separate PR.
3. Deploy the reviewed API image and verify recovery with wallet nonce unchanged.

## Key decisions

- PR #65 implemented direct Studio GraphQL and dynamic Arc head lookup; a human
  merged it while live validation was in progress.
- Live diagnostics found two additional independent blockers: the worker service
  account lacked Vertex invocation permission, and reconciliation job keys were
  unique for the full lifetime of an unchanged UNKNOWN intent.
- Added the minimal `roles/aiplatform.user` binding to the existing worker
  service account. AI remains advisory with settlement permission `NEVER`.
- Retry keys gain a monotonically derived generation only after no manual
  reconciliation job is pending. This retains concurrent deduplication without
  reopening delivered outbox rows or weakening settlement idempotency.

## Files/components touched

- `packages/storage-postgres/src/ledger.ts`: admit a later reconciliation retry
  while rejecting duplicate pending jobs.
- `packages/storage-postgres/test/ledger.integration.test.ts`: cover delivered
  retry and concurrent enqueue deduplication.

## Commands/checks

- Direct Studio GraphQL query - PASS; deployment indexed Arc data and returned
  real transfer candidates.
- PR #65 checks and Gate A/B - PASS; human merged as `95709a8`.
- Cloud Build `35f9481f-dcde-4152-94cf-87772b4cdba0` - PASS.
- Worker revision `oneshot-worker-00006-sh5` - live/ready PASS with submissions
  disabled and the Studio query URL configured.
- Production outbox read-only diagnostic - prior reconciliation jobs are
  `DELIVERED`; current ledger correctly returns `queued: false` while their
  lifetime key prevents a retry.
- `pnpm --filter @oneshot/storage-postgres typecheck` - PASS.
- `pnpm --filter @oneshot/storage-postgres lint` - PASS.
- `pnpm --filter @oneshot/storage-postgres test` - PASS, 2 files / 8 tests.
- `git diff --check` - PASS.

## External-doc findings

- The Graph Studio endpoint serves the Arc deployment directly; The Graph
  Network Gateway returns subgraph-not-found for its deployment ID. Official MCP
  qualification therefore remains `NOT VERIFIED`.

## Unresolved questions

- The PostgreSQL integration test requires CI because no local container runtime
  is available.

## Git and PR state

- Branch: `fix/reconciliation-retry`
- Base: `origin/develop` at `95709a8256a11f2c544b1d406e906ba8ea2d7867`
- Commit: uncommitted
- PR: not created
- CI: not started

## Review gates

- Gate A: NOT RUN for the reconciliation retry tree.
- Gate B: NOT RUN.

## Handoff/next steps

1. Run full repository checks and stage the exact candidate tree.
2. Run fresh Gate A, commit/push, open a draft PR, wait for CI, then run Gate B.
3. Deploy the reviewed API image, enqueue recovery, verify Graph/Vertex evidence,
   confirm wallet nonce did not change, scale worker back to zero, and delete the
   temporary diagnostic Cloud Run job.
