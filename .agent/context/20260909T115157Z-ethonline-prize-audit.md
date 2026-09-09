# Session Context: ETHOnline 2026 Prize Audit

## Date/time

- UTC: 2026-09-09T11:51:57Z

## User goal

Audit `plan.md` against the official ETHOnline 2026 requirements for The
Graph, Arc, and Privy; clarify whether Circle/Arc products can coexist with a
Privy-first wallet architecture; and update the plan on a new branch.

## Original request

Review `plan.md` against the official ETHOnline 2026 prize page for The Graph,
Arc, and Privy, add the Privy-versus-Arc-wallet analysis and detailed bounty
compliance checklist, and do all work in a new branch.

## Acceptance criteria

- Explain Circle's platform, Arc, Circle Wallets, and the ambiguous term "Arc
  wallet" without treating them as one product.
- State which Circle integrations can preserve Privy as the load-bearing wallet
  and policy boundary.
- Map every selected sponsor requirement to repository evidence and a
  fail-closed status.
- Identify missing submission artifacts and unclaimed/ineligible tracks.
- Update only documentation; do not change payment behavior or external state.

## Assumptions and non-goals

- The official prize page captured on 2026-09-09 is the source of truth for
  sponsor requirements.
- The repository began after the 2026-09-04 ETHOnline kickoff, so The Graph's
  Start Fresh pool is the intended pool; ETHGlobal registration must still
  match that selection.
- Existing P5 work belongs to the user and is preserved unchanged.
- No Circle Wallets, Agent Stack, App Kit, EURC, or mainnet integration is
  implemented as part of this documentation-only audit.

## Plan

1. Compare official sponsor criteria with the current plan and live evidence.
2. Correct stale or over-broad sponsor claims.
3. Add wallet-stack compatibility guidance and per-requirement checklists.
4. Run documentation-focused validation and inspect the final diff.

## Key decisions

- Keep Privy as the source wallet, signer, and remote policy boundary for the
  required settlement path.
- Treat Arc as the EVM L1 settlement rail and Circle Wallets as an optional,
  separate wallet product; there is no required product named "Arc Wallet."
- Keep Circle Agent Stack unclaimed because its current agent-wallet path is
  not implemented.
- Downgrade Privy and Arc submission status to `NOT VERIFIED`: the repository
  has strong live records but no concrete Privy `WalletProvider`, no production
  bootstrap wiring it, and production authorization currently defaults to
  allowed when the optional port is absent.
- Treat sponsor integration evidence separately from final submission
  readiness; missing videos or final submission fields remain open gates.

## Files/components touched

- `plan.md`
- This context record

## Commands/checks

- Inspected branch, status, repository policy, sponsor evidence, Graph proof,
  subgraph source, and Arc/Privy adapters.
- Reviewed official ETHGlobal, Arc, Circle, The Graph, and Privy documentation.
- `pnpm exec prettier --check plan.md .agent/context/20260909T115157Z-ethonline-prize-audit.md`
  - PASS after formatting `plan.md`.
- `git diff --check` - PASS.
- `pnpm --filter @oneshot/testkit-settlement evidence:b06` - PASS for the
  recorded evidence bundle; this validates the static capture, not the absent
  concrete Privy provider/runtime.
- `pnpm --filter @oneshot/reconciliation test` - PASS, 8 files / 84 tests.

## External-doc findings

- ETHGlobal permits live Subgraph Studio data for The Graph's AI track and
  requires a public repository plus a two-to-four-minute demo video.
- Arc's official account-abstraction documentation lists both Privy and Circle
  Wallets and says providers may be mixed.
- Arc App Kit supports Viem/Ethers and extensible wallet adapters; Circle
  Wallets is one adapter, not a prerequisite.
- Privy's 2026 tracks require a Privy wallet and a core functional flow; they do
  not require custom authentication or ban additional wallet providers.
- The checked-in Privy package models scope/policy and accepts an injected
  provider, but does not depend on or instantiate the Privy SDK/API. The worker
  also treats a missing production authorization port as authorized; both are
  blockers to a public-source qualification claim.

## Unresolved questions

- Confirm the ETHGlobal submission is registered in The Graph's Start Fresh
  pool.
- Record and link the required sponsor demo video(s).
- Check in the concrete Privy provider/runtime composition and remove the
  production authorization bypass.
- Re-check official Arc mainnet parameters and deployment readiness after the
  announced 2026-09-16 launch and before the 2026-09-30 deadline.

## Branch/commit/PR state

- Branch: `feature/ethonline-2026-prize-audit`
- Current review base: `origin/develop` /
  `779c6cf77796f4f6773a7959b1e2b5257b64de99`.
- The branch was merged with the current `origin/develop` so Gate A reviews the
  current base rather than the stale branch point. The merge also brought in
  PR #49's Circle Agent Stack planning material; the audit reconciled it with
  the official requirements by marking that track unclaimed and
  `NOT QUALIFIED` until a real Agent Stack integration exists.
- While this audit was in progress, another workspace process committed and
  pushed the pre-existing P5 work on this branch as
  `f1cba9023f260f04207489541c279c3df353f113`; that work was not modified by this
  audit.
- The audit edits remain uncommitted and unpushed. No audit commit, push, or PR
  was requested.

## Gate A/B state

- Gate A: not run; documentation audit remains uncommitted.
- Gate B: not applicable without a PR.

## Handoff/next steps

- Run Gate A against the exact staged candidate tree, then commit/push only
  after an explicit `PASS`.
