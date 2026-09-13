# Session Context: restore-server-privy-payments

## Date/time

- UTC: 2026-09-13T01:31:21Z

## User goal

Restore the PR #50-70 era payment behavior: a Privy login only authenticates
the operator, and every payment settles server-side through the Privy
execution wallet (SERVER_PRIVY) with no browser wallet, no confirmation
popups, and no 2FA. The owner reports the embedded browser wallet still
cannot pay and wants the old automatic flow back.

## Original prompt/request

"privy still doesn't pay or send anythin, can you bring back to the life
previous payment of the 50-60 pr to the privy login specific... I need
login/payment of really old pr's, because privy specific account doesn't
have 2factor auth for paying... don't look at the latest PRS!!!!"

## Assumptions

- The dual-path UI already supports the old behavior: without the userWallet
  prop, JobWorkspace and the paid-API panel route to client.start()
  (SERVER_PRIVY) and show "Payment authorization is queued" / "OneShot now
  owns the payment attempt".
- The worker settlement runtime and the API POST /v1/paid-api + /v1/jobs
  server path are intact on develop (90159b5).

## Plan

1. Stop wiring usePrivyUserWallet() into App in main.tsx (one-wiring change;
   the user-wallet code stays for future use).
2. Add a regression test: no browser wallet wired -> Approve and run service
   -> client.start called, no user-wallet calls.
3. Gate A, commit, push, draft PR, CI, Gate B.

## Key decisions

- Restoration is a wiring change, not a rewrite: the dual-path components
  keep working, so future re-enablement is one line.
- The Privy recipient allowlist removal (PR #117, draft) complements this:
  server-side authorization denies non-allowlisted recipients while the
  app-layer allowlist is still active.

## Files/components touched

- apps/web/src/main.tsx — AuthenticatedApp no longer renders userWallet.
- apps/web/test/components.test.tsx — regression test for the server path.

## Commands/checks

- `pnpm vitest run test/components.test.tsx test/privy-session.test.tsx` - PASS, 31/31
- `pnpm typecheck` (apps/web) - PASS (tsc -b exit 0)
- `pnpm lint` (apps/web) - PASS (eslint exit 0)
- `git diff --check` - PASS
- Local Node 22.23.2 differs from repository Node 24.19.0; checks still passed.

## External-doc findings

- None new; SERVER_PRIVY and USER_WALLET payment modes coexist in
  apps/api/src/paid-api.ts and the contracts.

## Unresolved questions

- Production worker must keep ONESHOT_X402_URL/settlement config so
  SERVER_PRIVY jobs settle; verify in the deployment environment.
- PR #117 (allowlist removal) is complementary and still a draft.

## Git and PR state

- Branch: feat/restore-server-privy-payments (from origin/develop 90159b5)
- Base: develop (90159b58be65fd73b6c71a4c6a1564147917044c)
- Commit: created after Gate A (SHA recorded in PR evidence)
- PR: draft opened after Gate A per user instruction
- CI: recorded on the PR after push

## Gate A/B state

- Gate A: in-session independent review (fresh free-pi process structurally
  unavailable while the operator session is active; standing constraint).
- Gate B: after required CI on the exact PR head; verdict recorded on the PR.
