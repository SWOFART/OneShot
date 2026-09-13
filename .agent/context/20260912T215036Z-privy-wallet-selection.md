# Session Context: Privy wallet selection

## Date/time

- UTC: 2026-09-12T21:50:36Z

## User goal

Restore the earlier working Privy login-to-payment wallet connection mechanics without reverting the current website UI.

## Original prompt/request

The user reports `No Ethereum wallet is connected. Nothing was paid.` after signing in through Privy and asks to restore the wallet/login mechanics from an older website revision while keeping current frontend presentation.

## Assumptions

- Existing embedded Privy wallets should remain preferred and automatic wallet creation must remain disabled.
- When no embedded Privy wallet exists, payment must open Privy's wallet picker instead of silently using an injected MetaMask wallet.

## Plan

1. Compare current wallet wiring with historical payment/login commits.
2. Restore Privy's explicit wallet-selection path in the shared wallet adapter.
3. Add a regression test and run the affected web checks.

## Key decisions

- Reuse the `useActiveWallet().connect({ reset: true })` path derived from commit `49709dc`, because it restores the Privy-controlled picker and resets stale active-wallet selection.
- Keep `createOnLogin: 'off'`; this fix does not create wallets for users.
- Bind the remembered picker result to the current Privy user id so logout/login cannot carry a payer wallet across accounts.

## Files/components touched

- `apps/web/src/auth/privy-session.tsx`: restore explicit Privy wallet selection fallback.
- `apps/web/test/privy-session.test.tsx`: cover stale MetaMask plus explicit Privy picker selection.

## Commands/checks

- Historical Git inspection of `49709dc`, `721866b`, `3048d8c`, and current `bbb1052` - identified the removed `useActiveWallet().connect()` path.
- `pnpm --filter @oneshot/web test -- privy-session.test.tsx` - PASS, 11 tests.
- `pnpm --filter @oneshot/web test` - PASS, 18 files and 101 tests.
- `pnpm --filter @oneshot/web typecheck` - PASS.
- `pnpm --filter @oneshot/web lint` - PASS.
- `pnpm --filter @oneshot/web build` - PASS with pre-existing Circle SDK and bundle-size warnings.
- `pnpm --filter @oneshot/web test:browser` - PASS, 8 tests.
- `pnpm format:check` - PASS.

## External-doc findings

- Privy React documentation (`https://docs.privy.io/wallets/connectors/usage/connecting-external-wallets` and `https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet`) confirms that wallet connection should be initiated through Privy's connection UI and that `useWallets().ready` represents completed wallet processing.
- Installed `@privy-io/react-auth` 3.6.1 types expose `useActiveWallet().connect({ reset?: boolean })`.

## Unresolved questions

- None.

## Git and PR state

- Branch: `fix/privy-wallet-selection`
- Base: `origin/develop` at `bbb1052b0625f9311ecdfd3d0e5b7443322fbdbd`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN for the current tree. An earlier tree review produced no final verdict and identified the cross-account cache lifetime edge case; that tree was changed and invalidated.
- Gate B: NOT RUN

## Handoff/next steps

1. Stage the candidate tree and run mandatory Gate A.
