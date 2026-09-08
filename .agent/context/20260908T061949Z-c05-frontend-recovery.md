# Session Context: C05 frontend recovery

## Date/time

- UTC: 2026-09-08T06:19:49Z

## User goal

Implement Coder C milestone C05, pass FreePi Gate B with GLM 5.3 Flash, then
start C06.

## Original prompt/request

"we have done all milestones of coders A,B,C to 04. Lets start build milestone
for coder C 05-frontend-recovery. Before we start check if you can write
something in npx free-pi-cli or if failed npx.cmd free-pi-cli. Check also
previos task to understand what have built already. If milestone c05 will be
finished and gate B will be passed that start with next milestone C 06"

The user later confirmed the repository path on `C:` and instructed PowerShell
use. The user also required `/model free-pi/glm-5.3-flash` before each FreePi
review.

## Assumptions

- Gate P4 backend convergence is merged at `25a17d8` and freezes the
  `recovery-view-v1` semantics implemented by `@oneshot/reconciliation`.
- Gate P4 did not publish its planned frontend mock artifact. C05 will first
  publish a C-owned, versioned, sanitized mock boundary without changing the
  shared OpenAPI or A/B-owned frontend slices.
- C05 remains an independently composable React/Vite slice. Gate P5 owns final
  application-shell composition.

## Plan

1. Freeze a versioned, sanitized recovery UI contract and mock fetch server.
2. Build the recovery route, timeline, provenance, MCP, agent/core, and UNKNOWN
   experiences.
3. Add fixture scenarios and component/accessibility/keyboard/responsive tests.
4. Run package and root checks, FreePi Gate A, draft PR CI, and FreePi Gate B.
5. Start C06 only after C05 Gate B passes.

## Key decisions

- Keep authoritative OneShot/Arc evidence visually separate from provider,
  Graph, and LLM observations.
- Expose refresh and escalation only. Never expose payment or generic retry
  actions.
- Discard unknown fields and reject forbidden raw-provider or secret-shaped data
  at the mock/client boundary.

## Files/components touched

- `packages/recovery-ui/`: independent React/Vite recovery slice, frozen JSON
  schema, sanitized mock server, fixture stories, styles, and 50 tests.
- `tsconfig.json`: recovery UI project reference.
- `pnpm-lock.yaml`: pinned recovery UI dependencies.
- This context record.

## Commands/checks

- `git fetch origin develop` - PASS.
- Base: `25a17d86b56822a7e7440d34c331b740cb6d7f04`.
- `npx.cmd free-pi-cli` interactive write test - PASS; reviewer replied
  `FREEPI_WRITE_OK`.
- `pnpm.cmd install --frozen-lockfile --config.confirmModulesPurge=false` - PASS.
- `pnpm.cmd --filter @oneshot/recovery-ui run verify` - PASS: format, lint,
  typecheck, 50 tests, and Vite library build.
- Desktop and 390-pixel viewport browser inspection - PASS; no horizontal
  overflow and all recovery panels/actions remain usable.
- `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd check:generated`, and
  `pnpm.cmd validate:fixtures` - PASS.
- `pnpm.cmd test` - first run exposed the existing millisecond-sensitive C03
  replay test; immediate full rerun passed all 560 tests.
- `pnpm.cmd format:check` - baseline checkout limitation: Prettier reports 122
  untouched CRLF files. The focused recovery UI Prettier check passes.
- `npx.cmd --yes markdownlint-cli2@0.18.1` for the two new Markdown files -
  PASS.
- Docker integration checks unavailable because Docker is not installed on this
  Windows host; C05 adds no database/runtime integration path.

## External-doc findings

- npm registry metadata confirms React 19.2.8 and Vite 8-compatible
  `@vitejs/plugin-react` 6.1.1.

## Residual risks

- Final app-shell composition remains owned by project Gate P5.
- Windows root formatting remains red on untouched CRLF files; changed-package
  formatting is green.

## Git and PR state

- Branch: `milestone/c05-frontend-recovery`.
- Base: `origin/develop` at `25a17d86b56822a7e7440d34c331b740cb6d7f04`.
- Commit: uncommitted.
- PR: not created.
- CI: not applicable.

## Review gates

- Gate A: NOT RUN.
- Gate B: NOT RUN.

## Handoff/next steps

1. Implement and validate C05.
2. Run fresh FreePi Gate A with `free-pi/glm-5.3-flash`.
3. Push a draft PR, verify CI, and run fresh Gate B.
4. Begin C06 after Gate B passes.
