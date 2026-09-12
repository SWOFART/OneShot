# Session Context: Circle x402 authorization window

## Date/time

- UTC: 2026-09-12T18:30:00Z

## User goal

Make the user-funded Circle x402 API purchase complete reliably after the connected wallet signs, without weakening OneShot's at-most-once or fail-closed settlement guarantees.

## Original prompt/request

High-fidelity restatement: a user-wallet Circle paid-API submit returned HTTP 503 after the wallet approval; deploy the API and fix the issue. Existing paid Team Report activity also needs separate reconciliation because the frontend still shows historical UNKNOWN outcomes.

## Assumptions

- The submitted Circle authorization was rejected before supplier forwarding because the adapter allowed exactly 600 seconds of `validAfter` clock skew while Circle's browser signer deliberately backdates by about 600 seconds; ordinary wallet approval latency then exceeds the bound.
- No live authorization payload, token, wallet credential, or payment will be replayed during diagnosis or tests.
- Aggregate activity metrics alone cannot identify or resolve a particular historical Team Report UNKNOWN record; a task key or business-intent ID is required for a targeted read-only reconciliation audit.

## Plan

1. Extend the bounded `validAfter` allowance enough for Circle's standard backdating plus normal wallet-response latency, retaining all payer, quote, expiry, and receipt checks.
2. Return a clear client error for a pre-forward refusal and display only that sanitized message in the browser.
3. Add regression tests for accepted delayed authorization, refusal before forwarding, API status mapping, and UI notice.
4. Run required checks, obtain fresh Gate A, commit/push a PR, then deploy only the approved merged API revision.

## Key decisions

- Use a 15-minute maximum `validAfter` age: it preserves a bounded authorization window while allowing the signing SDK's 10-minute backdating plus a normal five-minute user approval delay.
- Treat a rejected authorization as HTTP 400, not HTTP 503. It is definitely pre-forward, so a fresh signature is safe; ambiguity remains UNKNOWN and is never retried blindly.

## Files/components touched

- `packages/supplier-adapter/src/circle-x402.ts` - bounded 15-minute `validAfter` age allowance.
- `packages/supplier-adapter/test/circle-x402.test.ts` - delayed authorization and too-old pre-forward refusal coverage.
- `apps/api/src/app.ts` and `apps/api/test/app.test.ts` - safe HTTP 400 mapping for pre-forward authorization refusal.
- `apps/web/src/api/paid-api-client.ts`, `apps/web/src/components/JobWorkspace.tsx`, and `apps/web/test/paid-api.test.tsx` - allowlisted safe client message and browser notice coverage.

## Commands/checks

- Read mandatory repository policy, payment/reliability skills, test matrix, implementation loop, and active session guidance.
- Read-only Cloud Run/log inspection: the deployed API revision accepts the prepare endpoint; a later submit reached the API and returned 503. Runtime configuration names required for the signerless user-wallet flow are present without reading their values.
- `pnpm build` - passed.
- Focused supplier/API/web tests - 22, 72, and 87 passed respectively.
- `pnpm test` - 82 files / 1,087 tests passed.
- `pnpm test:browser` - 8 passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:generated`, and `git diff --check` - passed.
- `git fetch origin develop` followed by fast-forward sync to `e236c07c00f21b449e9b740488a24496840ced54`, then the full validation sequence was rerun successfully on that base.

## External-doc findings

- Local Circle integration test and browser signer adapter show the signer uses a backdated `validAfter` value; no external source is needed for this code-local behavior.

## Unresolved questions

- Which exact historical Team Report task key or business-intent ID should be audited after this API fix is released?

## Git and PR state

- Branch: `fix/circle-x402-authorization-window`
- Base: `origin/develop` at `e236c07c00f21b449e9b740488a24496840ced54`
- Commit: base checkout; implementation uncommitted
- PR: not created
- CI: not run for this branch

## Review gates

- Gate A: NOT RUN; candidate must be staged and reviewed after context update
- Gate B: NOT RUN

## Handoff/next steps

1. Implement and test the bounded timing and error-reporting fix.
2. Keep the historical Team Report UNKNOWN investigation separate and read-only.
