# Session Context: Resumable paid-tools plan

## Date/time

- UTC: 2026-09-10T21:30:12Z

## User goal

Reshape the current plan around resumable paid tools and open a documentation PR.

## Original prompt/request

Reshape the project plan with the recent vision, intentions and main purpose;
plan a friendlier UI/UX with new tools, separate landing page and user cabinet;
open a PR afterward.

## Assumptions

- Documentation only: no runtime/UI implementation or live payment requested.
- Preserve the settlement engine and original milestone evidence. New R0–R5
  acceptance is separate from historical P0–P6 and mandatory FreePi A/B.
- One supplier and one allowlisted testnet workspace are the initial scope.

## Plan

1. Replace stale product roadmap and gap report with a bounded paid-job increment.
2. Align project context, public introduction, sponsor guidance and demo script.
3. Validate, obtain fresh Gate A, commit/push and open a draft PR to develop.
4. Wait for applicable CI, obtain fresh Gate B, then request human review.

## Key decisions

- Resume the job, not the payment; at-most-once payment, supplier-dependent
  delivery, no universal exactly-once external execution claim.
- Stable task/order binding, separate delivery state, workspace isolation,
  one connector and existing-result retrieval are planned before expansion.
- Separate public landing from private cabinet; tools/jobs first, hashes in
  advanced details. No fictional settings or unsupported daily-budget claims.
- Routine Graph activity is read-only; known-hash success does not depend on
  Graph. Current mapping has null memo correlation; ambiguous attribution holds.
- Live faults and supplier outcomes must be distinguished from offline fixtures.
- Reconcile the skill's obsolete MCP-only wording with canonical sponsor policy
  and current official Studio eligibility, without lowering evidence requirements.

## Files/components touched

- plan.md and plan_missing_parts.md: revised roadmap and explicit new gaps.
- .agent/PROJECT_CONTEXT.md and README.md: scoped vision and delivery limits.
- milestones/README.md: original packet scope versus new increment.
- .agent/SPONSOR_REQUIREMENTS.md and sponsor-qualification skill: priorities
  and consistent live Studio evidence requirements.
- docs/DEMO_SCRIPT.md: planned live paid-job demo versus existing rehearsal.
- This context record: acceptance and handoff.

## Commands/checks

- git pull --ff-only origin develop: already current at 86c8f86.
- Initial working tree: clean; branch is feature/resumable-agent-tools-plan.
- pnpm format:check, lint, typecheck: PASS.
- pnpm test (includes build): PASS, 66 files / 977 tests.
- pnpm check:generated and validate:fixtures: PASS.
- pnpm scenarios:invariants: PASS, 7 baseline scenarios; not proof of the new
  supplier workflow.
- Changed-file markdownlint: PASS after fixing three bare documentation URLs.
- git diff --check: PASS. Only nine intended Markdown files are changed.
- Local Node is v22.23.2 versus the repository's v24.19.0 pin; checks passed
  with an engine warning. Required remote CI still gates readiness.
- No new runtime behavior; browser/live/provider/DB integration checks were
  not rerun locally for this documentation change. No live effects performed.

## External-doc findings

- Official ETHOnline 2026 sponsor pages checked 2026-09-10:
  [Privy](https://ethglobal.com/events/ethonline2026/prizes/privy),
  [Arc](https://ethglobal.com/events/ethonline2026/prizes/arc),
  [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph).
- Studio live queries are accepted; meaningful data use remains required.
- Arc mainnet condition is part of the award, not a separate bonus.
- Event pool must match actual project history/registration.

## Unresolved questions

- Actual supplier and exact order-to-transfer binding are R0 decisions.
- Future live permissions and supplier configuration require human involvement.
- Sponsor qualification for the new workflow is not verified.

## Git and PR state

- Branch: feature/resumable-agent-tools-plan.
- Base: develop at 86c8f860cb7a74e9de51301a53c45d9a08361aa3.
- Commit: uncommitted; intended documentation is staged.
- PR: user explicitly instructed opening it without FreePi after the blockage.
- CI: pending remote PR creation; no CI waiver or merge authorization given.

## Review gates

- Gate A: first candidate passed in fresh free-pi-cli (deepseek-v4-flash).
  Branch-prefix/context correction changes the tree; that verdict is obsolete.
  A fresh review is required for the final candidate before push.
- Two fresh final-candidate review attempts returned HTTP 409 concurrent_session
  without a verdict. All reviewer processes started by this task were closed.
  Do not terminate another account session without user direction.
- Gate B: NOT RUN; requires valid Gate A, draft PR and green required CI.
- User subsequently explicitly waived FreePi for this PR: "fuck freepi just
  open pr". Proceed with commit/push and a draft PR, recording A/B as waived,
  not PASS. Canonical review policy is not changed for future work.
- Exact immutable review/CI evidence belongs in the PR. Subsequent context
  updates must not be included in an already-reviewed candidate without new gates.

## Handoff/next steps

1. Commit/push the documentation and open a draft PR under the explicit waiver.
2. Record exact commit/tree, validation and waived FreePi state in the PR.
3. Leave CI and human review visible; do not claim merge readiness or merge.
4. R0 implementation follows human plan review.
