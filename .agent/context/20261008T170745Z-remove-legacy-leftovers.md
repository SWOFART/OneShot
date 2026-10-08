# Session Context: remove legacy leftovers

## Date/time

- UTC: 2026-10-08T17:07:45Z

## User goal

Remove the leftovers identified in the develop audit with minimal changes.

## Original prompt/request

"let's try to cut that out $caveman $ponytail"
Prior session instructions: do not reopen closed PRs; omit FreePi.

## Assumptions

- Retire the old tabbed console and migrate its coverage to current surfaces.
- Unknown paths use the public landing page, without exposing the old console.
- Preserve payment controls, applied migrations, evidence history, and demos.

## Plan

1. Remove the duplicate API Dockerfile and unused helpers.
2. Remove the legacy console and its unused CSS; migrate authentication and
   read-only evidence tests to current surfaces.
3. Run checks and create a fresh draft PR against develop.

## Key decisions

- Dockerfile remains canonical; evidence tooling and references now use it.
- Removed resumeSafeJobs, assertNever, scenarioNames, and unused Markdown renderer.
- Kept runStartupRecovery, drainOutboxJobs, and all settlement safeguards.
- Current cabinet, landing, and MCP docs routes remain; unmatched paths show landing.
- Standalone components, demos, applied migrations, and historical records remain.

## Files/components touched

- Dockerfile.api removed; evidence runner/test and evidence documentation updated.
- App.tsx legacy fallback and orphaned styles removed.
- Web authentication/composition tests migrated to current cabinet and evidence views.
- Worker wrapper, contracts helper, fixture helper, and recovery report helper removed.
- Restart runner documentation and this session record.

## Commands/checks

- Node 24.19.0 and pnpm 11.19.0 used for full validation via temporary npx tools.
- pnpm test: PASS, build plus 80 files / 1060 tests.
- Web unit tests: PASS, 17 files / 100 tests.
- pnpm format:check, lint, typecheck: PASS.
- pnpm check:generated and validate:fixtures: PASS.
- Browser acceptance: PASS, 8/8 tests after installing Chromium under goinfre.
  Browser check caught a damaged CSS comment from selector deletion; corrected
  comment and reran browser and web suites successfully.
- Repository-wide pinned Markdown and diff checks: PASS before commit.
- Test matrix: no settlement algorithm changes; existing root recovery/retry tests
  pass. Auth gating and read-only evidence tests cover migrated UI behavior.

## External-doc findings

- None; no new dependency or provider integration.

## Unresolved questions

- None.

## Git and PR state

- Branch: feature/remove-legacy-leftovers.
- Base develop: 55a387abad228d61c7a0a7a911299c103495bda0.
- Implementation commit: b7683c9.
- PR: [#151](https://github.com/SWOFART/OneShot/pull/151), new draft against develop.
- CI: triggered on pushed head; pending at creation.

## Review gates

- Gate A and B: SKIPPED following user's instruction to omit FreePi.
- No passing independent review claimed; PR remains draft.

## Handoff/next steps

1. Local checks pass; draft PR created. Monitor remote CI.
2. Human reviews and merges; agent does not merge.
