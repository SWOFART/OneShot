# Session Context: R5 release submission

## Date/time

- UTC: 2026-09-11T06:25:14Z

## User goal

Implement the remaining plan steps as stacked pull requests after the R4 live
failure-demo slice, leaving each PR open for human review and never merging.

## Original prompt/request

“After you implement this part, leave PR and implement every other step in the
circle via stacking PR'S of all stepps.”

## Assumptions

- R4 is PR #79 on `feature/r4-live-failure-demo`; this branch stacks on its
  exact head and does not merge it.
- The current release work is evidence packaging and preflight, not a claim
  that live R4, Graph, prize-pool, or video evidence exists.
- Video is intentionally deferred because the user requested no video yet.
- Existing user Cloud Build changes remain out of scope and unstaged.

## Plan

1. Add a small offline release preflight bound to optional exact head/tree
   identities.
2. Publish a truthful R5 checklist covering automated checks, sponsor status,
   live evidence, video, prize-pool verification, and human review.
3. Link the checklist from the README and update gap tracking.
4. Run local checks, capture fresh Gate A, open the stacked PR, wait for CI,
   capture fresh Gate B, and leave the PR ready for human review.

## Key decisions

- The preflight checks only public artifacts and package scripts; it never reads
  secrets, deploys, or upgrades missing live evidence into a claim.
- Sponsor statuses remain Privy/Arc testnet `QUALIFIED` from existing evidence
  and The Graph `NOT VERIFIED` until a fresh Studio trace materially affects
  the recovery agent/core.
- The PR targets the R4 branch for a linear stack; root develop remains pinned
  in the evidence.

## Files/components touched

- `scripts/release-check.mjs`: offline artifact/script and optional identity
  preflight.
- `docs/RELEASE_CHECKLIST.md`: R5 release and submission evidence boundary.
- `README.md`, `docs/PLAN_GAP_ANALYSIS.md`, `plan_missing_parts.md`: links and
  current R5 status.
- This context record.

## Commands/checks

- `pnpm format:check` - PASS.
- `pnpm lint` - PASS.
- `pnpm typecheck` - PASS.
- `pnpm check:generated` - PASS.
- `pnpm test` - PASS (77 files, 1,031 tests).
- `pnpm test:browser` - PASS (4 tests).
- `npx --yes markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"` - PASS
  (157 files).
- `pnpm release:check` - PASS on the uncommitted parent head; exact identity
  binding will be rerun after commit.
- FreePi Gate A/B and required CI - pending for this R5 tree.

## External-doc findings

- `.agents/skills/sponsor-qualification/SKILL.md` and
  `.agent/SPONSOR_REQUIREMENTS.md` require live Privy/Arc/Studio evidence and
  prohibit qualification claims from mocks or plans; the checklist preserves
  these boundaries.
- `.agent/IMPLEMENTATION_LOOP.md` requires exact tree identities, fresh FreePi
  A/B, required CI, and human-only merge; the stacked PR follows that loop.

## Unresolved questions

- Fresh authorized R4 supplier/Studio evidence, prize-pool verification, and a
  short video are still external/human tasks.
- PostgreSQL Testcontainers remains unrun where no container runtime exists.

## Git and PR state

- Branch: `feature/r5-release-submission`
- Base: `feature/r4-live-failure-demo` at `b22c79e03b1c6b441b7a58ba40402850e47baddf`
- Candidate staged tree: captured separately for Gate A; this context record
  intentionally does not duplicate the hash because changing this file would
  change the candidate tree.
- Commit: uncommitted
- PR: not created
- CI: not run for this tree

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Capture Gate A for the current staged tree from `git write-tree`.
2. Capture Gate A, commit, push, open the stacked PR, wait for CI, then capture
   Gate B and stop for human review.
