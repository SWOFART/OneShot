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
  `oneshot-worker-00001-dj4` exited with `ERR_MODULE_NOT_FOUND` for
  `@privy-io/node` before listening on port 8080.
- `Dockerfile.worker` copied the built workspace and then ran root-level
  `pnpm prune --prod`. In this workspace layout the prune removed a runtime
  dependency required by `apps/worker/dist/runtime.js`. (Fixed in PR #61).
- In addition, Privy Server Wallets do not support direct relayer broadcasting
  via `sendTransaction` (`eth_sendTransaction`) on custom EVM chains like Arc
  Testnet (`eip155:5042002`), throwing HTTP 401 `App is not authorized to transact
  on chain eip155:5042002`. Custom EVM networks require signing the transaction
  via Privy Server Wallet (`signTransaction` / `eth_signTransaction`, which
  strictly evaluates Privy Policies) and broadcasting the signed transaction via
  Arc JSON-RPC (`sendRawTransaction`).
- `classifyTransportError` only inspected `error.code`. Errors with HTTP status
  codes like 400 (Privy policy violation) or 401 were falling through to ambiguous
  `MALFORMED_RESPONSE` -> `UNKNOWN`. Routing `status`/`statusCode` through
  `classifyHttpStatus` correctly treats 4xx client errors as `PRE_BROADCAST` ->
  `LOCAL_VALIDATION_FAILED` -> `DEFINITELY_NOT_SUBMITTED` -> `FAILED_SAFE`.
- Cloud Run scaled `oneshot-worker` to 0 because `minScale` was unset (defaults to 0)
  and workers receive no inbound traffic. The service requires `--min-instances 1`
  and `--no-cpu-throttling`.

## Changes

- `Dockerfile.worker`: keep the already-installed workspace runtime dependency
  graph instead of pruning it from the final image (PR #61).
- `apps/worker/src/runtime-config.ts`: make the remote Subgraph MCP endpoint
  optional so the existing deployment-pinned The Graph Gateway path can be used
  when no separately hosted MCP server exists (PR #61).
- `packages/privy-adapter/src/privy-wallet-provider.ts`: add fallback from
  `sendTransaction` to Privy `signTransaction` and Arc RPC `sendRawTransaction`
  when the chain is unauthorized for direct Privy relayer broadcasting.
- `packages/arc-adapter/src/failure-taxonomy.ts`: inspect `error.status` and
  `error.statusCode` in `classifyTransportError` so HTTP status rejections are
  classified via `classifyHttpStatus`.
- Unit tests added covering both improvements in `privy-wallet-provider.test.ts`
  and `failure-taxonomy.test.ts`.

## Verification

- `pnpm --filter @oneshot/arc-adapter test`: PASS, 9 files / 195 tests.
- `pnpm --filter @oneshot/privy-adapter test`: PASS, 8 files / 122 tests.
- `pnpm --filter @oneshot/worker test`: PASS, 5 files / 33 tests.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
  `pnpm check:generated`: PASS.
- `pnpm test`: PASS, 64 files and 947 tests.
- `pnpm --filter @oneshot/web test:browser`: PASS, 7 tests.
- `pnpm build`: PASS across all packages.
- `markdownlint-cli2`: PASS, 133 Markdown files.
- Live Arc Testnet settlement via Privy `signTransaction` + Arc RPC `sendRawTransaction`
  verified mined on-chain at block 61339895 (Tx: `0x596e86170251e597d5edc87c05395e7ee9831ed79a933171ea839e5bba7d8d0b`).

## Safety and invariant notes

- Zero double-payment guarantee preserved.
- Policy enforcement preserved: Privy policy `balx3rtrpns3gnvhz3n32dml` is strictly
  evaluated on `signTransaction` before any raw transaction is broadcast.
- The Graph remains non-authoritative candidate discovery. The Recovery Agent
  remains advisory with `settlementPermission: NEVER`; Arc receipt
  verification remains authoritative.

## Git and gate state

- Branch: `fix/worker-runtime-deployment`
- Base: `origin/develop` at `cd7439058f94f1128bae70fac4017039a45d3d68` (PR #61)
- Gate A: PENDING
- Pull request: NOT OPEN
- Gate B: NOT RUN
