# Session Context: R3 activity audit

## Date/time

- UTC: 2026-09-11T04:27:55Z

## User goal

Continue implementing the current resumable paid-tools plan after the R0–R3
foundation and branded frontend work. Advance the next concrete Graph/activity
gap without weakening settlement safety.

## Original prompt/request

“Continue implementing that” after reviewing the current plan and its absence
of per-agent wallets.

## Assumptions

- R0–R3 job, supplier, cabinet and activity foundations already exist in
  `develop`; this slice completes the missing job-aware activity projection.
- R4 live payment and R5 release evidence remain human/external gates.

## Plan

1. Extend the activity contract with bounded transfer match results.
2. Match indexed transfers only to settlements in the authenticated workspace.
3. Display unmatched activity read-only and run focused/full validation.

## Key decisions

- Match on the immutable `(transaction_hash, transfer_log_index)` tuple only.
- Treat malformed stored observations as invalid; Graph evidence never changes
  payment state or grants submission permission.
- Do not add per-agent wallets; the plan keeps one Privy execution boundary.

## Files/components touched

- `packages/contracts`: generated activity transfer contract and OpenAPI.
- `packages/storage-postgres`: validate observations and project matched/unmatched
  transfers for one workspace.
- `apps/web`: show activity counts and unmatched transfer details while
  preserving prior data on refresh failure.
- `apps/api`, browser/unit tests, README and plan gap notes: contract fixtures,
  coverage and documentation.

## Commands/checks

- `pnpm --filter @oneshot/storage-postgres test -- --run test/jobs.test.ts` - PASS (5 tests).
- `pnpm --filter @oneshot/api test`, `pnpm --filter @oneshot/contracts test`, and
  `pnpm --filter @oneshot/web test` - PASS (55, 34 and 53 tests).
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm check:generated`,
  `pnpm build`, `pnpm test` - PASS (71 files / 997 tests).
- `pnpm --filter @oneshot/web test:browser` - PASS (4 Chromium tests).
- `npx --yes markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"` - PASS (149 files).
- Local Node `22.23.2` emits the repository's existing `24.19.0` engine warning.

## External-doc findings

- No new external documentation required; this uses the existing Graph Studio
  activity adapter and Arc/OneShot settlement records.

## Unresolved questions

- Live Studio evidence and an authorized interrupted Arc payment remain R4
  requirements.

## Git and PR state

- Branch: `feature/activity-audit`
- Base: `origin/develop` at `236676293eed417b3e3bb6d40d6482b1519c8667`
- Commit: `4a962ff6bb0946a07614dd71bfc86e17823ca3b2`
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Complete full checks, inspect scope, then decide whether to commit and open a
   focused PR for the R3 activity slice.
