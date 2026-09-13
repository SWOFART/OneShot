# Session Context: always-on-graph-evidence

## Date/time

- UTC: 2026-09-13T05:02:12Z

## User goal

Make The Graph evidence appear for every confirmed transaction, then commit,
push, and open a draft PR. The PR must state that Gate A was not started.

## Original prompt/request

"right know we use the graph only if payment failed or something got wrong. We
want that the graph evidence will apear always, on every transaction. Implement
this feature. Also make commit and push after you finished. And alos make a
draft pr without starting gate A, but write in pr msg that GATE a wasn't
started"

## Assumptions

- “Every transaction” means every confirmed OneShot settlement, including
  server-wallet and user-wallet commits; failed-safe attempts are not
  transactions.
- Graph evidence remains non-authoritative and cannot change settlement or
  retry permission.
- A durable outbox task is preferable to an inline post-commit call so a worker
  restart cannot permanently lose the evidence capture.
- The existing modified `.agent/context/20260912T-user-wallet-payment.md` is
  unrelated user work and must remain unstaged.

## Plan

1. Add an idempotent post-commit Graph evidence outbox task and worker port.
2. Wire production recovery configuration to capture Graph observations and
   record `UNAVAILABLE` evidence on Graph boundary failure.
3. Add focused worker/recovery coverage and update migration/integration
   expectations.
4. Run local checks, inspect the exact staged tree, commit, push, and create a
   draft PR without starting Gate A.

## Key decisions

- Use a separate `capture_graph_evidence` task instead of running the recovery
  LLM for successful payments. This keeps normal execution read-only and
  avoids turning evidence capture into a retry/reconciliation decision.
- Make `(business_intent_id, source, digest)` unique and use `ON CONFLICT DO
NOTHING`, so redelivery after a crash does not duplicate evidence.
- Query the durable payer wallet for user-wallet jobs when constructing the
  Graph correlation request; server-wallet intents retain the configured
  sender fallback.

## Files/components touched

- `packages/storage-postgres/migrations/012_graph_evidence.sql`
- `packages/storage-postgres/src/ledger.ts`
- `apps/worker/src/types.ts`
- `apps/worker/src/recovery-bridge.ts`
- `apps/worker/src/composition.ts`
- `apps/worker/src/worker.ts`
- `apps/worker/README.md` and `apps/worker/FAILURE_CATALOG.md`
- focused worker tests and storage integration expectations

## Commands/checks

- Repository policy and routed documents read: `.agent/AGENTS.md`, project
  context, security invariants, sponsor requirements, test matrix,
  implementation loop, and `oneshot-idempotency/SKILL.md`.
- Branch created from current `develop`: `feature/always-on-graph-evidence`.
- `pnpm.cmd --filter @oneshot/worker test` - 7 files / 50 tests passed.
- `pnpm.cmd --filter @oneshot/reconciliation test` - 8 files / 89 tests passed.
- `pnpm.cmd --filter @oneshot/storage-postgres test` - 4 files / 15 tests passed
  (PostgreSQL-gated tests skipped without a container runtime).
- `pnpm.cmd --filter @oneshot/settlement-ui test` - 5 files / 211 tests passed.
- `pnpm.cmd test` - 80 files / 1,055 tests passed.
- Worker, reconciliation, and storage typechecks plus root lint/build passed.
- `git diff --check` passed; targeted Prettier checks passed after formatting.

## External-doc findings

- Repository policy defines OneShot as authoritative for settlement and The
  Graph as non-authoritative candidate discovery; missing/delayed index data
  cannot authorize payment.
- Test matrix requires Graph boundary failures to fail closed and durable
  evidence metadata to be retained.

## Unresolved questions

- None; Graph evidence capture may be unavailable, but the observation must
  still be recorded with `UNAVAILABLE` freshness.

## Git and PR state

- Branch: `feature/always-on-graph-evidence`
- Base: `develop` at `62920523c5a323cfc0e38d57c632f498b4d921d5`
- Feature commit: `4fea7e66d6187760052d24508d47e73fa2b8daca`
- Feature tree: `86f39915dbab92450483c367f9fc0df67bae6172`
- Remote branch: pushed to `origin/feature/always-on-graph-evidence`
- Draft PR: [#124](https://github.com/SWOFART/OneShot/pull/124)
- PR head at creation: feature commit/tree above
- CI: GitHub checks are pending/queued; local validation passed

## Review gates

- Gate A: NOT RUN (explicitly requested to skip)
- Gate B: NOT RUN

## Handoff/next steps

1. Keep the unrelated `.agent/context/20260912T-user-wallet-payment.md`
   modification unstaged.
2. Human review and CI follow-up remain; do not start Gate A or Gate B.
