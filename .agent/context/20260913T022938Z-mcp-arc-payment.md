# Session Context: MCP Arc payment

## Date/time

- UTC: 2026-09-13T02:29:38Z

## User goal

Implement and test the PR #112 `arc_payment` MVP in the `mcp-integration`
worktree, then stop before FreePi Gate A/B.

## Original prompt/request

"From now on we are going to use mcp-integration part. And test everything
there. Start implementing plan. from there. Stop before gates."

## Assumptions

- The first release uses the existing Privy server wallet and direct Arc
  Testnet USDC settlement worker.
- A configured allowed request key is the one-intent demo quota; changing that
  deployment setting is an operator action.
- Tests use fakes or isolated PostgreSQL and must not submit a live payment.

## Plan

1. Add the official stateless Streamable HTTP MCP handler and one tool.
2. Isolate MCP bearer authentication from browser/internal API credentials.
3. Convert exact decimal USDC to atomic units and reuse `createOrReplay`.
4. Proxy `/mcp`, document configuration, and run focused plus full checks.
5. Stop before Gate A/B, commit, push, deployment, or live settlement.

## Key decisions

- Use official `@modelcontextprotocol/server` and Node adapter version 2.0.0.
- Enforce one configured request key instead of adding quota persistence and a
  database migration for the literal single-payment demo.
- Keep the MCP handler free of signing/submission logic; the durable outbox
  worker remains the only external-effect path.

## Files/components touched

- `apps/api/src/mcp.ts`: official MCP handler, one `arc_payment` tool, exact
  money parsing, deterministic identity, one-key quota, bounded status wait.
- `apps/api/src/app.ts`, `config.ts`, `runtime.ts`: isolated bearer route and
  fail-closed runtime configuration.
- `apps/web/worker.ts`: same-origin `/mcp` proxy with MCP headers.
- `.env.example`, `docs/MCP_ARC_PAYMENT.md`, `README.md`: safe configuration
  placeholders and a non-hardcoded walkthrough.
- API/Web unit and PostgreSQL integration test definitions.

## Commands/checks

- `npm view @modelcontextprotocol/{server,node}` - selected current 2.0.0,
  Node >=20.
- `pnpm --filter @oneshot/api test -- mcp.test.ts config.test.ts` - PASS, 25.
- `pnpm --filter @oneshot/web test -- worker-proxy.test.ts` - PASS, 4.
- `pnpm test` - PASS, build plus 83 files / 1091 tests.
- `pnpm test:browser` - PASS, 8 Chromium checks.
- `pnpm lint` and `pnpm format:check` - PASS.
- `pnpm check:generated` - PASS; generated contracts current.
- `pnpm validate:fixtures` - PASS; 9 contracts and 7 UI fixtures.
- `TEST_POSTGRES=1 pnpm --filter @oneshot/api test:integration` - BLOCKED
  before tests because no local Docker/container runtime was available. The
  added 10-call PostgreSQL concurrency test remains unexecuted locally.
- Test host ran Node 22.23.2 while the repository pins Node 24.19.0; pnpm
  reported the existing engine warning. TypeScript/build/tests still passed.

## External-doc findings

- Official TypeScript SDK HTTP docs use `createMcpHandler(factory)` and
  `toNodeHandler(handler)` for Fastify/Node; the factory is per request and the
  default keeps stateless 2025 compatibility:
  <https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md>.
- SDK migration guidance supports the 2026-07-28 protocol and stateless 2025
  fallback from one tool factory:
  <https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md>.

## Unresolved questions

- PostgreSQL MCP concurrency test must run in CI or another local environment
  with Docker before Gate A.

## Git and PR state

- Branch: `mcp-integration`
- Base: `origin/develop` at `91a7744bd212d8c2afadf0e08bebd1deea8fc59d`
- Commit: uncommitted, staged candidate
- PR: not created
- CI: not run; no pushed head

## Review gates

- Gate A: NOT RUN, per user instruction to stop before gates.
- Gate B: NOT RUN, no PR/head.

## Handoff/next steps

1. Run the PostgreSQL integration suite where Docker is available.
2. If green, proceed to exact candidate staging/Gate A only when instructed.
