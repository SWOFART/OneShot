# Session Context: Privy operator authentication

## Date/time

- UTC: 2026-09-09T22:34:33Z

## User goal

Implement the Privy operator-authentication plan through validation, mandatory review gates, and a draft pull request.

## Original prompt/request

Complete `2026-09-09-privy-operator-auth.md` from the current Task 5/10 state through all remaining work and required gates.

## Assumptions

- The named `feature/privy-operator-auth` branch is the intended short-lived branch.
- Tasks 1–4 are missing from the branch and must be completed before Tasks 7–10.
- Privy operator login is separate from the existing Privy wallet-authorization boundary.

## Plan

1. Implement and test missing API authentication Tasks 1–4.
2. Complete web Tasks 7–8 and operator documentation.
3. Run full validation, Gate A, draft PR CI, and Gate B.

## Key decisions

- Route JWT-shaped credentials only to the Privy verifier and opaque credentials only to the existing constant-time service-token verifier.
- Keep operator access tokens in memory and never render or log them.
- Preserve the existing service bearer for worker and agent clients.

## Files/components touched

- `apps/api/src/privy-auth.ts`, `auth.ts`, `config.ts`, and `runtime.ts`: ES256 verification, credential routing, fail-closed configuration, and runtime composition.
- `apps/api/test`: JWT rejection, allowlist, configuration, routing, runtime, logging, and forbidden-ledger boundary coverage.
- `apps/web/src/auth`, `LoginGate.tsx`, `App.tsx`, and `main.tsx`: in-memory operator session, gated console, credential selection, and lazy Privy provider.
- `apps/web/test` and `apps/web/browser`: unit, composition, credential-header, storage, token-leak, and Playwright gate coverage.
- `apps/web/package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`: official React SDK plus strict-peer-compatible transitive pins and denied optional native build scripts.
- `.env.example`, `apps/web/.env.example`, and `README.md`: safe placeholders and operator bootstrap documentation.

## Commands/checks

- Task 5: 4 focused tests, typecheck, lint, and format passed.
- Task 6: 7 focused tests; full web suite 46/46; typecheck, lint, and format passed.
- API focused suite: 40/40 tests passed, including forbidden reconciliation never reaching the ledger.
- Web focused suite: 50/50 tests passed; Playwright: 7/7 passed.
- `pnpm peers check` - passed with no peer dependency issues.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm check:generated` - passed.
- `pnpm test` - passed: 64 files, 942 tests.
- `pnpm --filter @oneshot/web test:browser` - passed: 7 tests.
- `pnpm --filter @oneshot/web build` - passed; Privy emitted as a separate lazy chunk.

## External-doc findings

- Privy access-token documentation checked 2026-09-09: access tokens are ES256 JWTs with `privy.io` issuer, app-id audience, Privy DID subject, and roughly one-hour lifetime; `getAccessToken` refreshes when needed.
- Privy login UI documentation checked 2026-09-09: React authentication state is exposed through `usePrivy`; configured login methods include email and wallet.
- Privy dashboard documentation checked 2026-09-09: the public verification key is available under Configuration, App settings, Basics, “Verify with key instead.”

## Unresolved questions

- Local Node is 22.23.2 while the repository requires 24.19.0; all checks passed with an engine warning, and CI must confirm on the required version.
- Planned React SDK 3.41.0 was younger than the 24-hour supply-chain threshold and introduced an unsatisfied Solana/TypeScript peer graph. Version 3.6.1 is the newest tested version before that dependency break; upgrade after a compatible release clears policy.

## Git and PR state

- Branch: `feature/privy-operator-auth`
- Base: `origin/develop` at `78b9d74bd4b111a6418485baff6379464325960c`
- Commit: `dd424c7e6651539f8c0b0d0abf9347393c00d6b2`
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Commit operator documentation, run Gate A, push a draft PR, wait for CI, then run Gate B.
