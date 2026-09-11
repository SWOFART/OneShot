# Session Context: Privy reference ID length fix

## Date/time

- UTC: 2026-09-11T18:47:39Z

## User goal

Restore live Arc/Privy payments that currently end in `FAILED_SAFE` / `NOT_REQUESTED`.

## Original prompt/request

Investigate the submitted payment shown in the supplied screenshots and fix why it does not work.

## Assumptions

- The live failed intent is safe to leave closed; its ledger evidence says no broadcast occurred.
- Testnet-only validation is sufficient; do not create a new external payment solely for verification.

## Plan

1. Bound Privy `reference_id` to its provider limit while preserving deterministic idempotency.
2. Add a regression test for production-length business intent IDs.
3. Run checks, obtain fresh Gate A/B reviews, open a PR, and deploy the patched API/worker images.

## Key decisions

- Keep short references readable as `oneshot-<business_intent_id>`.
- For longer contract-valid IDs, derive a deterministic 56-hex fingerprint suffix, yielding exactly 64 characters.
- Keep the full payload fingerprint as `idempotency_key`; Privy permits its longer length and it preserves duplicate collapse.

## Files/components touched

- `packages/privy-adapter/src/request.ts` - bounded deterministic Privy reference ID.
- `packages/privy-adapter/test/request.test.ts` - long-ID regression coverage.

## Commands/checks

- `pnpm --filter @oneshot/privy-adapter test -- --run test/request.test.ts` - 22 passed.
- `pnpm format:check; pnpm lint; pnpm typecheck; pnpm test` - passed; 80 files / 1041 tests.
- `pnpm --filter @oneshot/worker test -- --run test/failure-injection.test.ts test/invariant-scenarios.test.ts test/worker.test.ts` - 3 files / 18 passed.
- Live authoritative intent lookup - `REQUEST_VALIDATION_FAILED` before broadcast; no evidence/transaction.

## External-doc findings

- Privy Ethereum `eth_sendTransaction` and transaction reference ID documentation state `reference_id` is capped at 64 characters; this explains the live pre-broadcast rejection.

## Unresolved questions

- None for the code fix. The old failed intent remains terminal by design and needs a new task key after deployment for a fresh attempt.

## Git and PR state

- Branch: `fix/privy-reference-id-length`
- Base: `origin/develop` (`f5a3fb335bbcdec832ad2895b0f175276300bd21`)
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: PASS; `free-pi-cli`, platform-reported `deepseek-v4-flash`, reviewed base `f5a3fb335bbcdec832ad2895b0f175276300bd21`, staged target `fix/privy-reference-id-length`, tree `d0f1786d0df876a22d6ad22921712e2732ad1b83`.
- Gate B: NOT RUN

## Handoff/next steps

1. Inspect and stage only the two implementation files plus this context record.
2. Capture immutable base/tree identities, run Gate A, commit, push, open draft PR, await CI, then run Gate B.
3. Build and deploy updated API/worker images without changing deployment configuration files.
