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
- Gate A/B: not run for this branch.
