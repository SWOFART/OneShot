# Session Context: MCP profile docs and bearer copy

## Date/time

- UTC: 2026-09-13T07:15:00Z

## User goal

Make MCP onboarding easier from Profile by linking directly to `/docs/mcp` and
letting the user copy the newly issued personal bearer token.

## Original prompt/request

The user asked to add the documentation link
`https://oneshot.kapustazh.dev/docs/mcp` to Profile and add a button that copies
the bearer token.

## Assumptions

- Copying is available only while the plaintext token is already displayed
  after generation or rotation.
- The token remains memory-only and is never persisted by the frontend.
- This branch stacks on the deployed Privy Buffer compatibility fix so a new
  frontend deployment does not regress that fix.

## Plan

1. Add the internal documentation link to the MCP profile panel.
2. Reuse the browser Clipboard API to copy only the displayed bearer.
3. Add focused UI coverage and validate the web package.

## Key decisions

- Use `navigator.clipboard` directly; no dependency or storage is needed.
- Report copy failure in the existing profile error surface.

## Files/components touched

- `apps/web/src/components/McpProfile.tsx`: documentation link and copy action.
- `apps/web/test/app-composition.test.tsx`: link and clipboard behavior coverage.

## Commands/checks

- `pnpm --filter @oneshot/web test -- app-composition.test.tsx` - PASS,
  7 tests.
- `pnpm --filter @oneshot/web typecheck` - PASS.
- `pnpm --filter @oneshot/web test` - PASS, 17 files / 93 tests.
- `pnpm --filter @oneshot/web test:browser` - PASS, 8 Chromium tests.
- `pnpm lint` - PASS.
- `pnpm format:check` - PASS.
- `git diff --check` - PASS.
- Local Node is v22.23.2 while the repository requests v24.19.0.

## External-doc findings

- None.

## Unresolved questions

- None.

## Git and PR state

- Branch: `feat/mcp-profile-docs-copy`
- Base: `fix/privy-browser-buffer` at
  `dcc730792440e3f90cb5e96fe0597f80072a51d0`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN under the user's standing explicit instruction to continue
  without FreePi; no PASS is claimed.
- Gate B: NOT RUN

## Handoff/next steps

1. Inspect the focused diff, commit, push, open a stacked PR, and deploy the
   frontend.
