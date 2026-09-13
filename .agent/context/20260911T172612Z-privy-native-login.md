# Session Context: Privy native login

## Date/time

- UTC: 2026-09-11T17:26:12Z

## User goal

Replace OneShot's custom wallet login flow with Privy's native login modal because the custom EIP-6963 and SIWE path still reports a failed sign-in after the wallet connection is approved.

## Original prompt/request

The user reported that wallet approval succeeds in MetaMask but the frontend still shows the sign-in failure message, and requested removing the custom login and using Privy login directly.

## Assumptions

- Privy's configured native login modal is the intended authentication boundary for wallet and email login.
- Existing Privy app configuration keeps wallet and email login enabled; operator configuration and live browser behavior remain deployment checks.
- The machine-token fallback remains useful and is out of scope for removal.

## Plan

1. Branch from the current `origin/develop`.
2. Replace direct SIWE and wallet-provider calls with Privy's native `useLogin().login`.
3. Remove the custom wallet discovery, catalogue, picker, and obsolete tests/styles.
4. Validate web auth, full workspace tests, lint, typecheck, generated files, formatting, and frontend/browser builds.
5. Stage one scoped candidate and request fresh Gate A review before any push.

## Key decisions

- Use Privy's documented `useLogin` hook for the modal instead of calling wallet providers or `useLoginWithSiwe` directly.
- Keep `PrivyProvider` wallet/email configuration, session status, logout, and access-token refresh unchanged.
- Remove dead custom wallet modules rather than leaving an alternate authentication path in the bundle.

## Files/components touched

- `apps/web/src/auth/privy-session.tsx`: native Privy login hook and existing session/token adapter.
- `apps/web/src/auth/session.ts`: remove the custom wallet sign-in capability from the session contract.
- `apps/web/src/components/LoginGate.tsx`: always render the native Privy sign-in button for signed-out users.
- `apps/web/src/auth/eip6963.ts`, `apps/web/src/auth/wallet-catalogue.ts`, `apps/web/src/components/WalletPicker.tsx`: removed custom wallet path.
- `apps/web/src/styles.css`: remove picker-only styles.
- `apps/web/test/privy-session.test.tsx`, `apps/web/test/login-gate.test.tsx`: native login and session regression coverage.
- Corresponding obsolete wallet-picker/EIP-6963 tests: removed.
- `apps/web/package.json` and `pnpm-lock.yaml`: remove the no-longer-direct web dependency on `viem` after lockfile refresh.

## Commands/checks

- `pnpm.cmd install --lockfile-only --ignore-scripts` - PASS; lockfile updated only for the removed direct web dependency.
- `pnpm.cmd --filter @oneshot/web test -- privy-session.test.tsx login-gate.test.tsx` - PASS; 18 files and 78 tests.
- `pnpm.cmd test` - PASS; 80 files and 1,040 tests.
- `pnpm.cmd --filter @oneshot/web typecheck` - PASS.
- `pnpm.cmd typecheck` - PASS.
- `pnpm.cmd lint` - PASS.
- `pnpm.cmd check:generated` - PASS; generated contracts current.
- `pnpm.cmd format:check` - PASS.
- `pnpm.cmd build:frontend` - PASS; Vite emitted only the existing large-chunk warning.
- `pnpm.cmd test:browser` - PASS; 4 browser tests.
- `npx.cmd --yes markdownlint-cli2@0.18.1 .agent/context/20260911T172612Z-privy-native-login.md` - PASS; 0 errors.
- `git diff --check` - PASS before staging.

## External-doc findings

- Privy React Auth documentation (`https://docs.privy.io/authentication/user-authentication/ui-component`) documents the native `useLogin` hook and `login` method for opening the Privy login modal.
- Privy authentication documentation (`https://docs.privy.io/authentication/user-authentication/privy-auth`) confirms native wallet login and Privy access tokens provide the common application session boundary.

## Unresolved questions

- Live MetaMask authentication after deployment still needs operator verification; this environment does not provide a wallet extension session.

## Git and PR state

- Branch: `fix/privy-native-login`
- Base: `origin/develop` at `71b470a073439e4508e2626f195e886f23880d00`
- Commit: uncommitted; intended files staged and candidate tree captured with `git write-tree`
- PR: not created
- CI: not applicable yet

## Review gates

- Gate A: NOT RUN; staged candidate is ready for a fresh review
- Gate B: NOT RUN

## Handoff/next steps

1. Start a fresh Gate A review against the staged candidate tree and current base SHA.
2. Request a fresh Gate A review only after the candidate is stable.
3. Push/create a draft PR only after Gate A passes; do not merge or start Gate B in this session unless explicitly requested.
