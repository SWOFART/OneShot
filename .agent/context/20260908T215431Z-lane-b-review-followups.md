# Session Context: Lane B Review Follow-ups

## Date/time

- UTC: 2026-09-08T21:54:31Z

## User goal

Close the review findings that were carried rather than fixed during B05 and
B06: the invented mainnet state name in the live-evidence document, and the
three non-blocking findings Gate B raised against the settlement UI slice.

## Original prompt/request

"do all neede changes", after B06 reached Gate B and the remaining items were
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
5. Run local checks, Gate A, PR, CI, Gate B.

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
- Gate B on pull request #36 recorded the three settlement-UI findings this
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
  captured with `git rev-parse` immediately before each Gate A and recorded in
  the pull request body, so amending this file cannot invalidate them.
- PR: not created
- CI: not applicable

## Review gates

- Gate A (round 1): PASS on tree `2dcc24239a6a5050e19591aafc979d7fbf6aa1ef`.
  Tool `free-pi-cli`, model `deepseek-v4-flash`. No blocking findings. Two of
  three non-blocking findings are fixed:
  1. The contrast test hardcoded the page surface and the fixture-banner colours
     it audits, so a future change lightening either would have kept passing
     against stale literals. Both are now read from the stylesheet.
  2. `attempt_id`, `provider_reference_id`, `transaction_hash`, and
     `block_number` also render verbatim and were outside the control-character
     guard. The seam bounds them already, so this is uniformity rather than an
     exposure, but one rule now covers every field that reaches the DOM
     unescaped.
     The third is an accepted trade-off: value-shape detection stays narrow to
     PEM, JWT, and bearer shapes so ordinary evidence keeps rendering.
- Gate A (round 2): PASS on tree `bc0d221ea81383e7525559ee8b75a77cc7205a29`.
  No blocking findings. Two non-blocking, both fixed:
  1. The guard comment claimed one rule covered every field reaching the DOM
     unescaped, while `attempts[].created_at`, `evidence[].retrieved_at`, and
     `evidence[].digest` still bypassed it. All three are covered now, so the
     comment matches the code.
  2. The contrast audit checked the token colours and two surfaces but not the
     literal surfaces `.panel-note` and `.demo-scenarios select`, so an
     under-AA literal could have shipped outside the audited set. Both are
     audited now.
- Gate A (round 3): PASS on tree `5a05e775ed66a7eb5a7d7b0420caa99cd1b77827`.
  No blocking findings. One non-blocking, now fixed: `evidence[].source`,
  `evidence[].authority_class`, and `evidence[].freshness` render raw and were
  outside the guard while `state`, also an enum, was inside it, so the comment
  claiming one rule for every unescaped field was still wider than the code.
  All three are covered now. The other note was cosmetic quoting in the
  live-evidence document and needed no change.
- Gate A (round 4): PASS on tree `0e0573545e817a0d6062bafbda3660380c8d2322`.
  No blocking findings. Three non-blocking:
  1. The branch base was stale; `develop` had moved past it, including the
     merge of pull request #41. The branch is now rebased onto
     `48391e4968675764632627716e580988a271c13d` and every check re-run there,
     so Gate B reviews a current tree.
  2. `payload_fingerprint` is inside the guard but rendered nowhere in the
     slice. Defensive over-coverage in the fail-closed direction; left as is.
  3. Authorization and policy status strings reach only a data attribute and
     constant label maps, so they never render as text. No action.
- Gate A (round 5): PASS on the rebased tree
  `e863a08b0b15e02dee92e7ab0dc44165511bb780`. No blocking findings. Two
  non-blocking, both fixed:
  1. This record's identity block still named the pre-amend commit and tree.
     Because amending to correct it changes the tree again, the block now
     points at `git rev-parse` and the pull request body instead of restating
     SHAs that go stale on every amend.
  2. `assertNoControlCharacters` would have thrown a raw TypeError on a payload
     missing `attempts` or `evidence`. It now tolerates the missing arrays, and
     round six closed the other half of that path.
- Gate A (round 6): PASS on tree `33c2cdd8a9712de66a0b8262e77a8d755f19e868`.
  No blocking findings. One non-blocking, now fixed: the guard tolerated a
  payload missing `attempts` or `evidence`, but the projection still threw a
  raw TypeError on it, so the claim that failures stayed structured was wider
  than the code. `assertRequiredCollections` now rejects that payload as a
  `SanitizationError`, which is the failure the route renders deliberately.
- Gate A (round 7): NOT RUN for the tree that closes that finding.
- Gate B: NOT RUN

## Note on pull request #41

B06 was merged by a human at 2026-09-08T22:08:23Z on head
`8ea308b525e7a711d16a226c8bcb1c20c57063c8`, which carried Gate A round-five
PASS and green required CI. Gate B had been run against the earlier head
`310daf16703957650e6422420fddedc3b627ab59`, not that final head. Recorded here
so the gate history stays accurate.

## Handoff/next steps

1. Run root checks, capture `git write-tree`, run Gate A.
2. Commit, push, open a PR, wait for CI, run Gate B.
