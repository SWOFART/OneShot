# Session Context: A01 foundation contracts

## Date/time

- UTC: 2026-09-07T13:41:04Z

## User goal

Implement Coder A's first milestone so B and C can consume stable contracts,
fixtures, and a deterministic simulator from `develop`.

## Original prompt/request

Start implementing the plan as Coder A.

## Assumptions

- A01 is the first dependency-free Coder A milestone.
- Arc Testnet is the enabled launch profile; mainnet support is future work.
- Provider integrations remain outside A01.

## Plan

1. Complete local validation and review of the A01 candidate tree.
2. Publish the reviewed contract pack through a pull request to `develop`.
3. Continue with A02 after A01 closes.

## Key decisions

- Money crosses JSON boundaries as canonical unsigned integer strings.
- Parsers reject unknown enum members and unexpected request fields.
- Generated OpenAPI, JSON Schema, and TypeScript artifacts share one source.
- The simulator injects time and IDs and counts external submissions explicitly.

## Files/components touched

- Root workspace/toolchain configuration and locked dependencies.
- `packages/contracts`: runtime parsers, OpenAPI, schemas, fixtures, validators.
- `packages/testkit-domain`: deterministic in-memory domain simulator.
- Stack CI: contract drift, fixture validation, compilation, and tests.

## Commands/checks

- `pnpm install --frozen-lockfile` - pass.
- `pnpm format:check` - pass.
- `pnpm lint` - pass.
- `pnpm typecheck` - pass.
- `pnpm check:generated` - pass after deterministic regeneration.
- `pnpm validate:fixtures` - pass, 9 fixtures.
- `pnpm test` - pass, 4 files and 30 tests.
- `contracts.schema.json` SHA-256 -
  `4436ED9992662D749A9E41779453513E2A3DAFCF3B4306146D87593132BB6297`.

## External-doc findings

- None; implementation follows the frozen repository contract pack.

## Unresolved questions

- None for A01.

## Git and PR state

- Branch: `milestone/a01-foundation-contracts`
- Base: `develop` at `8be8d09b8ab5da19031af28fcee9da128a16f82b`
- Commit: uncommitted candidate
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Stage and inspect the complete candidate tree.
2. Run the configured pre-push reviewer against the immutable tree.
3. Commit, push, and open the draft pull request after Gate A passes.
