# Session Context: recovery hardening

## Date/time

- UTC: 2026-09-10T10:27:37Z

## User goal

Implement requested recovery, provider identity, MCP, authentication, and observability hardening in sequence, with a commit and CI review after each milestone. Create a PR only after the final requested milestone passes review.

## Original prompt/request

Create a new branch and implement parts 1-4 and 7-8 from the repository audit: true hashless recovery, provider identity persistence, recovery receipt verification, production MCP enforcement, production authentication hardening, and operational metrics. Then open a pull request.

## Assumptions

- Work starts from clean `develop` at `cd7439058f94f1128bae70fac4017039a45d3d68`.
- The short-lived branch is `milestone/recovery-hardening` and targets `develop`.
- Arc Mainnet activation remains disabled; this work is testnet/recovery hardening only.
- Each milestone may include focused tests and documentation needed to make the behavior unambiguous.

## Plan

1. Implement and test true hashless recovery; commit and run CI.
2. Implement and test durable provider identity; commit and run CI.
3. Harden recovery receipt verification and evidence metadata; commit and run CI.
4. Enforce production Subgraph MCP admission; commit and run CI.
5. Harden production Privy authorization; commit and run CI.
6. Implement operational metrics; commit and run CI.
7. Run full validation, create draft PR, wait for CI, and run human review only after exact-head CI is green.

## Key decisions

- Recovery candidates remain non-authoritative until independently verified by Arc and committed through OneShot CAS.
- Provider request identity is durable and stable per business intent; it supplements, not replaces, OneShot settlement ownership.
- Reviews receive only immutable Git identities, acceptance criteria, and safe check summaries; no secrets or ignored files.

## Files/components touched

- Milestone 1 changes are limited to `apps/worker`, `packages/reconciliation`,
  and the focused reconciliation integration test.
- The staged candidate verifier performs read-only Arc receipt verification for
  Graph candidates and refuses to substitute evidence for zero, failed, or
  multiple matching candidates.
- Milestone 2 persists the adapter-derived Privy request identity on the owned
  attempt before submission, exposes it to recovery, and rejects committed
  recovery packs that lack that durable identity instead of inventing a pack
  reference.
- Milestone 3 makes recovery carry the verified Arc Transfer log index and
  routes known-identity receipt evidence through `verifyReceipt`; mismatched
  receipts remain non-authoritative instead of being labeled final success.
- Milestone 4 requires an explicit Subgraph MCP recovery port in production
  composition and a configured HTTPS MCP endpoint in the executable runtime;
  the lower-level client fallback remains available only outside production.
- Milestone 7 rejects service bearer tokens shorter than 16 characters,
  requires explicit opt-in for wildcard operator access (including mixed
  allowlists), and rejects verified access tokens whose subject is not a Privy
  DID.
- Milestone 8 adds an append-only operational metric event table and records
  duplicate requests, CAS conflicts, policy denials, ambiguous provider
  outcomes, and reconciliation target states without including sensitive
  payloads or changing settlement authority.
- `docs/RECOVERY_HARDENING.md` documents the cumulative recovery, runtime,
  authentication, and metrics contracts; the README links to it.

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
- Milestone 2 checks passed: Privy adapter tests 122, worker tests 35,
  reconciliation tests 85, storage tests 8; Privy adapter, worker, storage,
  and reconciliation lint/typecheck all passed.
- Milestone 3 checks passed: worker tests 35, reconciliation tests 85, Privy
  adapter tests 122, storage tests 8; worker and reconciliation typecheck plus
  all four package lint checks passed.
- Milestone 4 focused checks passed: worker tests 36, reconciliation tests 85;
  worker/reconciliation typecheck and lint passed. The runtime config now
  fails closed without `ONESHOT_SUBGRAPH_MCP_ENDPOINT`.
- Milestone 7 focused checks passed: API tests 46; API typecheck and lint
  passed. The bearer minimum, wildcard opt-in, and Privy subject-shape checks
  are now enforced at runtime.
- Milestone 8 storage checks passed: unit tests 8; storage typecheck and lint
  passed. PostgreSQL integration could not start because this machine has no
  working container runtime; the integration scenario is present for CI.
- Initial PR CI exposed two integration-test defects: the rollback fixture used
  the now-applied migration version 004, and the provider-identity test omitted
  the required AUTHORIZED transition. Both were corrected by using temporary
  migration version 005 and authorizing before claim; focused local checks pass.

## External-doc findings

- Repository policy requires CI per immutable candidate tree after each candidate milestone and human review on the exact PR head after required CI.
- The Graph is candidate discovery only; Arc verification and OneShot state remain authoritative.

## Unresolved questions

- None blocking; implementation details will follow existing interfaces and tests.

## Git and PR state

- Branch: `milestone/recovery-hardening`
- Base: `develop` at `cd7439058f94f1128bae70fac4017039a45d3d68`
- Commit: `26b7dca` (Parts 1-4, Part 7, and Part 8 pushed); documentation and
  integration-test corrections are currently unstaged
- PR: draft [#63](https://github.com/SWOFART/OneShot/pull/63)
- CI: initial policy, Markdown/Mermaid, browser, and deployment checks passed;
  the combined lint/typecheck job failed only in PostgreSQL integration on two
  tests, now corrected locally

## Handoff/next steps

1. Commit the documentation and integration-test corrections after validation.
2. Push the fix and wait for all required PR checks, including PostgreSQL
   integration, to pass.
3. Run CI again for the new exact tree, then human review on the exact PR head.
