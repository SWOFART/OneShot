# Wallet SIWE checksum follow-up

## Goal

Fix the remaining production wallet-login failure after MetaMask approves the
connection and message-signing flow.

## Acceptance criteria

- Normalize EIP-1193 wallet addresses to EIP-55 before Privy SIWE message
  generation and `personal_sign`.
- Preserve the exact message/signature pair passed to `loginWithSiwe`.
- Reject malformed wallet addresses without exposing wallet data in the UI.
- Keep payment, ledger, settlement, reconciliation, retry, and API behavior
  unchanged.
- Add regression coverage for a lowercase MetaMask-style address.

## Diagnosis and assumptions

- The merged wallet-login fix is present in the production bundle
  `/assets/privy-session-BwhBvF1l.js`.
- The public Privy app configuration reports wallet authentication enabled.
- A request to Privy SIWE initialization from
  `https://oneshot.kapustazh.dev` succeeds, so the remaining failure is after
  wallet approval and is consistent with strict SIWE address formatting.
- Privy documents the SIWE `address` parameter as EIP-55 checksum-encoded.
  EIP-1193 providers may return the same address in lowercase, so the client
  must canonicalize it before generating and signing the message.

## Scope and non-goals

Only the web wallet SIWE adapter, its direct `viem` dependency, its test, and
this context record are in scope. This does not change Privy dashboard
configuration, payment flows, or any server-side authorization behavior.

## Branch state

- Branch: `fix/wallet-siwe-checksum`
- Base: `origin/develop` at `271b1afda4e4adf8f067def0f7775d06ae778318`
- Commit: uncommitted during implementation
- Gate A: not run
- Gate B: not run

## Implementation

- Added `viem` as a direct web dependency for its audited EIP-55 address
  canonicalization.
- Canonicalized raw provider addresses before both SIWE operations.
- Added a regression fixture where the provider returns the lowercase form of
  a valid address while Privy and `personal_sign` receive the checksum form.

## Validation

- `pnpm --filter @oneshot/web test -- privy-session.test.tsx` — passed, 20 files,
  98 tests.
- `pnpm --filter @oneshot/web typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed, 81 files, 1050 tests.
- `pnpm typecheck` — passed.
- `pnpm check:generated` — passed.
- `pnpm format:check` — passed.
- `pnpm build:frontend` — passed.
- `markdownlint-cli2` — passed for this context record.
- Gate A remains pending after the final diff is staged.

## External verification pending

Live MetaMask login must be reproduced after deployment. Privy Dashboard wallet
login and production-origin settings remain operator configuration items.
