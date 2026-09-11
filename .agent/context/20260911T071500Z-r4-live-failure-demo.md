# Session Context: R4 live failure demo

## Date/time

- UTC: 2026-09-11T07:15:00Z

## User goal

Implement the next plan step after the R3 activity-audit PR as a stacked PR:
provide a controlled response-loss demo, safe live API orchestration and
sanitized recovery evidence, then continue to the R5 release slice.

## Original prompt/request

“After you implement this part, leave PR and implement every other step in the
circle via stacking PR'S of all stepps.”

## Assumptions

- R3 is PR #78 on `feature/activity-audit`; this branch is stacked on its exact
  head and will not merge it.
- Live Arc Testnet spending remains opt-in and is not run by CI or this agent.
- Existing R0–R3 job, supplier, cabinet, activity and recovery code is reused.

## Plan

1. Add a one-shot post-broadcast response-loss wrapper and strict testnet-only
   runtime guard.
2. Add `demo:r4`, offline by default, with an explicit live API path that never
   retries an ambiguous create/resume/payment request and emits sanitized trace.
3. Test the durable UNKNOWN/no-second-submit invariant and update operations and
   plan documentation.
4. Run local checks, Gate A, required CI, Gate B, then open the next stacked PR.

## Key decisions

- The fault is injected after a confirmed provider result returns, before the
  worker persists that result; the worker therefore records POSSIBLY_SUBMITTED
  and durable UNKNOWN while preserving pre-submit provider identity.
- The hook is disabled by default and requires both
  `ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST=true` and
  `ONESHOT_DEMO_CONFIRM_TESTNET=true` on the Arc Testnet profile.
- The live runner treats missing Studio evidence or unresolved payment as
  HOLD/INCOMPLETE and never claims sponsor qualification.

## Files/components touched

- `apps/worker/src/failure-injection.ts`, runtime config/composition and tests.
- `scripts/demo-r4.mjs`, root package command and `.env.example`.
- Worker/demo/plan documentation and this context record.

## Commands/checks

- `pnpm format:check` - PASS.
- `pnpm lint` and `pnpm typecheck` - PASS.
- `pnpm check:generated` - PASS.
- `pnpm test` - PASS (77 files / 1,031 tests).
- `pnpm --filter @oneshot/web test:browser` - PASS (4 Chromium tests).
- `npx --yes markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"` - PASS (155 files).
- `pnpm demo:r4` - PASS, offline trace is explicitly `NOT_LIVE`.
- `git diff --cached --check` and `git diff --check` - PASS.
- Live Arc/Studio execution intentionally not run without explicit human
  authorization and deployment credentials.

## External-doc findings

- No new provider API research required; the existing Arc Testnet, Privy,
  Studio GraphQL and Vertex integrations are reused.

## Unresolved questions

- Fresh live response-loss, Studio and supplier-result evidence remains a human
  R4 acceptance task.
- R5 video and prize-pool verification remain after this branch.

## Git and PR state

- Branch: `feature/r4-live-failure-demo`
- Root develop: `236676293eed417b3e3bb6d40d6482b1519c8667`.
- Stacked parent: `feature/activity-audit` at
  `842f98b0ef9b0b9f812e1e734abfa5d424dc499f` (PR #78).
- Candidate staged tree: `c091319dd916edcca8513aa1b42ddd6f52fca502`.
- Commit/PR: pending

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

Run local validation and inspect the staged scope, then capture Gate A for the
exact candidate tree before pushing this stacked PR. Do not stage the user's
`cloudbuild-worker.yaml`, `.gcloudignore` or `cloudbuild-api.yaml` work.
