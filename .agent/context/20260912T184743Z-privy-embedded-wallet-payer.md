# Session Context: Privy embedded wallet payer

## Date/time

- UTC: 2026-09-12T18:47:43Z

## User goal

Ensure a payment approved after Privy login is signed by the user's selected
Privy embedded wallet. Keep Privy's built-in wallet selection available while
preventing an externally connected wallet from becoming the payer implicitly.

## Original prompt/request

The user asked why an external wallet signs a payment after they logged in
through Privy and asked to keep the existing Privy wallet-selection capability.

## Assumptions

- “Privy account” means the selected Privy embedded Ethereum wallet should be
  the payer.
- Privy's native login and wallet-selection UI remain available. An external
  wallet may be connected for login or other browser activity, but it must never
  become the payment signer implicitly.
- Automatic embedded-wallet creation remains disabled. The payment path uses an
  existing Privy embedded wallet already connected to the account.

## Plan

1. Trace authentication, wallet selection, and transaction signing.
2. Configure Arc Testnet without changing Privy's wallet-creation behavior.
3. Honor the active wallet when Privy selected an embedded wallet; otherwise
   select the available embedded wallet and make it active. Fail closed when it
   is unavailable.
4. Add regressions for simultaneous MetaMask and Privy wallets.
5. Complete local checks and the mandatory review gates.

## Key decisions

- Read `useWallets()` for embedded wallets and honor `useActiveWallet()` when
  Privy selected one. If an external wallet is active, synchronize the embedded
  wallet into Privy's active-wallet state before signing.
- Keep `createOnLogin: 'off'`, matching every historical implementation of this
  provider. Do not create wallets merely because a user signs in.
- Configure Arc Testnet as the default and sole supported chain because it is a
  custom EVM network outside Privy's default chain set.
- Keep settlement preparation, receipt verification, and retry behavior
  unchanged.

## Files/components touched

- `apps/web/src/auth/privy-session.tsx`: Arc configuration, explicit existing
  embedded signer selection, and existing Gateway funding/payment behavior.
- `apps/web/test/privy-session.test.tsx`: provider and signer-selection
  regressions.

## Commands/checks

- `pnpm.cmd install --frozen-lockfile` - PASS; no lockfile change.
- `pnpm.cmd --filter @oneshot/web test` - PASS; 18 files, 100 tests after
  rebasing onto the current develop head.
- `pnpm.cmd --filter @oneshot/web typecheck` - PASS.
- `pnpm.cmd --filter @oneshot/web build` - PASS with existing Circle SDK and
  bundle-size warnings.
- `pnpm.cmd test` - PASS; 82 files, 1,087 tests.
- `pnpm.cmd typecheck` - PASS.
- `pnpm.cmd lint` - PASS.
- `pnpm.cmd format:check` - PASS.
- `pnpm.cmd check:generated` - PASS.
- `pnpm.cmd test:browser` - PASS; 8 browser tests.
- `git diff --check` - PASS.

## External-doc findings

- Repository history through `dd424c7`, `b298768`, `49709dc`, `721866b`,
  `b193a0c`, and `3048d8c` consistently used `createOnLogin: 'off'`.
- Privy connected-wallet documentation, checked 2026-09-12, states that
  `useWallets` contains both embedded and external wallets and applications must
  select the wallet appropriate to the action.
- Privy custom EVM network documentation, checked 2026-09-12, requires custom
  chains to be passed through `defaultChain` and `supportedChains`.
- Arc RPC documentation, checked 2026-09-12, specifies chain ID `5042002`, the
  public RPC `https://rpc.testnet.arc.network`, USDC as native currency, and
  `https://testnet.arcscan.app` as explorer.

## Unresolved questions

- A live browser login and testnet-funded embedded wallet are required to verify
  the Privy approval modal against the deployed Privy app configuration.

## Git and PR state

- Branch: `fix/privy-embedded-wallet-payer`
- Base: `origin/develop` at `034d3b3ca7651c104e1e644feb1150f85d587268`
- Commit: uncommitted
- PR: not created
- CI: not applicable yet

## Review gates

- Gate A: NOT RUN for the rebased candidate. The earlier PASS applied to tree
  `2ba50c0acfc21840991883bb12c8e131da456a26` on the previous base and was
  invalidated by the rebase and corrected wallet-creation requirement.
- Gate B: NOT RUN. The user explicitly instructed this session not to launch
  Gate B after Gate A passes; the PR must remain draft while Gate B is absent.

## Handoff/next steps

1. Re-run local validation for this context-record update and record the new
   candidate tree SHA.
2. Run fresh FreePi Gate A, then commit, push, and create a draft PR if it passes.
3. Leave the PR draft after CI; do not launch Gate B in this session.
