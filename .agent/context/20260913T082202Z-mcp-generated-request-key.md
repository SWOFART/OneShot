# Session Context: MCP generated request key

## Date/time

- UTC: 2026-09-13T08:22:02Z

## User goal

Make `arc_payment` generate its request key through the calling agent instead
of asking the user to copy a profile-configured key, then redeploy the MCP API.

## Original prompt/request

The user reported that a payment was rejected because the supplied value did
not match the configured demo request key. They asked for request keys to be
generated automatically like the web flow (`report-<purpose>-<random suffix>`),
without manual copying, and for MCP to be redeployed.

## Assumptions

- The MCP caller generates and retains the key before its first tool call, as
  the web client does; server-side generation after receipt would make a lost
  first response unsafe to replay.
- Existing worker settlement caps, Privy policy, and Arc Testnet remain
  authoritative after removing the obsolete one-intent deployment quota.
- Six unrelated changes in the original worktree belong to the user and stay
  untouched; this task uses a clean linked worktree.

## Plan

1. Remove the deployment-wide request-key allowlist and profile key output.
2. Tell MCP clients and the downloadable skill to generate and retain a random
   purpose-based key without asking the user.
3. Run focused and full checks, required review gates, push a draft PR, then
   redeploy and smoke-test the MCP API without sending a payment.

## Key decisions

- Keep `request_key` required in the tool call so transport retries preserve
  the exact stable business-intent identity; the agent generates it internally.
- Reuse the web naming convention and add no new dependency or persistence
  layer.

## Files/components touched

- `apps/api/src/mcp.ts`, `config.ts`, `runtime.ts`, `app.ts`: accept any
  validated caller-generated stable request key and remove deployment/profile
  key coupling.
- API unit/integration tests: generated-key acceptance, immutable conflict,
  same-key sequential and parallel convergence, personal workspace isolation.
- `apps/web`: remove obsolete profile request-key output and explain automatic
  agent generation.
- `.agents/skills/oneshot-arc-payment/SKILL.md`, `.env.example`, and
  `docs/MCP_ARC_PAYMENT.md`: update the client contract and deployment config.

## Commands/checks

- `git fetch origin develop` - base refreshed to
  `964d4751cf35e3e63f588868ad620d34dcd6e878`.
- Clean worktree created on `fix/mcp-generated-request-key`; original dirty
  worktree was not modified.
- Focused API tests - PASS, 47 tests.
- Focused web tests - PASS, 10 tests.
- `pnpm test` - PASS, 80 files / 1055 tests.
- `pnpm lint`, `pnpm format:check`, `pnpm check:generated`, and
  `pnpm validate:fixtures` - PASS.
- `pnpm scenarios:invariants` - PASS, all 7 scenarios including identical and
  conflicting replay, 10 parallel workers, two processes, restart, lost
  response, and downstream failure; every scenario retained at most one
  settlement.
- `pnpm test:browser` - PASS, 8 Chromium tests.
- API integration suite - 3 tests skipped because Docker is not installed;
  required CI remains the authoritative PostgreSQL run.
- `markdownlint-cli2@0.18.1` - PASS, 0 errors in changed Markdown.
- Checks ran on local Node 22.23.2; repository pins Node 24.19.0 and emitted
  the existing engine warning.

## External-doc findings

- None needed; this change uses the existing MCP SDK and deployment path.

## Unresolved questions

- PostgreSQL integration test is present for 10 parallel MCP calls but was not
  selected by the default suite; required CI will run the integration job.

## Git and PR state

- Branch: `fix/mcp-generated-request-key`
- Base: `origin/develop` at `964d4751cf35e3e63f588868ad620d34dcd6e878`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Implement and validate the focused change.
