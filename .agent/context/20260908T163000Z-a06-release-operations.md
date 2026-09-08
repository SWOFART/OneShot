# Session Context: A06 Operational Demo and Release Bundle

## Date/time

- UTC: 2026-09-08T14:38:00Z

## User goal

Implement Coder A milestone A06 (Operational Demo and Release Bundle): repeatable operations, safe database bootstrap/reset, automated invariant scenario runner, operational evidence documentation, and reviewer-facing mainnet-readiness package.

## Original prompt/request

"продолжай по плану что у меня A" -> Confirmed via multiple choice: "Начать A06 — Operational Demo and Release Bundle (официальный следующий этап Lane A: бутстрап БД, сценарии инвариантов, runbook, mainnet-readiness)".

## Assumptions

- Base commit is fresh `origin/develop` (`36df8fa06b94a0c08e32fa729a41ef2f22b464dd`), which includes Gate P4, C06, and the current frontend deployment fix.
- A06 is an operations and release bundle; it depends on A05 only.
- Invariant scenarios execute deterministically against an in-memory CAS ledger;
  PostgreSQL durability is covered by the existing integration suites.
- The Arc Mainnet profile remains strictly disabled and unpinned (`UNPUBLISHED`), failing closed. No mainnet transaction is broadcast.

## Plan

1. Create database bootstrap and safe demo reset utilities in `@oneshot/storage-postgres`.
2. Implement 7 core invariant scenarios in `@oneshot/worker` and provide unit tests and CLI runner.
3. Expose operational scripts in root `package.json` (`scenarios:invariants`, `db:bootstrap`, `db:reset-demo`).
4. Publish comprehensive `docs/OPERATIONS_RUNBOOK.md` covering architecture, bootstrap, demo reset, invariant results, safe-disable, and observability.
5. Publish reviewer-facing `docs/MAINNET_READINESS.md` with `STATUS: DEPLOYMENT-READY`, Cloud Run deployment manifest, probe evidence, and human activation gate.
6. Verify quality, run Gate A review, push branch, open draft PR, monitor CI, run Gate B review, and mark ready for human review.

## Key decisions

- Invariant scenario runner covers all 7 required cases: identical replay, conflicting replay, 10 parallel workers, 2 competing processes, process restart/recovery, lost response/ambiguity, and downstream failure.
- Database reset explicitly guards against production and mainnet execution (`NODE_ENV === 'production'` / `ONESHOT_ARC_PROFILE === 'arc-mainnet'`), requiring `--force`.
- Preserves `schema_versions` during demo reset and never touches external chain history.
- Mainnet profile remains structurally valueless and unpinned, requiring three distinct gates for future activation.

## Files/components touched

- `packages/storage-postgres/src/bootstrap.ts`: safe bootstrap and demo reset functions.
- `packages/storage-postgres/src/index.ts`: export bootstrap and reset functions.
- `packages/storage-postgres/test/bootstrap.test.ts`: unit tests for bootstrap and reset guardrails.
- `apps/worker/src/invariant-scenarios.ts`: implementation of 7 invariant scenarios and results formatter.
- `apps/worker/src/index.ts`: export invariant scenarios.
- `apps/worker/test/invariant-scenarios.test.ts`: unit tests verifying all 7 scenarios and at-most-one settlement invariant.
- `scripts/run-invariant-scenarios.mjs`: CLI runner for invariant scenarios.
- `scripts/bootstrap-db.mjs`: safe database bootstrap script.
- `scripts/reset-demo-db.mjs`: safe demo reset script.
- `package.json`: operational scripts `scenarios:invariants`, `db:bootstrap`, `db:reset-demo`.
- `docs/OPERATIONS_RUNBOOK.md`: comprehensive operations, observability, and rollback runbook.
- `docs/MAINNET_READINESS.md`: reviewer-facing mainnet-readiness artifact per `plan.md:357`.

## Commands/checks

- `pnpm build`: PASS
- `pnpm --filter @oneshot/storage-postgres test`: 7 tests PASS
- `pnpm --filter @oneshot/worker test`: 25 tests PASS
- `pnpm scenarios:invariants`: PASS (all 7 scenarios PASS, at most 1 settlement verified)
- `pnpm check:generated`: PASS (0 drift)
- `pnpm validate:fixtures`: PASS (16 fixtures valid)
- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (49 test files, 605 tests)
- `npx markdownlint-cli2`: PASS

## External-doc findings

- Verified against `docs/settlement/SETTLEMENT_CONFIG_V1.md` and `packages/arc-adapter/src/profiles.ts`: Arc Mainnet is unpublished, has 0 guessed constants, and fails closed with `PROFILE_UNPUBLISHED`.
- Verified against `plan.md:357`: `MAINNET_READINESS.md` includes status line `DEPLOYMENT-READY`, pinned vs unpinned identities, deployment manifest, readiness probe evidence, rollback procedure, and human activation gate.

## Unresolved questions

- None. Milestone A06 scope is complete.

## Git and PR state

- Branch: `milestone/a06-release-operations`
- Base: `origin/develop` (`36df8fa06b94a0c08e32fa729a41ef2f22b464dd`)
- A06 commit before base refresh: `b36f53a3fad0b6fb40f413e91490efb6fbfc2069`
- PR: #35 (`https://github.com/SWOFART/OneShot/pull/35`)
- CI: previous head passed Cloudflare Workers build; new merged head pending push

## Review gates

- Gate A: `VERDICT: PASS` for tree
  `6ce25ac3fe84fcfea32c4c68df2292e6410b5fdf`, then invalidated when `develop`
  advanced and produced a PR merge conflict. Fresh review required for the
  merged candidate tree.
- Gate B: pending

## Handoff/next steps

1. Run fresh Gate A review on the merged candidate tree.
2. Complete and push the merge commit to PR #35.
3. Wait for CI checks on the new head.
4. Run Gate B review via `free-pi-cli`.
5. Update PR body and mark ready for review.
