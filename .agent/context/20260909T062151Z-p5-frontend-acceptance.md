# Session Context: Gate P5 Frontend Acceptance

## Date/time

- UTC: 2026-09-09T06:21:51Z

## User goal

Compose the A05, B05, and C05 frontend slices described by P5 in `plan.md`
into the OneShot operator experience and verify the frontend acceptance gate.

## Acceptance criteria

- The root web app exposes create/replay, authoritative status, settlement
  evidence, and recovery evidence surfaces in one accessible shell.
- B05 is consumed through its read-only public route/client entry points; no
  settlement, resend, force-pay, or policy-bypass action is added.
- C05 is consumed through its public recovery route/client entry points and is
  clearly marked as synthetic fixture review when the live API lacks the
  package's richer timeline contract.
- Frontend tests cover the composed shell and the existing package fixtures
  continue to cover replay/conflict, committed/UNKNOWN, denial, Graph
  discovery, lag/error/multiple-candidate, and unavailable states.
- Package/root format, lint, type, test, build, generated-contract, fixture,
  and no-secret checks pass where applicable.

## Assumptions and non-goals

- The frozen OpenAPI v1 exposes `recovery-view`, not the full C05 timeline
  schema; this change does not widen or mutate that contract.
- Live B05 reads use the existing OneShot API client seam and runtime token.
- Live settlement behavior, external payment execution, and sponsor evidence
  remain outside P5 frontend composition.

## Branch state

- Branch: `feature/ethonline-2026-prize-audit`
- Base: `develop` at the current checked-out commit
- No formal Gate A/B run by the agent. A manual `free-pi-cli` review was
  supplied afterward; its FAIL was process-closed because the candidate is
  staged/uncommitted with no PR or CI, and it also identified missing loaded
  settlement no-action coverage and interactive browser smoke.

## Follow-up changes after manual review

- Added a loaded `SettlementDetailsRoute` composition test proving the rendered
  settlement evidence surface has no interactive controls.
- Added keyboard navigation and roving focus semantics for the application
  tabs, with explicit tab/panel labelling.
- Added a Playwright/Chromium browser acceptance suite for the P5 state matrix,
  responsive widths, and keyboard tab flow; CI installs Chromium and runs it.
- Made denial, rate-limit, and service-not-ready outcomes explicit in the
  create/replay surface instead of collapsing them into generic failure copy.
- Kept the browser smoke item open because this host exposes no browser
  provider; no gate was started after these changes.

## Gate A follow-up fixes

- Root Vitest now aliases `@oneshot/settlement-ui` and
  `@oneshot/recovery-ui` to workspace source, so the required clean-build
  `pnpm build && pnpm test` path does not depend on stale package bundles.
- Playwright `test-results/` and `playwright-report/` outputs are ignored by
  Git and Prettier; `pnpm format:check` was rerun after browser acceptance.
- Clean validation: `pnpm build` passed with both UI package `dist/`
  directories removed; `pnpm test` passed with 59 files and 916 tests;
  `pnpm test:browser` passed 4/4; `pnpm format:check` passed afterward.
- The web package Vitest config also aliases both workspace UI packages to
  source; after removing both UI `dist/` directories, `pnpm --filter
  @oneshot/web test` passed all 31 tests.

## Selected safety cases

- Same request twice and conflicting payloads remain handled by A05 with one
  stable `business_intent_id`.
- UNKNOWN remains reconciliation-only; the composed shell exposes no payment
  action.
- Privy denial/cap and Graph degraded evidence remain fixture-driven UI states;
  no fixture can grant settlement permission.

## Review instruction

Before every FreePi review prompt, issue `/model free-pi/glm-5.3-flash` first.
Inspect the end of the output for an explicit `VERDICT: PASS` or
`VERDICT: FAIL`; do not spend tokens following streamed reasoning.
