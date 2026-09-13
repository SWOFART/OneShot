# Session Context: user-wallet-recovery

## Date/time

- UTC: 2026-09-12T20:00:00Z

## User goal

Repair safe recovery for final user-wallet payments after a browser reload, and diagnose the Circle x402 user-funded API flow without risking a second payment.

## Original prompt/request

The user reports a final Team Report transaction shown as UNKNOWN after refresh and a Circle API authorization that returned 202/UNKNOWN without moving funds. They provided public intent identifiers and the Team Report transaction hash for read-only diagnosis.

## Assumptions

- The user-authorized Team Report transaction hash is public chain data and may be used only to reconcile that same durable intent.
- No new payment, signature replay, or replacement transaction is authorized while either outcome is UNKNOWN.

## Plan

1. Add an explicit same-hash-only user-wallet reconciliation path for a durable job and expose it after reload.
2. Preserve at-most-once settlement and test the final-receipt, missing-hash, and non-user-wallet cases.
3. Keep Circle authorization failures fail-closed and report the Gateway funding prerequisite separately.

## Key decisions

- A generic activity refresh is not a payment reconciler. Recovery must re-verify the hash already bound to the durable user-wallet job and must not ask the wallet to send another transaction.
- Circle Gateway nanopayments are off-chain authorizations funded from a Gateway wallet balance; an HTTP 402 from the seller is not proof of an on-chain debit.

## Files/components touched

- `apps/web/src/components/JobWorkspace.tsx` - prevents a prepared replay with a durable hash from opening a replacement transfer, and exposes same-hash-only verification in Requests.
- `apps/web/src/auth/privy-session.tsx` and `session.ts` - reads the public Circle Arc Testnet Gateway balance before requesting an x402 signature.
- `apps/web/test/components.test.tsx`, `paid-api.test.tsx`, and `privy-session.test.tsx` - regression coverage for no replacement transfer, same-hash recovery, zero-balance refusal, and balance parsing.

## Commands/checks

- Read-only Arc RPC receipt check - the supplied Team Report hash is successful and has exactly one matching USDC Transfer event.
- Cloud Run logs - Team Report submit returned 202 before final receipt availability; Circle seller returned 402 for the forwarded signed request.
- `gcloud.cmd run services describe oneshot-seller ...` - seller address configuration matches the reviewed quote; default Circle Arc Testnet facilitator is used.
- Circle Gateway balance API query for the connected public address - Arc Gateway balance is `0`; this explains the Circle 402 without a debit.
- `pnpm test` build phase and `pnpm exec vitest run --exclude apps/web/browser/**` - build completed and 82 files / 1087 tests passed.
- `pnpm --filter @oneshot/web exec node scripts/run-browser-tests.mjs` - 8/8 passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm check:generated` - passed.

## External-doc findings

- Circle Gateway Nanopayments documentation (reviewed 2026-09-12) says buyers fund a Gateway Wallet balance and sign off-chain EIP-3009 authorizations; the seller returns the resource plus PAYMENT-RESPONSE only after valid settlement.

## Unresolved questions

- Whether the user's Gateway Wallet has a funded Arc Testnet balance; no signed payload or wallet credential will be collected to diagnose it.

## Git and PR state

- Branch: `fix/user-wallet-recovery`
- Base: `origin/develop` at `3463daf7905a3f1b74e46e0884835b1cb7b433df`
- Commit: uncommitted
- PR: not created
- CI: not applicable

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Stage the scoped web recovery/preflight change, capture immutable Gate A evidence, and obtain fresh Gate A before any commit or push.
2. After a human merges and the web Worker deploys, use Requests -> Check recorded transaction (no payment) for the known final Team Report transaction.
3. Fund the connected wallet's Arc Testnet Circle Gateway balance before attempting a fresh Circle x402 authorization; do not reuse the old authorization.
