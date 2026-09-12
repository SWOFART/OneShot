# Session Context: Circle x402 user-wallet validity window

## Date/time

- UTC: 2026-09-13T00:03:00Z

## User goal

Make the user-funded Circle Gateway x402 paid-API flow complete successfully instead of producing UNKNOWN when Circle rejects a delayed wallet authorization.

## Original prompt/request

The same paid-API errors continued: the user wallet signed, OneShot returned 202, no money moved, and the paid API remained UNKNOWN. Safe identifiers and provider evidence were supplied; no secrets were requested or recorded.

## Assumptions

- Circle Gateway verification is the authoritative pre-settlement boundary; a failed verification has no payment effect.
- The durable quote remains the source of amount, payer, recipient, asset, and network binding.

## Plan

1. Confirm the provider rejection reason with a read-only Circle verify call.
2. Add bounded approval slack to user-wallet signing and server validation.
3. Map an explicit seller verification refusal to FAILED_SAFE while preserving UNKNOWN for settlement ambiguity.
4. Run full repository validation before review or deployment.

## Key decisions

- Use a 605800-second authorization window (7 days plus the SDK buffer and a bounded 900-second human approval buffer).
- Keep seller-published durable quote data unchanged; the extended value is used only in the signed authorization and is accepted by Circle verify.
- Do not retry or settle any existing intent and do not store signatures.

## Files/components touched

- `packages/contracts/src/circle.ts` and `packages/contracts/src/index.ts` - shared validity-window constant.
- `apps/web/src/auth/privy-session.tsx` - sign user-wallet x402 authorizations with the bounded approval buffer.
- `packages/supplier-adapter/src/circle-x402.ts` - preserve the 15-minute validAfter tolerance, accept the bounded validBefore window, and classify explicit verification refusal as pre-submit safe.
- Focused web/supplier tests for the new window and refusal behavior.

## Commands/checks

- Read-only Circle `/v1/x402/verify` - returned `authorization_validity_too_short` for the supplied historical authorization.
- `pnpm.cmd test` - 82 files / 1086 tests passed.
- `pnpm.cmd typecheck` - passed.
- `pnpm.cmd lint` - passed.
- `pnpm.cmd format:check` - passed.
- `pnpm.cmd check:generated` - passed.
- `git diff --check` - passed.

## External-doc findings

- Circle Gateway x402 verification requires a minimum seven-day authorization validity window; the SDK publishes a small buffer. The implementation adds a bounded human approval buffer and keeps the strict network/asset/domain checks.

## Unresolved questions

- PostgreSQL-gated tests were not separately run because this change is limited to web, contracts, and supplier-adapter code; full default validation passed.
- Production API and frontend deployment are still pending review/merge.

## Git and PR state

- Branch: `fix/circle-x402-validity-window`
- Base: `origin/fix/circle-x402-persistence` at the starting feature tip
- Commit: source fix `7cc12e18e513a18029cdcc534d5dac1c1ce2b4fd`
- PR: not created
- CI: not run; local validation is recorded above

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Run Gate A on the exact candidate tree.
2. After approval, merge/push and deploy the API image plus the web bundle; the seller image has no source change for this fix.
3. Test with one new paid-API task only after deployment; do not retry the old UNKNOWN intent blindly.
