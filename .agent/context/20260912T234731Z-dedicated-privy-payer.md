# Session Context: dedicated-privy-payer

## Date/time

- UTC: 2026-09-12T23:47:31Z

## User goal

Fix the wallet-switching problem left by the live site and the flaw observed
after the active-wallet iteration: MetaMask can authenticate, but payment
requests never reach it because the Privy embedded wallet remains the
dedicated payer. Product decision recorded by the implementer: keep the
Privy embedded wallet as the DEDICATED payer; MetaMask (and other detected
wallets / WalletConnect) authenticate and appear in the picker, while x402
payments and transfers sign with the embedded wallet.

## Original prompt/request

Implementer handoff (restated): root cause fixed locally — MetaMask can
authenticate, but the existing Privy embedded wallet remains the dedicated
payer; MetaMask receives no payment request. Updated privy-session.tsx:223
and privy-session.test.tsx:337. Checks passed: 12 tests, TypeScript, ESLint,
diff check. Stopped before Gate A/B; not deployed. User instruction: review,
run both gates, open the PR after Gate A.

## Assumptions

- Dedicated-Privy-payer semantics intentionally supersede the active-wallet
  semantics of open draft PR #113; that PR becomes superseded.
- The EIP712Domain injection and walletList (detected + WalletConnect) from
  commit 0167e3d remain in force and are not reverted.

## Plan

1. Independent review of the selection-logic reversion; reproduce all checks.
2. Gate A on the staged candidate tree, then commit, push new branch
   fix/dedicated-privy-payer, and open a draft PR targeting develop.
3. Wait for required CI, then Gate B, and record both verdicts on the PR.

## Key decisions

- New branch and PR instead of pushing to PR #113: the new semantics contradict
  #113's title and acceptance criteria; #113 is left for the user to close.
- Reverted selection logic restored verbatim from the pre-0167e3d state
  (prefer embedded Privy wallet, auto-setActiveWallet, picker when absent).

## Files/components touched

- apps/web/src/auth/privy-session.tsx — wallet selection returns to the
  dedicated embedded Privy payer with auto-setActiveWallet.
- apps/web/test/privy-session.test.tsx — tests assert dedicated-payer
  semantics (privy signs; MetaMask receives no payment request).
- .agent/context/20260912T225825Z-restore-privy-payment-wallets.md remains the
  record for the earlier iteration on PR #113.

## Commands/checks

- `pnpm vitest run test/privy-session.test.tsx` (apps/web) - PASS, 12/12
- `pnpm typecheck` (apps/web) - PASS (tsc -b exit 0)
- `pnpm lint` (apps/web) - PASS (eslint exit 0)
- `git diff --check` - PASS
- Local Node 22.23.2 differs from repository Node 24.19.0; checks still passed.

## External-doc findings

- Unchanged from the previous record: EIP-712 raw eth_signTypedData_v4
  payloads declare an EIP712Domain type set matching the domain members.

## Unresolved questions

- Explicit product sign-off that the dedicated embedded payer is the desired
  long-term model (supersedes PR #109/#108/#113 direction).
- Runtime WalletConnect picker smoke test (walletConnect projectId).

## Git and PR state

- Branch: fix/dedicated-privy-payer (new; stacked on 0167e3dd5f344c388eaddca97ff6da2df25e1b6a)
- Base: develop (1123107b3411110ac203d367c0cafaeb87fbcfc3 at candidate time;
  merge-base with 37e4615cc7a570f70f6f6ae9d49ac68d96549619)
- Commit: created immediately after Gate A (SHA in PR evidence)
- PR: draft opened after Gate A per user instruction
- CI: recorded on the PR after push

## Gate A/B state

- Gate A: fresh-process attempt first; if the environment blocks a second
  free-pi session (one session per account), an in-session independent review
  per freepi-prepush-review.md is recorded as compensating evidence by
  explicit user instruction.
- Gate B: after CI on the exact PR head; verdict recorded on the PR.
