# Arc/Circle qualification plan update

Date: 2026-09-09
Branch: `docs/arc-circle-qualification-plan`
Base: `origin/develop` at `7cb629c8b0131c2c5809b594cfb01fa3ca2e8c2e`

## Goal

Update `plan.md` and `plan_missing_parts.md` to reflect the official ETHOnline
2026 Arc mechanics and a credible Circle technology path. The plan must clearly
separate existing Arc/Privy and The Graph evidence from the unimplemented Circle
Agent Stack qualification slice.

## Scope

- Record merged PR #48 and its effect on the Graph/P4 status.
- Correct the Studio-qualified versus Explorer-unallocated distinction.
- Make Circle Agent Stack, Circle CLI/Skills, and a capped Agent Wallet the
  primary planned Circle surface for the Arc agentic-economy claim.
- Preserve Privy as the corporate wallet and OneShot/PostgreSQL as settlement
  authority; preserve `UNKNOWN`, `FALLBACK_DIRECT_RECOVERY`, and no-blind-retry
  requirements.
- Add track-specific Arc acceptance criteria, missing work, and evidence gates.

## Non-goals

- No Circle SDK, wallet, contract, or credential is added in this documentation
  change.
- No Hedera SDK, HTS, x402, or Blocky402 implementation is added.
- No sponsor claim is upgraded to `QUALIFIED` for Circle; the plan records it as
  `NOT VERIFIED` until a live implementation and evidence exist.

## External basis recorded for planning

- ETHOnline 2026 Arc prize requirements and submission mechanics were checked
  against the official ETHGlobal prize/details pages.
- Circle Agent Stack, Agent Wallet, CLI/Skills, and starter-kit behavior were
  checked against official Circle documentation and repositories.
- Arc Testnet network facts were checked against official Arc documentation.

## Validation to run

- `git diff --check` and staged diff check.
- `npx markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"`.
- FreePi Gate A against the exact staged tree.
- Required CI and FreePi Gate B against the exact pushed head.

## Gate status

- Gate A: NOT RUN
- Gate B: NOT RUN
- Commit: NOT CREATED
