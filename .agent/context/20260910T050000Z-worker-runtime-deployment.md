# Session Context: Worker runtime deployment repair

## Date/time

- UTC: 2026-09-10T05:00:00Z

## User goal

Repair the deployed OneShot flow that accepts intents but leaves them in
`AUTHORIZING`, then finish the repository delivery loop with Gate A, CI, Gate B,
and a pull request for human review.

## Diagnosis

- Cloud Run service `oneshot-api` is ready and persists intents successfully.
- Cloud Run service `oneshot-worker` is not ready. Revision
  `oneshot-worker-00001-dj4` exits with `ERR_MODULE_NOT_FOUND` for
  `@privy-io/node` before it listens on port 8080.
- `Dockerfile.worker` copied the built workspace and then ran root-level
  `pnpm prune --prod`. In this workspace layout the prune removed a runtime
  dependency required by `apps/worker/dist/runtime.js`.
- The worker service also has no environment variables or Cloud SQL attachment.
  Deployment configuration must be supplied before the repaired image can run.
- A read-only Cloud SQL inspection found four pending `authorize_intent` jobs.
  Two recipients are outside the reviewed allowlist. Two allowlisted jobs could
  submit a total of 2 USDC on Arc Testnet when the worker is enabled, so no live
  worker revision was started without an explicit operator decision.

## Changes

- `Dockerfile.worker`: keep the already-installed workspace runtime dependency
  graph instead of pruning it from the final image.
- `apps/worker/src/runtime-config.ts`: make the remote Subgraph MCP endpoint
  optional so the existing deployment-pinned The Graph Gateway path can be used
  when no separately hosted MCP server exists.
- `apps/worker/test/runtime-config.test.ts`: cover the Gateway fallback
  configuration.
- `.env.example` and `apps/worker/README.md`: document the optional endpoint.

## Verification

- `pnpm --filter @oneshot/worker test`: PASS, 32 tests before the config change.
- `pnpm --filter @oneshot/worker test -- runtime-config`: PASS, 5 tests.
- `pnpm --filter @oneshot/worker typecheck`: PASS.
- `pnpm --filter @oneshot/worker lint`: PASS.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
  `pnpm check:generated`: PASS.
- `pnpm test`: PASS, 64 files and 945 tests.
- `pnpm --filter @oneshot/web test:browser`: PASS, 7 tests.
- `pnpm --filter @oneshot/web build`: PASS.
- `markdownlint-cli2`: PASS, 133 Markdown files.
- Cloud Build `e4f10b6f-0765-44b3-9949-8677242b8f37`: PASS; candidate worker
  image built from `Dockerfile.worker`.
- Cloud Build `6c4145f7-a32e-4ffc-ba07-48d76bb9d97d`: PASS; importing
  `@privy-io/node` from the final candidate container succeeds.
- Local Node is 22.23.2 while the repository pins 24.19.0. Container and CI use
  Node 24; local commands emit the known engine warning.

## Safety and invariant notes

- No database rows, Privy policies, wallet settings, secrets, or Arc state were
  mutated during diagnosis.
- No queued settlement was submitted.
- Existing durable outbox rows remain pending and retain their stable Business
  Intent IDs.
- The Graph remains non-authoritative candidate discovery. The Recovery Agent
  remains advisory and has `settlementPermission: NEVER`; Arc receipt
  verification remains authoritative.

## Git and gate state

- Branch: `fix/worker-runtime-deployment`
- Base: `origin/develop` at
  `6a968786dddb9c411ff403bac282bac59a87fbcb`
- Gate A: NOT RUN
- Gate B: NOT RUN
- Pull request: NOT OPEN

## Remaining work

1. Run full workspace validation and secret hygiene checks.
2. Commit the exact candidate and run fresh Gate A.
3. Push, open a draft PR to `develop`, wait for CI, and run fresh Gate B.
4. Mark the PR ready for human review; agents do not merge.
5. After the operator selects which pending allowlisted intents may execute,
   configure the Cloud Run worker with minimum one instance and CPU allocated
   outside requests, deploy the reviewed image, and verify readiness and queue
   convergence without duplicate settlement.
