# Session Context: Gate P4 Backend Convergence and Adapter Replacement

## Date/time

- UTC: 2026-09-07T23:48:00Z

## User goal

Implement Gate P4 backend convergence: replace checked simulators in `apps/worker` with reviewed Lane B adapters (`ArcSettlementAdapter`, `PrivyAuthorizationAdapter`) and Lane C recovery engine (`RecoveryService`), bridge the known `EvidencePort` proof envelope gap, implement durable command persistence seam over `IntentLedger`, and verify full integrated convergence.

## Original prompt/request

"Start Gate P4: Backend Convergence and Simulator Replacement (wire real ArcSettlementAdapter, PrivyAuthorizationAdapter, and RecoveryService into apps/worker)"

## Assumptions

- PR #29 (C04) merged into `develop` at `50d8e7b4ba9ff247464ff9b0b36c19227c4c538d`.
- PR #27 (Lane B P4 adapters) and PR #24 (Lane B integration) are merged into `develop`.
- Gate P4 composition preserves the single-intent / at-most-one-settlement invariant.
- Persistence for recovery commands is owned by Lane A (`apps/worker`) implementing `RecoveryCommandStorePort` over `IntentLedger`.

## Plan

1. Add `@oneshot/privy-adapter`, `@oneshot/arc-adapter`, and `@oneshot/reconciliation` to `apps/worker/package.json`.
2. Implement `IntentLedgerRecoveryStore` and `IntentLedgerLocalStatePort` in `apps/worker` implementing `RecoveryCommandStorePort` and `LocalRecoveryStatePort`.
3. Implement `PrivyArcEvidenceBridge` satisfying `KnownIdentityEvidencePort` by bridging `@oneshot/privy-adapter`'s `EvidencePort` with verified Arc transaction evidence.
4. Update `apps/worker/src/composition.ts` and `apps/worker/src/worker.ts`:
   - Wire `ArcSettlementAdapter` and `PrivyAuthorizationAdapter` for production profile.
   - Wire `RecoveryService` into `reconcile_intent` task.
5. Add unit and integration test coverage for production composition and end-to-end reconciliation execution.
6. Run full verification suite (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `TEST_POSTGRES=1 pnpm test:integration`, fixtures, markdownlint).
7. Run FreePi Gate A review with `free-pi-cli` (`glm-5.3-flash`), commit, push, create draft PR, verify CI, and run FreePi Gate B review.

## Key decisions

- Bridge `EvidencePort` in `apps/worker` to enrich Lane B's classification with sanitized proof envelope without mutating Lane B's frozen packages.
- Implement `RecoveryCommandStorePort` over `IntentLedger` using atomic CAS (`expectedStateVersion`) to ensure zero double-reconciliation.
- Keep `apps/worker` composition fail-closed on contract version, network, or policy drift.

## Files/components touched

- `apps/worker/package.json`: add lane B and C workspace dependencies.
- `apps/worker/src/composition.ts`: production composition wiring and `createProductionRecoveryService`.
- `apps/worker/src/index.ts`: export recovery-bridge.
- `apps/worker/src/types.ts`: add recoveryService to WorkerOptions.
- `apps/worker/src/worker.ts`: `reconcile_intent` task implementation with true post-reconciliation ledger state logging.
- `apps/worker/src/recovery-bridge.ts`: persistence and verified evidence bridges for Gate P4.
- `apps/worker/test/p4-composition.test.ts`: test production composition, verified evidence envelopes, and durable CAS persistence.
- `packages/storage-postgres/src/ledger.ts`: support UNKNOWN->COMMITTED/FAILED_SAFE in completeSubmission and durable outbox deduplication.
- `docs/GATE_P4_CHECKLIST.md`: update status and replacement instructions.
- `pnpm-lock.yaml`: update workspace lockfile.

## Commands/checks

- `git checkout -b milestone/gate-p4-convergence 50d8e7b4ba9ff247464ff9b0b36c19227c4c538d` - PASS.

## External-doc findings

- `docs/GATE_P4_CHECKLIST.md`, `packages/reconciliation/docs/GATE_P4_RECOVERY_REPLACEMENT.md`, and `docs/settlement/GATE_P4_LANE_B_READINESS.md`.

## Unresolved questions

- None.

## Git and PR state

- Branch: `milestone/gate-p4-convergence`
- Base: `develop` (`50d8e7b4ba9ff247464ff9b0b36c19227c4c538d`)
- Commit: uncommitted
- PR: not created
- CI: not applicable

## Review gates

- Gate A: IN PROGRESS (running FreePi pre-push review)
- Gate B: PENDING (runs after PR creation and CI)

## Handoff/next steps

1. Stage candidate changes and compute candidate tree SHA via `git write-tree`.
2. Run FreePi Gate A review (`glm-5.3-flash`) and verify `VERDICT: PASS`.
3. Commit, push branch to GitHub, and open draft PR.
4. Verify CI checks.
5. Run FreePi Gate B review and mark PR ready for review.
