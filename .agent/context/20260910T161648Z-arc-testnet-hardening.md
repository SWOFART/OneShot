# Session Context: Arc Testnet hardening

## Date/time

- UTC: 2026-09-10T16:16:48Z

## User goal

Create a new branch and fix the remaining Arc Testnet settlement problems. Arc Mainnet launches later and is explicitly out of scope.

## Original prompt/request

“okay lets fix arc problems. For the arc mainnet it is unavailable. Arc mainnet will be launch on 16th september, so ignore it. Create a new branch and lets fix this issues”

## Assumptions

- Arc Mainnet remains intentionally untouched; this branch only hardens the pinned Arc Testnet profile.
- The unrelated change in `.agent/context/20260910T143008Z-settlement-safety-hardening.md` belongs to the user and must remain outside this branch’s commit.

## Plan

1. Harden the Privy sign-and-raw-send fallback with pending nonce reads, gas estimation, bigint-safe quantities, serialization, and process-local duplicate collapse.
2. Extend Arc readiness with a live USDC decimals check and wallet native-gas balance check in production readiness.
3. Add focused regression and failure-boundary tests, update relevant docs, run local validation, then follow Gate A/PR/CI/Gate B.

## Key decisions

- Keep the existing raw fallback because Arc Testnet settlement currently needs it when the Privy relay is unavailable, but make fallback submission fail closed and bounded.
- Use hex quantities for Privy transaction fields so large integer values are not converted through JavaScript `Number`.
- Mainnet profile and activation policy are not changed.

## Files/components touched

- `packages/privy-adapter/src/privy-wallet-provider.ts`
- `packages/privy-adapter/test/privy-wallet-provider.test.ts`
- `packages/arc-adapter/src/readiness.ts`
- `packages/arc-adapter/src/viem-probe.ts`
- `packages/arc-adapter/test/readiness.test.ts`
- `apps/worker/src/runtime.ts`
- `packages/testkit-settlement/src/rpc-simulator.ts`
- `docs/settlement/SETTLEMENT_CONFIG_V1.md`
- `docs/settlement/PROVIDER_SETUP.md`

## Commands/checks

- Branch created from `origin/develop` at `95709a8256a11f2c544b1d406e906ba8ea2d7867`.
- Existing unrelated context change preserved and unstaged.
- `pnpm.cmd --filter @oneshot/privy-adapter test` - passed (127 tests).
- `pnpm.cmd --filter @oneshot/arc-adapter test` - passed (198 tests).
- `pnpm.cmd --filter @oneshot/testkit-settlement test` - passed (132 tests).
- `pnpm.cmd typecheck` - passed.
- `pnpm.cmd test` - passed (64 files, 966 tests).
- `pnpm.cmd lint` - passed.
- `pnpm.cmd format:check` - passed.
- `pnpm.cmd check:generated` - passed.
- `pnpm.cmd test:integration` - all 12 DB-backed tests skipped because no container runtime is available locally.

## External-doc findings

- Arc Testnet is chain `5042002`; native gas uses 18 decimals and ERC-20 USDC uses 6 decimals. Mainnet is not part of this task.

## Unresolved questions

- Cross-process nonce allocation for a raw-signing fallback still depends on the durable OneShot submission gate; this branch must not claim provider-level idempotency across process restarts.

## Git and PR state

- Branch: `fix/arc-testnet-hardening`
- Base: `origin/develop` at `95709a8256a11f2c544b1d406e906ba8ea2d7867`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Implement and test the scoped Arc Testnet hardening.
2. Do not include the unrelated pre-existing context change in any commit.
