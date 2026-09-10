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

## External-doc findings

- Repository policy requires FreePi Gate A per immutable candidate tree after each candidate milestone and Gate B on the exact PR head after required CI.
- The Graph is candidate discovery only; Arc verification and OneShot state remain authoritative.

## Unresolved questions

- None blocking; implementation details will follow existing interfaces and tests.

## Git and PR state

- Branch: `milestone/recovery-hardening`
- Base: `develop` at `cd7439058f94f1128bae70fac4017039a45d3d68`
- Commit: `608a9ce` (Parts 1-4 pushed); Part 7 is currently staged
- PR: not created
- CI: not applicable yet

## Review gates

- Gate A: Part 1 PASS on reviewed tree `201c93c3c2fc32fe63ded42a714ac8546719a624`;
  committed as `a8180f1` and pushed.
- Gate A: Part 2 PASS on reviewed tree `e56f737e94e254c5c70abadd8c4b863d2dca154a`;
  committed as `27234e2` and pushed.
- Gate A: Part 3 PASS on reviewed tree `511ee2bbc5804639ae21f8c12e8a9de13c58a52a`;
  committed as `6d0497c` and pushed.
- Gate A: Part 4 PASS on reviewed tree `b47f1df27169aae76ca7a35c694a0922565b7fd5`;
  committed as `608a9ce` and pushed.
- Gate A: Part 7 FAIL on reviewed tree `95d1e5aa50190b275189af2a225d557e779fdaca`;
  mixed allowlists containing `*` bypassed the opt-in. Fixed with a regression
  test; fresh review required for candidate tree
  `ee31a6d1cd660a14b61e72266455c2974a4c3f79`.
- Gate B: NOT RUN

## Handoff/next steps

1. Stage the Part 7 changes and record the final candidate tree.
2. Run a fresh Gate A review for the updated tree; commit and push only after explicit PASS.
3. Implement Part 8 operational metrics after Part 7 is pushed, then repeat
   local validation, Gate A, commit, and push.
