# Session Context: B05 Frontend Authorization and Settlement Details

## Date/time

- UTC: 2026-09-08T18:08:39Z

## User goal

Deliver milestone B05: an independently composable Lane B frontend slice that
explains Privy policy, authorization state, settlement state, and verified Arc
transaction evidence from sanitized API fields, with no bypass action and no
secret exposure.

## Original prompt/request

"check if everything is ready to do b05 step" followed by "start" after the
readiness audit confirmed Gate P4 froze the frontend boundary.

## Assumptions

- Gate P4 frontend freeze (PR #34) satisfies the B05 start gate. `docs/GATE_P4_CHECKLIST.md`
  step 4 is `[COMPLETED]` and names A05/B05/C05 as unblocked.
- The frozen mock server `@oneshot/contracts` `OPENAPI_MOCK_SERVER_VERSION = '1.0.0'`
  and `packages/contracts/fixtures/ui/v1/` are the contract host for this slice.
- Published contract fixture digests are immutable, so states B05.3 requires that
  the frozen pack does not carry (`READY`, `SUBMITTING`, on-chain revert,
  unavailable evidence) are added as B-owned package-local fixtures built from the
  frozen schema rather than by editing `packages/contracts`.
- `@oneshot/recovery-ui` (C05) is the composition precedent: a lane-owned package
  exporting entry points, with no edit to the A-owned app shell.
- Live Arc testnet evidence is still `LIVE_NOT_RUN` and human-gated. B05 closes on
  fixtures, matching how A05 and C05 closed.

## Plan

1. Create `packages/settlement-ui` (`@oneshot/settlement-ui`) mirroring the
   `@oneshot/recovery-ui` package shape.
2. B05.1 policy summary from `IntentResponse.policy` sanitized fields.
3. B05.2 authorization states from `Attempt.authorization_status`.
4. B05.3 settlement states with `UNKNOWN` disabling any new settlement action and
   no confirmation counts.
5. B05.4 verified transaction details with validated explorer URL.
6. B05.5 component/contract/route/redaction/accessibility tests plus package-local
   lint, type, test, and build checks.
7. Publish README handoff artifact, run root checks, record evidence, Gate A,
   draft PR, CI, Gate B.

## Key decisions

- Money renders through package-local `bigint` string arithmetic. No import from
  the A-owned `apps/web`, and no JavaScript floating point.
- Explorer links are validated against an https-only scheme check with the
  transaction hash bound to the rendered settlement before the anchor renders.
  A link that fails validation is dropped, not rendered inert.
- The slice exposes no submit, resend, force-pay, or adapter action. Reconciliation
  is a read-only trigger owned by Lane C's timeline, so B05 renders state only.
- Test files use `.ts` with `createElement` (the C05 convention) so the root
  `vitest` include pattern runs them.

## Files/components touched

- `packages/settlement-ui/`: new Lane B frontend slice.
- `tsconfig.json`: add the new project reference slot.
- `pnpm-lock.yaml`: workspace lockfile for the new package.

## Commands/checks

- `git fetch origin develop` - PASS
- `git rev-parse origin/develop` - `710614af76ae5c28e2c1f69b2c00480f47b623b7`
- `git checkout -b milestone/b05-frontend-settlement-details origin/develop` - PASS
- `pnpm install` - PASS (adds the new workspace package)
- `pnpm --filter @oneshot/settlement-ui verify` - PASS (format, lint, typecheck, 173 tests, build)
- `pnpm lint` - PASS
- `pnpm typecheck` - PASS
- `pnpm test` - PASS (53 files, 778 tests; 49 files and 605 tests on the base)
- `pnpm check:generated` - PASS
- `pnpm validate:fixtures` - PASS (9 contracts-v1 and 7 ui-v1 fixtures)
- `npx markdownlint-cli2` on the added Markdown - PASS
- `pnpm format:check` - FAILS on `subgraph/generated/ArcTestnetUSDC/ERC20.ts` and
  `subgraph/generated/schema.ts`. Pre-existing and unrelated: those files are
  produced by subgraph codegen, ignored by `subgraph/.gitignore`, and absent from
  `.prettierignore`, so the root check fails on any machine that has run codegen.
  No file in this branch is affected; `prettier --check` over the changed paths
  passes. Left for the owning lane rather than editing shared root config here.

## External-doc findings

- `docs/GATE_P4_MANIFEST.md`: OpenAPI digest
  `f639e2d2729cd061d606cd35eb83961c58067a3660ecc5437c0f4596c88edc2c`,
  mock server `1.0.0`, additive B05 fields `IntentResponse.policy`,
  `Attempt.authorization_status`, `Settlement.token_contract`,
  `Settlement.explorer_url`.
- `packages/contracts/openapi/openapi.v1.json`: `explorer_url` is a bounded string
  with no scheme constraint, so URL validation is the consumer's responsibility.

## Test matrix cases selected

Read-only UI slice. Applicable cases from `.agent/TEST_MATRIX.md`:

- Privy denial: denial and cap-exceeded fixtures render an explicit authorization
  failure and expose zero settlement actions.
- Crash after submission / lost payment response: the `UNKNOWN` fixture renders as
  non-terminal and offers no new settlement action.
- Graph delay, absence, or ambiguity: lagging and unavailable evidence render as
  observation, never as proof of non-payment.

Cross-cutting assertions covered here: monetary values formatted from integer
atomic units through `bigint`; fixtures contain no secret or wallet material.

Backend-only cases (parallel worker storm, restart, two agents) are out of scope
for a presentational slice and remain proven by A03/A04 and Gate P4.

## Unresolved questions

- None.

## Git and PR state

- Branch: `milestone/b05-frontend-settlement-details`
- Base: `develop` (`710614af76ae5c28e2c1f69b2c00480f47b623b7`)
- Commit: uncommitted; the candidate tree is the staged index, captured with
  `git write-tree` immediately before Gate A
- Diff: 28 files, +2893 lines, all additive except the `tsconfig.json` project
  reference slot and the `pnpm-lock.yaml` workspace entry
- PR: not created
- CI: not applicable

## Review gates

- Gate A: NOT RUN. `free-pi-cli@0.2.19` is an interactive terminal agent with no
  non-interactive prompt mode, and this session cannot drive a TTY. The gate
  fails closed: nothing is committed or pushed until a human runs it.
- Gate B: NOT RUN

## Gate A instruction message

Run `npx free-pi-cli` from the repository root in a fresh process and send one
message:

> Read `.agent/review-prompts/freepi-prepush-review.md` and follow it.
> Base: `710614af76ae5c28e2c1f69b2c00480f47b623b7` (origin/develop).
> Candidate tree: the SHA printed by `git write-tree`, staged index.
> Branch: `milestone/b05-frontend-settlement-details`.
> Acceptance criteria: milestone B05 in
> `milestones/coder-b/B05-frontend-settlement-details.md`.

## Handoff/next steps

1. Capture `git write-tree`, run FreePi Gate A against that tree, and require an
   explicit `VERDICT: PASS`.
2. Commit the staged tree unchanged, confirm `git rev-parse "HEAD^{tree}"` equals
   the reviewed tree, and push the branch.
3. Open a draft PR targeting `develop` with the Gate A evidence, wait for every
   required check on the exact head SHA, then run FreePi Gate B.
4. Mark ready for human review. Never merge.
