# README refresh and front-end derived banner — active context

## Date/time

- UTC: 2026-09-13T16:00:00Z

## User goal

Audit the repository, bring `README.md` back in line with the current code, and
put the product's own `.top-nav` panel ("OneShot / SETTLEMENT ENGINE") into the
README, derived from the front-end source rather than from a screenshot.

## Acceptance criteria

- README reflects the routes, workspace sections, API surface, repository
  layout, and delivery status that exist on `develop` today.
- The README banner is generated from `packages/brand/src/tokens.css`,
  `packages/brand/src/CommitRing.tsx`, and `apps/web/src/App.tsx`; no colour,
  mark geometry, or nav label is retyped by hand.
- `markdownlint`, `prettier --check`, `eslint`, and `tsc -b` stay green.
- No behaviour, contract, or configuration change.

## Assumptions

- GitHub strips CSS from Markdown, so the panel ships as two static SVGs (one
  per theme) chosen by a `<picture>` element rather than as live markup.
- Advance widths in the renderer are estimates; Rubik cannot be measured
  without a font engine, and sub-pixel slack inside a pill is not visible.

## Non-goals

- No change to `apps/web`, the API, or any adapter.
- No sponsor-qualification claim beyond what `docs/settlement/LIVE_EVIDENCE.md`
  and the C06 report already support.

## Branch state

- Branch: `feature/readme-refresh`
- Base: `origin/develop` at `65200cc2dfcf22912e532a157232e439d623044f`
- Untracked `packages/brand/test/slice-styles.test.ts` is unrelated user work
  and stays out of this change.

## Drift corrected in README

- `packages/brand` and the MCP/agent role of `apps/api` were missing from the
  repository layout.
- The `/docs/mcp` route, the five cabinet sections, and the Profile MCP bearer
  flow were undocumented; the old copy still described the legacy four-tab
  console and a "Tools" section that no longer exists.
- The API table was missing `/v1/jobs/user-wallet/prepare`,
  `/v1/jobs/{jobId}/user-wallet/submit`, `/mcp`, and the
  `/v1/profile/mcp-token` routes.
- Workspace identity is now derived from the verified Privy subject, not from
  the configured workspace id.
- Graph evidence is captured for every committed settlement, with a backfill.
- A duplicated sentence fragment in Project status was repaired.

## Commands and results

- `node scripts/render-nav-panel.mjs` — wrote both SVGs.
- `npx markdownlint-cli2 README.md` — 0 errors.
- `pnpm format:check` — all matched files use Prettier style.
- `pnpm lint` — clean.
- `pnpm typecheck` — clean.

## Gate state

The user explicitly waived FreePi Gate A and Gate B for this documentation-only
change and asked for a draft pull request instead. No gate verdict exists, so
the PR stays in draft until a human decides how to proceed.

## Remaining risk

- Local `pnpm test` / `pnpm test:browser` were not re-run; the change touches
  no source consumed by either suite.
- No independent review evidence backs this tree.
