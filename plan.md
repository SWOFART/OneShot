# OneShot Product Plan

OneShot is a durable Arc Testnet payment orchestrator for business agents.

## In scope

- Privy authentication and connected-wallet selection.
- Direct user-wallet payments for Team Report jobs.
- Worker-owned Arc settlement where the product explicitly requires it.
- Durable intent, settlement, receipt, recovery, and reconciliation state.

## Out of scope

- Retired third-party API purchasing and seller-proxy flows.
- Retired balance-funding and provider-specific signing flows.
- New payment rails or multi-leg payment flows.

## Safety requirements

- Preserve one-intent/at-most-one-settlement behavior.
- Keep ambiguous external outcomes UNKNOWN and reconcile without blind retry.
- Preserve historical database migrations and existing records; this branch removes the retired runtime surface.

## Validation

- Run the repository test, typecheck, lint, formatting, and generated-contract checks.
- Run browser acceptance tests when the web surface changes.
- Complete FreePi Gate A before publishing the branch and Gate B after any pull request.
