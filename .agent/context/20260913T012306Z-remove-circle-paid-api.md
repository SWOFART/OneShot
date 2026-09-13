# Session context: remove Circle paid API surface

- Date: 2026-09-13
- User goal: create a new branch that removes the Circle x402 paid-API product, the repository's own paid API seller/proxy, and related product documentation while preserving `.agent/context/` history.
- Branch: `feature/remove-circle-paid-api`
- Base: `origin/develop` at `b942732b0229f8e749da13df36a8f6d378894ec1`

## Assumptions and non-goals

- Remove active Circle paid-API buyer/seller/proxy routes, UI, Gateway funding/signing helpers, contracts, adapters, runtime configuration, and user-facing documentation.
- Preserve Team Report, direct Arc/User Wallet payment, Privy authentication, generic Arc receipt verification, and recovery for the remaining direct-payment flow.
- Preserve historical `paid_api_requests` migrations and existing context records; do not rewrite applied migration history or destroy production data.
- This branch removes the product surface; it does not attempt to reconcile or delete already-created paid-API intents.

## Safety and acceptance criteria

- No active `/v1/paid-api*` or `/api/premium/*` product route remains.
- The web console contains no Circle paid-API purchase, Gateway funding, or x402 signing controls.
- Team Report and direct USER_WALLET payment paths remain available and preserve at-most-once settlement behavior.
- Historical migrations remain ordered and schema-digest checks remain valid.
- Circle paid-API packages, seller deployment artifacts, dependencies, tests, and non-context documentation are removed or updated without secrets.
- Existing durable paid-API records remain untouched and are not blindly retried or deleted.

## Plan

1. Remove active paid-API API, worker, supplier, seller, web, contract, and configuration paths.
2. Remove paid-API-specific tests/dependencies and regenerate contracts.
3. Remove user-facing Circle paid-API/proxy documentation while preserving context history and migration history.
4. Run focused tests, full validation, generated checks, browser checks, conflict scan, and secret scan.

## Gate state

- Gate A: not run.
- Gate B: not run.
- Commit/PR: not created.

## Local validation

- `pnpm test`: passed — 76 files / 1032 tests.
- `pnpm test:browser`: passed — 8/8.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm format:check`: passed.
- `pnpm check:generated`: passed.
- `git diff --check`: passed.
- PostgreSQL-gated integration tests were not run locally because no container runtime was available.

## Handoff

- The feature removal is intentionally separate from any settlement-reconciliation repair. Existing paid-API records remain durable for audit; this branch does not claim that their prior UNKNOWN outcomes are resolved.
