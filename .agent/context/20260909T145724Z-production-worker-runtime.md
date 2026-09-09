# Session Context: Production Worker Runtime

## Date/time

- UTC: 2026-09-09T14:57:24Z

## User goal

Implement the missing production worker runtime on a new branch: executable
startup and graceful shutdown, durable work delivery, validated Privy/Arc/
Subgraph MCP/Vertex configuration, restart recovery, health/readiness, a worker
container image, and a full API-to-worker end-to-end test.

## Original request

The user selected item 1 from the develop-branch gap audit and asked to
implement it in a new branch.

## Assumptions

- Base is `origin/develop` at
  `c38511c3981bbd70c6f4abd7a4ce469000cda878`.
- Arc Testnet is the only enabled live network. Mainnet remains unavailable and
  requires a separate human-authorized change.
- The runtime must fail closed unless the real Privy settlement provider and
  reviewed policy identity are fully configured.
- Subgraph MCP and Vertex AI remain read-only/advisory and may never grant
  settlement permission.
- The existing transactional outbox remains authoritative work delivery. A
  runtime may poll it continuously without moving duplicate protection out of
  PostgreSQL.

## Plan

1. Add focused runtime/config/provider tests first.
2. Add a concrete Privy Node SDK wallet provider and Arc RPC receipt adapter.
3. Add validated worker/recovery configuration and production composition.
4. Add executable runtime lifecycle, restart recovery, health/readiness, and
   graceful shutdown.
5. Add a dedicated worker container and documented environment surface.
6. Add PostgreSQL API-to-worker end-to-end coverage plus failure-boundary tests.
7. Run package and root validation, inspect scope/secrets, and prepare Gate A.

## Key decisions

- Use the existing OneShot transactional outbox poller as the continuous
  production runner; Graphile Worker task-list support remains available but is
  not used as a second queue authority.
- Use Privy's official Node SDK with the Business Intent-derived idempotency key
  already produced by `buildCanonicalRequest`.
- Use `viem` only for read-only Arc RPC receipt/block observations.
- Keep runtime logs limited to safe lifecycle/readiness facts; never emit
  configuration values or provider payloads.

## Files/components touched

- `apps/worker/src/runtime*.ts`, `server.ts`, and `restart-runner.ts`: production
  composition, lifecycle, non-overlapping continuous drain, health/readiness,
  and graceful shutdown.
- `apps/worker/src/worker.ts`: outbox delivery is committed only after handler
  success; failures/process kills leave the job pending.
- `packages/privy-adapter/src/privy-wallet-provider.ts`: official Privy Node
  signing with the durable idempotency key plus read-only viem Arc receipts.
- `.env.example`, `apps/worker/README.md`, and `Dockerfile.worker`: deployment
  configuration and image.
- Worker and adapter unit tests plus
  `apps/worker/test/production-runtime.integration.test.ts`.

## Commands/checks

- Repository policy and routed skills read.
- `git fetch origin develop`: base current.
- Official Graphile Worker library documentation reviewed: `run`, `Runner.stop`,
  and graceful-shutdown semantics confirmed.
- Official Privy Node SDK documentation reviewed: server-wallet
  `sendTransaction` and `idempotency_key` support confirmed.
- Final `pnpm test`: PASS, 60 files / 911 tests.
- `pnpm --filter @oneshot/worker test`: PASS, 32 tests.
- `pnpm --filter @oneshot/privy-adapter test`: PASS, 121 tests.
- `pnpm build`, `pnpm lint`, worker typecheck, generated-contract check, fixture
  validation, and `git diff --check`: PASS.
- `pnpm audit --audit-level high`: FAIL on 63 pre-existing workspace findings
  routed through Graph CLI/Wrangler-era dependencies; no advisory path named
  the newly added Privy or Google Auth packages.
- PostgreSQL integration attempt with `TEST_POSTGRES=1`: BLOCKED by the host
  having no Docker/container runtime; all three existing worker integration
  suites failed at Testcontainers startup before test execution. With the flag
  absent, 10 integration tests are correctly discovered and skipped.

## External-doc findings

- Graphile Worker supports a library runner with `taskList`, `pgPool`, and
  `Runner.stop()` for graceful shutdown.
- Privy `@privy-io/node` sends EVM transactions through
  `wallets().ethereum().sendTransaction` and accepts an idempotency key.

## Unresolved questions

- The new full PostgreSQL API-to-runner test still needs execution in CI or a
  workstation with Docker.
- Live deployment readiness requires operator-provided Privy/Graph secrets,
  reviewed public identities, Arc RPC access, and Google Application Default
  Credentials; no live external effect was attempted in this session.

## Git and PR state

- Branch: `feature/production-worker-runtime`
- Base: `origin/develop` at
  `c38511c3981bbd70c6f4abd7a4ce469000cda878`
- Commit: none
- PR: not created
- Workspace: all intended implementation and review-prompt files staged;
  implementation remains uncommitted

## Review gates

- Gate A: NOT RUN; staged candidate tree is captured immediately before the
  review invocation with `git write-tree`.
- Gate B: NOT RUN

## Handoff/next steps

- Run the PostgreSQL integration suite in a Docker-capable environment. If the
  user requests a commit/PR, stage the exact tree and run fresh FreePi Gate A
  before committing or pushing.
