# Session Context: B01 SDK and Arc network compatibility

## Date/time

- UTC: 2026-09-07T13:01:09Z

## User goal

Begin Coder B implementation. Deliver B01 from `milestones/coder-b`: pin a
compatible Privy/Ethereum/TypeScript toolchain, encode Arc deployment profiles,
probe Memo/policy constraint feasibility, define the configuration schema, build
a fail-closed readiness probe, and establish the sanitized fixture boundary.

## Original prompt/request

Start coding as Coder B, following the repository instructions, `plan.md`, and
the task order in `milestones/coder-b/`. CI/CD instructions may be ignored for
now because no site or deployment target exists yet; the user will say when that
changes.

## Assumptions

- CI/CD is out of scope this session by explicit user instruction. Local
  package-scoped checks still run, and no CI configuration is added or changed.
- Package manager is npm with package-local installs. Coder A owns root
  workspace composition after scaffold freeze, so B01 adds no root manifest,
  lockfile, or workspace configuration.
- `settlement-config-v1` is a published contract artifact, not a new package.
  It is documented under `docs/settlement/` and implemented inside B-owned
  packages.
- Arc Mainnet parameters are unpublished. The Mainnet profile therefore carries
  no chain ID, RPC, explorer, or token value at all, per `plan.md` section 5b.

## Plan

1. Record this context and branch from current `develop`.
2. Build `packages/arc-adapter`: deployment profiles, money, configuration
   schema, readiness probe, redaction.
3. Build `packages/privy-adapter`: wallet/policy identity validation and the
   Memo/policy compatibility spike result.
4. Build `packages/testkit-settlement`: fixtures, readiness simulator, and
   redaction tests.
5. Run package-local install, type, lint, unit, and build checks.
6. Publish the `settlement-config-v1` handoff artifact and dependency rationale.

## Key decisions

- Branch from `develop` at `9dc541d08daf4e9a9c338c562fb1fbe6ac6be04a`, which
  already contains the merged plan clarification, so B01 encodes the corrected
  Arc constants rather than the superseded ones.
- Arc Testnet is the only enabled profile: chain ID `5042002`, CAIP-2
  `eip155:5042002`, USDC interface `0x3600000000000000000000000000000000000000`,
  six-decimal atomic units.
- The Arc Mainnet profile is structurally present but holds no guessed values.
  Commit `d6758dd` on `develop` deliberately removed the previously asserted
  mainnet chain `5042` and its launch date as unverified guesses.

## Files/components touched

- `packages/arc-adapter`, `packages/privy-adapter`,
  `packages/testkit-settlement`: new B-owned packages.
- `docs/settlement/`: `settlement-config-v1` handoff and provider setup notes.

## Commands/checks

- `npm view` for candidate dependency versions - viem `2.56.3`,
  `@privy-io/node` `0.34.0`, `@privy-io/server-auth` `1.32.5`, TypeScript
  `7.0.2`, Vitest `5.0.0`.
- Local Node is `v22.16.0` and npm is `10.9.2`; Vitest 5 declares
  `node ^22.12.0 || ^24.0.0 || >=26.0.0`, which the local runtime satisfies.

## External-doc findings

- Pending. B01.2 and B01.3 must verify Arc chain, RPC, explorer, USDC, and Memo
  identities against official Arc documentation before any value is pinned.

## Unresolved questions

- Whether Privy policy decoding can constrain a nested Arc Memo call. B01.3
  decides this; direct transfer remains the fallback.

## Git and PR state

- Branch: `milestone/b01-sdk-network-compatibility`
- Base: `develop` at `9dc541d08daf4e9a9c338c562fb1fbe6ac6be04a`
- Commit: uncommitted
- PR: not created
- CI: out of scope this session by user instruction

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Scaffold and implement the three B-owned packages.
2. Run package-local checks and record results here.
