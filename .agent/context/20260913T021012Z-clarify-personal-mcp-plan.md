# Session Context: clarify-personal-mcp-plan

## Date/time

- UTC: 2026-09-13T02:10:12Z

## User goal

Split the PR #112 plan into clear, ordered subtasks and reduce ambiguity about
the first deliverable.

## Original prompt/request

"Раздели md plan, сделай четче на подзадачи." Follow-up: keep the plan focused
only on the direct `arc_payment` flow.

## Assumptions

- The first release exposes exactly one MCP tool, `arc_payment`.
- The first release reuses the existing Privy server execution wallet and Arc
  settlement worker.
- Personal wallets and additional signers are a later milestone.

## Plan

1. Rewrite the plan around one minimal server-wallet MCP milestone.
2. Give every task dependencies, concrete work, and an exit condition.
3. Preserve personal-wallet architecture as a separately gated milestone.
4. Validate Markdown, obtain Gate A, update PR #112, wait for CI, then obtain
   Gate B.

## Key decisions

- `arc_payment` is a direct Arc USDC transfer.
- Browser and MetaMask wallets do not participate in milestone 1 payment
  execution.
- The MCP handler reuses existing durable intent and settlement paths.
- Aggregate exposure needs a rolling cap or one-intent demo quota; a
  per-payment cap alone is insufficient.

## Files/components touched

- `docs/PERSONAL_MCP_PRIVY_AGENT_PAYMENTS_PLAN.md`
- `.agent/context/20260913T021012Z-clarify-personal-mcp-plan.md`

## Commands/checks

- `markdownlint-cli2` for the plan and context: PASS, 0 errors.
- `git diff --check`: PASS.
- Prettier check for the plan and context: PASS.

## External-doc findings

- Privy supports additional signers with per-signer override policies; this is
  retained for milestone 2 rather than milestone 1.
- Privy policy evaluation defaults to deny when no rule matches.

## Unresolved questions

- Choose a Privy rolling cap or a one-intent quota before the MCP endpoint is
  exposed beyond a controlled demo.

## Git and PR state

- Branch: `plan/personal-mcp-privy-agent-payments`
- Base: current `origin/develop` merged before editing.
- PR: #112, draft.

## Gate A/B state

- Gate A: pending for the rewritten candidate tree.
- Gate B: pending after push and CI.

## Handoff/next steps

- Complete Gate A, commit, push, CI, and Gate B.
