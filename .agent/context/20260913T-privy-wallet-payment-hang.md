# Privy wallet payment hang — 2026-09-13

## Goal

Make the OneShot user-wallet payment flow work for Privy-authenticated users and for EVM wallets connected through Privy, including Arc Testnet transactions.

## Acceptance criteria

- A Privy login for a user without a linked wallet creates an embedded Ethereum wallet.
- A connected MetaMask or other EVM wallet is selected even when Privy has no active-wallet value.
- Arc Testnet remains the selected chain (`5042002`) and the ERC-20 USDC transfer path is unchanged.
- Existing payment safety invariants remain intact: one intent, replay-safe attempts, and at most one committed settlement.
- Web tests and type checks pass, or pre-existing failures are documented.

## Evidence and diagnosis

- The quote request succeeds; the indefinite spinner starts in `JobWorkspace.start()` while resolving the user wallet.
- `apps/web/src/auth/privy-session.tsx` configured `embeddedWallets.ethereum.createOnLogin` as `off`. With no external wallet in an incognito session, `connectWallet({ reset: true })` can remain pending on the wallet picker.
- The wallet fallback only searched for `walletClientType === 'privy'`, so it could miss a connected MetaMask/Rainbow/Coinbase EVM wallet returned by `useWallets()`.
- The public site bundle and the repository default use Privy app ID `cmtqbf5zo013w0cky3r0jqjca`, while the dashboard policy URL supplied by the user is app `cmtvo63u300640cjwcbyyonv3`. These are different Privy apps; the policy must be created in the app actually used by the deployed frontend/backend, or the app IDs must be aligned before deployment.
- The current Privy wallet policy allows `eth_sendTransaction` on Arc Testnet chain ID `5042002`; the Arc Testnet wallet was funded successfully, so the observed issue is in wallet selection/configuration rather than the faucet balance.

## Change scope

- Update Privy embedded-wallet creation to `users-without-wallets`.
- Restrict the Privy wallet picker to Ethereum wallets.
- Select the first connected Ethereum wallet as a safe fallback when there is no active wallet.
- Keep the existing transaction encoding, prepare/submit endpoints, receipt verification, and idempotency logic unchanged.

## Non-goals

- No production deployment.
- No testnet transaction approval from the browser.
- No change to backend settlement or Arc USDC contract handling.

## Verification plan

- Focused `apps/web` Privy session tests.
- Web typecheck, lint, and build.
- Re-run the web test suite and record any unrelated baseline failures.

## Verification results

- Focused Privy session tests: 7 passed.
- Full web test suite: 16 files and 88 tests passed.
- Web typecheck: passed.
- Web lint: passed.
- Web production build: passed; Vite emitted only the existing large-chunk warning.
- `git diff --check`: passed.
