# Session Context: wallet-approval-routing

## Date/time

- UTC: 2026-09-13T00:38:44Z

## User goal

Fix the production freeze introduced by the EIP712Domain signing change and
settle wallet routing: the Privy embedded wallet pays automatically
(policy-controlled) when no external wallet is selected; an actively selected
external wallet (MetaMask, Rainbow, WalletConnect) remains the payer and
receives an explicit wallet confirmation; no silent wallet switching.

## Original prompt/request

User reported on the live site: "starting request also frozen, right now
privy wallet by default can not send transaction". Root cause: PR #113 added
an unconditional EIP712Domain declaration to the raw eth_signTypedData_v4
payload; the Privy embedded signer does not answer such requests, so the
signature promise never resolved and JobWorkspace stayed on "Starting request…".
Implementer then produced fix/wallet-approval-routing on top of develop
23e4373d459e18a4be31b07397b1a7a8adae8521; user instructed to implement both gates.

## Assumptions

- Privy embedded signer requires the legacy typed-data payload (no explicit
  EIP712Domain declaration), as proven by pre-#113 production behavior.
- External wallets (MetaMask et al) require the explicit EIP712Domain
  declaration; they pay only after in-wallet confirmation.
- Automatic Privy payment to recipient 0x292d…3eb is denied until that address
  is added to the Privy recipient whitelist (operational follow-up).

## Plan

1. Independent review of the routing and conditional payload; reproduce checks.
2. Gate A on the staged candidate tree, commit, push, open draft PR.
3. Required CI green, then Gate B, verdict recorded on the PR.

## Key decisions

- Conditional EIP712Domain injection keyed on walletClientType === 'privy'.
- Auto-setActiveWallet effect removed: the active wallet is never switched
  behind the user's back.
- selectedWallet: active ethereum wallet if present, else first embedded Privy
  wallet; explicit picker connection still honored via the subject-scoped ref.

## Files/components touched

- apps/web/src/auth/privy-session.tsx — wallet-approval routing + conditional
  EIP-712 payload.
- apps/web/test/privy-session.test.tsx — regression coverage for all three
  routing branches and both payload shapes.
- apps/web/test/components.test.tsx — JobWorkspace user-wallet payment flow
  through the selected browser wallet.

## Commands/checks

- `pnpm vitest run test/privy-session.test.tsx test/components.test.tsx` - PASS, 29/29
- `pnpm typecheck` (apps/web) - PASS (tsc -b exit 0)
- `pnpm lint` (apps/web) - PASS (eslint exit 0)
- `git diff --check` - PASS
- Local Node 22.23.2 differs from repository Node 24.19.0; checks still passed.

## External-doc findings

- EIP-712: MetaMask validates eth_signTypedData_v4 payloads against a declared
  EIP712Domain type set; the Privy embedded signer expects the legacy payload
  without the declaration (production-proven before #113).

## Unresolved questions

- Add 0x292d…3eb to the Privy recipient whitelist to enable automatic payment
  to that recipient.
- Runtime WalletConnect smoke test (walletConnect projectId) still pending.

## Git and PR state

- Branch: fix/wallet-approval-routing (fresh from develop 23e4373)
- Base: develop (23e4373d459e18a4be31b07397b1a7a8adae8521, origin/develop tip)
- Commit: created after Gate A (SHA recorded in PR evidence)
- PR: draft opened after Gate A per user instruction
- CI: recorded on the PR after push

## Gate A/B state

- Gate A: fresh-process attempt first; in-session independent review as
  compensating evidence if the one-session-per-account constraint blocks the
  second free-pi process (standing environment constraint, user-acknowledged).
- Gate B: after required CI on the exact PR head; verdict recorded on the PR.
