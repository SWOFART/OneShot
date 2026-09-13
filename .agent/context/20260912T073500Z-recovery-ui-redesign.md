# Recovery UI redesign — active context

## Goal

Make payment proof and recovery evidence readable inside the authenticated
workspace while keeping the existing recovery API and settlement safety rules.

## Acceptance criteria

- Payment proof is a compact, readable read-only surface with real request facts.
- Recovery control keeps state, safe actions, timeline, attempts, decision split,
  Graph observation, and sanitized evidence in the selected request view.
- Graph is visible with an explicit unavailable/not-reported state when the API
  has no observation; absence never implies no payment.
- The synthetic standalone `/recovery/` viewer is not emitted by the production
  frontend build.
- Arc Testnet (`eip155:5042002`) and USDC remain the only settlement network and
  asset. No payment API, wallet policy, or settlement behavior changes.
- No demo or presentation work is included.

## Non-goals

- Do not change the recovery API or server contract.
- Do not add payment actions, wallets, networks, or production fixture data.
- Do not perform live payments, deployment, or external policy mutation.

## Branch state

- Branch: `fix/recovery-ui-redesign`
- Base: `origin/develop` at `c6c5d5f27285c002a23d06c5213da8dab60d1ef7`
- Carried hero fix: `750ffb6`
- Context record: `148a7f6`

## Implementation

- Cabinet keeps the restored `Your payment workspace` flow and presents one
  `Payment proof` section with selected request facts, activity counters, and
  read-only settlement evidence followed by `Recovery control`.
- Recovery control carries state, safe refresh/escalation boundaries, Graph
  candidate discovery, durable timeline, attempts, decision split, evidence,
  and diagnostics. Missing Graph data is shown as `NOT REPORTED`; it never
  implies that no payment occurred.
- Settlement details now lead with Arc Testnet request, recipient, amount, and
  verification status. User-facing navigation and actions use `Payment proof`
  and `Recovery control`.
- The synthetic standalone recovery viewer is retained for local package tests
  but removed from `build:frontend`; the recovery API and payment behavior are
  unchanged. The synthetic mock version marker was removed from the UI-only
  contract.

## Validation

- `pnpm --filter @oneshot/recovery-ui verify` — PASS (51 tests).
- `pnpm --filter @oneshot/settlement-ui verify` — PASS (208 tests).
- `pnpm --filter @oneshot/web exec vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 --no-file-parallelism` — PASS (79 tests).
- `pnpm --filter @oneshot/web exec playwright test --config=playwright.config.ts --workers=1` — PASS (8 tests).
- `pnpm build` — PASS; `pnpm build:frontend` — PASS, no `apps/web/dist/recovery` emitted.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, and
  `pnpm check:generated` — PASS.
- Gate A/B: pending for the final staged tree and PR head.
