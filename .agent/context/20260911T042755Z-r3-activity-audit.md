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

- Focused storage, contract, API and web tests - PASS before final validation.
- Full repository checks - pending.

## External-doc findings

- No new external documentation required; this uses the existing Graph Studio
  activity adapter and Arc/OneShot settlement records.

## Unresolved questions

- Live Studio evidence and an authorized interrupted Arc payment remain R4
  requirements.

## Git and PR state

- Branch: `feature/activity-audit`
- Base: `origin/develop` (current remote SHA recorded before implementation)
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Complete full checks, inspect scope, then decide whether to commit and open a
   focused PR for the R3 activity slice.
