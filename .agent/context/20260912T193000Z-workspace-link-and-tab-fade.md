# Session Context: workspace link and tab fade

## Date/time

- UTC: 2026-09-12T19:30:00Z

## User goal

Fix two reported defects in the operator workspace: the payment-confirmation
link is invisible in the light theme, and the content revealed by a tab does
not fade the way the tab strip itself does.

## Original prompt/request

"we need to fix front now. 1) on picture 1 whenever payment was confirmed,
confirmation hyperlink 'view Arc transaction' isnt visible. Picture one as
proof. 2) Also by fading animation i meant switching tabs 'overview', 'API
service', 'Requests', 'Payment proof'. Also dont forget that in overview tab
there are 3 tabs, which refers/linked to previous tabs (Run an API service,
View requests, See payment proof). Yes, tab themselves are fading, but content
which is opened after pressing tab is not." Follow-up: branch fresh from remote
develop, deliver only these two fixes, then commit, Gate A, and a ready PR with
Gate B skipped.

## Assumptions

- Only these two defects are in scope. An earlier attempt on a different branch
  also changed the light page ground and the tab surface; the user withdrew
  both, so this branch carries neither and is cut fresh from `develop`.
- Screenshot verification against the test-mode build is sufficient evidence
  for a visual fix; no live payment or deployment is involved.

## Plan

1. Commit, Gate A on the candidate tree, push, open a non-draft PR.

## Key decisions

- The settlement box rebinds the ink tokens its own descendants inherit rather
  than restyling the anchor globally, matching how `.paid-api-status` handles
  the lime field. A global anchor colour would have leaked into every card.
- Panel content is faded by keying its wrapper on what the operator is waiting
  for: the console panel on its active tab, and the request-list body on its
  loading state. Lengthening the animation would not help, because the rows do
  not exist while it runs.

## Files/components touched

- apps/web/src/styles.css: ink rebind and an explicit underlined anchor inside
  `.job-settlement-summary`.
- apps/web/src/App.tsx: the console tab panel is keyed and carries `.tab-fade`.
- apps/web/src/components/JobWorkspace.tsx: the request-list body is wrapped in
  a `.tab-fade` keyed on the loading state.
- apps/web/test/styles.test.ts, apps/web/test/app-composition.test.tsx:
  regression cover for the link ink and for both fade gaps.

## Commands/checks

- `pnpm format:check` - PASS
- `pnpm lint` - PASS
- `pnpm typecheck` - PASS
- `pnpm check:generated` - PASS, generated contracts current
- `pnpm test` - PASS, 83 files / 1088 tests, includes build. Note: the root
  vitest config includes only `.ts`/`.mjs`, so this run covers no `.tsx` test.
- `pnpm --filter @oneshot/web test` - PASS, 18 files / 86 tests. This is the
  run that covers the `.tsx` suites, including the new fade regression. CI
  runs only the root suite and the browser suite, so a `.tsx` regression is
  not caught there; Gate A caught a stale copy assertion here that both the
  root suite and CI would have missed.
- `pnpm --filter @oneshot/brand test` - PASS, 4 files / 18 tests
- `pnpm test:browser` - PASS, 8 tests, light and dark at 390/1440 px
- `markdownlint-cli2` - PASS on every tracked Markdown file
- Playwright screenshots of the test-mode build confirm the ArcScan link is
  legible in the light theme.
- Local Node is 24.20.0 against the pinned 24.19.0; CI must validate the
  pinned runtime.

## External-doc findings

- None. No version-sensitive integration changed.

## Unresolved questions

- None.

## Git and PR state

- Branch: fix/workspace-link-and-tab-fade
- Base: develop (e236c07c00f21b449e9b740488a24496840ced54)
- Commit: this record plus the implementation commit
- PR: not created yet
- CI: not run yet

## Review gates

- Gate A: NOT RUN at the time of writing; run against the final candidate tree
  before pushing.
- Gate B: skipped at the user's explicit instruction for this change; recorded
  as a deliberate deviation from `.agent/IMPLEMENTATION_LOOP.md`, not a pass.

## Handoff/next steps

1. Push after Gate A passes and open a non-draft PR against `develop` carrying
   the Gate A evidence.
2. A human owner reviews and merges.
