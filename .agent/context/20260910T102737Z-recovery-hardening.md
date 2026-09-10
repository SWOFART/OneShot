# Session Context: recovery hardening

## Date/time

- UTC: 2026-09-10T10:27:37Z

## User goal

Implement requested recovery, provider identity, MCP, authentication, and observability hardening in sequence, with a commit and fresh FreePi Gate A review after each milestone. Create a PR only after the final requested milestone passes review.

## Original prompt/request

Create a new branch and implement parts 1-4 and 7-8 from the repository audit: true hashless recovery, provider identity persistence, recovery receipt verification, production MCP enforcement, production authentication hardening, and operational metrics. After part 1, commit and run `npx.cmd free-pi-cli` using the Gate A review prompt. Continue only after an explicit PASS; repeat through part 8, then create a PR.

## Assumptions

- Work starts from clean `develop` at `cd7439058f94f1128bae70fac4017039a45d3d68`.
- The short-lived branch is `milestone/recovery-hardening` and targets `develop`.
- Arc Mainnet activation remains disabled; this work is testnet/recovery hardening only.
- Each milestone may include focused tests and documentation needed to make the behavior unambiguous.

## Plan

1. Implement and test true hashless recovery; commit and run Gate A.
2. Implement and test durable provider identity; commit and run Gate A.
3. Harden recovery receipt verification and evidence metadata; commit and run Gate A.
4. Enforce production Subgraph MCP admission; commit and run Gate A.
5. Harden production Privy authorization; commit and run Gate A.
6. Implement operational metrics; commit and run Gate A.
7. Run full validation, create draft PR, wait for CI, and run Gate B only after exact-head CI is green.

## Key decisions

- Recovery candidates remain non-authoritative until independently verified by Arc and committed through OneShot CAS.
- Provider request identity is durable and stable per business intent; it supplements, not replaces, OneShot settlement ownership.
- Gate reviews receive only immutable Git identities, acceptance criteria, and safe check summaries; no secrets or ignored files.

## Files/components touched

- Milestone 1 changes are limited to `apps/worker`, `packages/reconciliation`,
  and the focused reconciliation integration test.
- The staged candidate verifier performs read-only Arc receipt verification for
  Graph candidates and refuses to substitute evidence for zero, failed, or
  multiple matching candidates.

## Commands/checks

- `git switch -c milestone/recovery-hardening` - passed.
- Baseline commit: `cd7439058f94f1128bae70fac4017039a45d3d68`.
- `pnpm.cmd exec prettier --write packages/reconciliation/test/service-integration.test.ts` - passed.
- `pnpm.cmd --filter @oneshot/reconciliation typecheck` - passed.
- `pnpm.cmd --filter @oneshot/reconciliation test -- service-integration.test.ts` - passed (8 files, 85 tests).
- Changed-file Prettier check, reconciliation lint/typecheck/test/build, and
  worker typecheck/test all passed (reconciliation 85 tests; worker 33 tests).
- Package-wide reconciliation `verify` is not green on this Windows checkout
  because 12 unchanged documentation files retain pre-existing CRLF/Prettier
  differences; no unrelated docs were reformatted.

## External-doc findings

- Repository policy requires FreePi Gate A per immutable candidate tree after each candidate milestone and Gate B on the exact PR head after required CI.
- The Graph is candidate discovery only; Arc verification and OneShot state remain authoritative.

## Unresolved questions

- None blocking; implementation details will follow existing interfaces and tests.

## Git and PR state

- Branch: `milestone/recovery-hardening`
- Base: `develop` at `cd7439058f94f1128bae70fac4017039a45d3d68`
- Commit: uncommitted baseline
- PR: not created
- CI: not applicable yet

## Review gates

- Gate A: prior candidate review explicitly PASSed before the ambiguity regression test was added; its non-blocking follow-up recommended dedicated coverage for zero/multiple/contradictory paths.
- Gate A: fresh review required for the updated tree after the ambiguity test.
- Gate B: NOT RUN

## Handoff/next steps

1. Stage the new ambiguity regression test and record the final candidate tree.
2. Run a fresh Gate A review for the updated tree; commit only after explicit PASS.
