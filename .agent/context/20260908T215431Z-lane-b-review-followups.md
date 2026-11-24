# Session Context: Lane B Review Follow-ups

## Date/time

- UTC: 2026-09-08T21:54:31Z

## User goal

Close the review findings that were carried rather than fixed during B05 and
B06: the invented mainnet state name in the live-evidence document, and the
three non-blocking findings human review raised against the settlement UI slice.

## Original prompt/request

"do all neede changes", after B06 reached human review and the remaining items were
listed.

## Assumptions

- These are B-owned paths. `docs/settlement/` is Lane B's documentation area and
  `packages/settlement-ui` is the Lane B slice merged from pull request #36.
- The B06 findings are handled on the B06 branch (pull request #41) rather than
  here, because they belong to that milestone's own review cycle.
- The palette already meets WCAG AA; the contrast work is to prove it and catch
  future drift, not to restyle the slice.

## Plan

1. Replace `OFFLINE_PROTECTED` in the live-evidence limitations with the values
   the profile actually carries.
2. Add credential-shaped value detection to the settlement UI sanitization
   guard, so a secret under a benign field name is refused.
3. Reject control characters in the identity fields that render verbatim.
4. Add a static WCAG contrast audit of the palette tokens.
5. Run local checks, CI, PR, CI, human review.

## Key decisions

- `OFFLINE_PROTECTED` is not a state the code has. `packages/arc-adapter/src/profiles.ts`
  carries `enabled: false` and `verification: 'UNPUBLISHED'`, and the profile
  holds no chain ID, RPC, explorer, or token value. The document now says that,
  because a sponsor reading it should see the same words the code uses. The
  neighbouring `FALLBACK_DIRECT_RECOVERY` is a real Lane C state and is left
  alone.
- Value-shape detection is deliberately narrow: PEM private keys, JWTs, and
  bearer tokens. Ordinary evidence — transaction hashes, addresses, digests —
  must keep rendering, so shape rules that would catch them are not used here.
- The contrast audit parses the stylesheet rather than restating colours, so a
  palette edit that drops a token below AA fails the test.

## Files/components touched

- `docs/settlement/LIVE_EVIDENCE.md`: mainnet profile terminology.
- `packages/settlement-ui/src/contract.ts`: value-shape rejection and the
  control-character guard for verbatim identity fields.
- `packages/settlement-ui/test/contract.test.ts`: regression tests for both.
- `packages/settlement-ui/test/contrast.test.ts`: static WCAG contrast audit.
- `packages/settlement-ui/README.md`: documents both guards and the audit.

## Commands/checks

- `git checkout -b fix/lane-b-review-followups origin/develop` - PASS
- `git rev-parse origin/develop` - `83e082bc5e872c1e95088dd3813eb7475ce68e6d`
- `pnpm --filter @oneshot/settlement-ui test` - PASS (205 tests, 19 new)
- `pnpm lint`, `pnpm typecheck`, `pnpm test` - PASS (55 files, 889 tests)
- After the rebase onto `48391e49`: `pnpm install --frozen-lockfile`, `pnpm lint`,
  `pnpm typecheck` - PASS; `pnpm test` - PASS (55 files, 886 tests); the B06
  evidence CLI still reports Overall PASS

## External-doc findings

- `packages/arc-adapter/src/profiles.ts`: the only mainnet states are
  `verification: 'UNPUBLISHED'` with `enabled: false`; `OFFLINE_PROTECTED`
  appears nowhere in the codebase.
  branch closes.

## Test matrix cases selected

Presentational slice and documentation. The applicable cross-cutting assertion
is that logs and fixtures contain no secret material: the new tests assert that
a credential-shaped value is refused under any field name, including inside an
array, and that ordinary settlement evidence still renders.

## Unresolved questions

- None.

## Git and PR state

- Branch: `fix/lane-b-review-followups`
- Base: `develop` (`48391e4968675764632627716e580988a271c13d`), rebased from
  `83e082bc5e872c1e95088dd3813eb7475ce68e6d` after pull request #41 merged
- Commit: unpushed at the time of writing. The exact commit and tree are
  captured with `git rev-parse` immediately before each CI and recorded in
  the pull request body, so amending this file cannot invalidate them.
- PR: not created
- CI: not applicable

## Note on pull request #41

B06 was merged by a human at 2026-09-08T22:08:23Z on head
`8ea308b525e7a711d16a226c8bcb1c20c57063c8`, which carried CI round-five
PASS and green required CI. human review had been run against the earlier head
`310daf16703957650e6422420fddedc3b627ab59`, not that final head. Recorded here
so the gate history stays accurate.

## Handoff/next steps

1. Run root checks, capture `git write-tree`, run CI.
2. Commit, push, open a PR, wait for CI, run human review.
