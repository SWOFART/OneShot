# Session Context: Circle x402 payment fix

## Date/time

- Started UTC: 2026-09-11T20:03:45Z
- Completed UTC: 2026-09-11T23:00Z

## User goal

Make the Circle x402 paid-API flow complete through OneShot, Privy, Circle Gateway, and Arc Testnet. Direct Arc transfers already work; x402 must create one durable intent and one settlement.

## Original prompt/request

The Circle x402 workspace action remains `AUTHORIZING`/`FAILED_SAFE` and does not return the paid API result. Fix the x402 payment path without allowing a second settlement.

## Assumptions

- The previously observed failed-safe intent is terminal and had no external transaction; it must not be retried with the same task key.
- Testnet-only live validation is authorized; use a fresh task key only after deployment and never retry an unresolved intent.
- Existing untracked deployment files (`.gcloudignore`, `cloudbuild-api.yaml`, `cloudbuild-worker.yaml`) are user-owned and remain out of scope.

## Plan/result

1. Bound Circle x402 durable provider identities to the provider-safe 64-character limit and cover long intent IDs. **Done.**
2. Persist Circle's transfer UUID and paid response before Arc confirmation. **Done.**
3. Verify Circle Gateway `submitBatch` calldata and `BatchProcessed` receipt evidence. **Done.**
4. Reconcile the already-paid live intent without issuing another payment. **Done.**
5. Run the implementation loop and prepare a stacked PR. **Pending commit/PR.**

## Key decisions

- The live failure occurred before external submission (`FAILED_SAFE`, no evidence) and is safe to diagnose without replaying it.
- The running Cloud Run images use a reused `resumable-jobs-480c0ab` tag; the current source contains the Circle settlement routing added later. A uniquely tagged build is required to remove image-provenance ambiguity.
- Circle x402 provider identity now derives from the full request fingerprint with a 52-hex suffix (`circle-x402:` + 52), keeping the identity deterministic and 64 characters while preserving the full fingerprint separately.
- Circle `PAYMENT-RESPONSE.transaction` can be a transfer UUID, not an Arc tx hash. The UUID is now durable (`provider_transfer_id`), looked up through Circle's read-only transfer API, and bound to payer, seller, amount, and Arc network before accepting its tx hash.
- Circle Gateway batches do not necessarily emit a payer-to-recipient ERC-20 `Transfer`. For x402, authoritative proof is the Circle transfer identity plus decoded Gateway `submitBatch` deltas and its matching `BatchProcessed` event. Graph candidates remain observation-only and may be zero.
- Recovery remains fail-closed: the advisor can recommend `RETURN_EXISTING_RESULT`, while the deterministic core alone marks `COMMITTED`; settlement permission remains `NEVER`.

## Files/components touched

- `packages/supplier-adapter/src/circle-x402-settlement.ts` - bounded deterministic provider identity and matching settlement reference.
- `packages/supplier-adapter/test/circle-x402-settlement.test.ts` - long-intent identity regression test.
- `packages/supplier-adapter/src/circle-x402.ts` - transfer UUID parsing and Circle transfer lookup.
- `packages/arc-adapter/src/receipt.ts` - Circle Gateway batch receipt verifier.
- `apps/worker/src/recovery-bridge.ts` - durable transfer lookup, Arc batch evidence, and no false Graph proof.
- `packages/storage-postgres/migrations/008_circle_x402_transfer_identity.sql` - durable transfer UUID column.
- `packages/privy-adapter/src/privy-wallet-provider.ts` - transaction input lookup for Gateway calldata.
- `docs/CIRCLE_X402_DEMO.md` and `packages/storage-postgres/MIGRATIONS.md` - runbook/schema updates.
- `.agent/context/20260911T200345Z-circle-x402-payment-fix.md` - session record.
- Cloud Run API/worker deployment - operational rollout only; no secrets or credentials recorded.

## Commands/checks

- Live `GET /v1/paid-api/<old-intent>` and `GET /v1/intents/<old-intent>` - original task was `UNKNOWN`; it was reconciled read-only to `COMMITTED` after the existing Circle transfer was found. No second task/payment was created.
- Public x402 quote `GET https://oneshot.kapustazh.dev/api/premium/dataset` - HTTP 402 with valid Arc Testnet USDC Circle Gateway requirements.
- `pnpm test` - PASS, 80 files / 1049 tests.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:generated`, `git diff --check` - PASS.
- Live Circle transfer: `66e4c182-6b84-42ad-95b9-94ffb73f5693`; Arc tx `0xaceb983a37537634fa6168053cdd6807f6f16a06cf82b5a67280e1c69e2f70a5`; block `61625301`; Gateway batch log index `12`.
- Live paid result is durable and replayable: seller dataset response persisted; same task key returned the existing `COMMITTED` intent and same tx hash.
- Recovery view: `recommendation_source=RECOVERY_AGENT`, `recommended_action=RETURN_EXISTING_RESULT`, `core_disposition=MARK_COMMITTED`, `settlement_permission=NEVER`, Graph Studio available but `candidate_count=0`/`LAGGING` (expected for Gateway batch).
- Cloud Run: worker revision `oneshot-worker-00027-jkx`; API revision `oneshot-api-00012-r68`; storage schema version `008_circle_x402_transfer_identity.sql` applied.
- Node runtime warning: local Node 22.23.2 differs from repository-required Node 24.19.0; checks passed despite the warning.

## External-doc findings

- No new sponsor claim was made. Existing Circle Gateway x402 implementation is constrained to Arc Testnet native USDC and the configured maximum.

## Unresolved questions

- None for the Circle x402 path. Future fresh demos must use a new task key and must never retry an unresolved intent before reconciliation.

## Git and PR state

- Branch: `fix/circle-x402-payment`
- Base: `develop` at `4d28073` (PR #91 is merged)
- Commit: `e7d2dac` (`fix(x402): reconcile Circle transfer UUIDs`)
- PR: [#92](https://github.com/SWOFART/OneShot/pull/92), open against `develop`
- CI: GitHub checks queued/in progress; local checks pass

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Review PR #92 and its queued GitHub checks.
2. Leave user-owned `cloudbuild-worker.yaml`, `.gcloudignore`, and `cloudbuild-api.yaml` untouched/un-staged.
3. Gates A/B remain skipped by explicit user authorization.
