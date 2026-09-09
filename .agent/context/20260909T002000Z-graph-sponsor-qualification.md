# Session Context: The Graph sponsor qualification and Gate P4 PASS

## Date/time

- UTC: 2026-09-09T00:20:00Z

## User goal

Resolve The Graph `NOT_VERIFIED` status and duplicate registration questions, execute live end-to-end recovery proof through Subgraph Studio and Subgraph MCP with Vertex AI Gemini 2.5 Flash, verify on Arc RPC, record sanitized evidence, and mark The Graph `QUALIFIED` and Gate P4 `PASS`.

## Original prompt/request

- "может мне удалить этот сабграф и сделать новый чтобы не было дубликата?"
- Provided live Subgraph Studio query endpoint: `https://api.studio.thegraph.com/query/1758917/oneshot-arc-testnet/version/latest`

## Assumptions

- No secrets or API credentials are committed or logged in git.
- The Graph target is AI Tooling or AI Use Case track.
- Deleting the on-chain published subgraph is neither necessary nor desirable; `69FEby7GetXpJVWJShPL6XjMsWWDowLuqf6cE5MvTHdy` is pinned as canonical and `FnXJmk...` is recorded as a duplicate publication pointing to the identical deployment CID `Qma8SKdatVjuwYzrZsHK4ZqVR2MGX8m4BxQFu6PqzXwHLi`.
- Subgraph Studio serves live synchronized Arc Testnet data directly to the Subgraph MCP recovery port.

## Plan

1. Support `graphQueryUrl` in `LiveSubgraphMcpRecoveryPortOptions` and adapt Studio `usdcTransfers` into standard `settlementCandidates` with typed `_meta`.
2. Run full live recovery proof: fetch mined Arc Testnet receipt, query live Subgraph Studio for USDC transfer candidates, normalize MCP trace with health `FRESH`, feed to Vertex AI Gemini 2.5 Flash, obtain `RECONCILE` advice, verify receipt via deterministic safety core, confirm `MARK_COMMITTED` with zero duplicate broadcasts.
3. Update `evidence/c06/sanitized-proof.json`, `packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md`, `docs/GATE_P4_MANIFEST.md`, `docs/GATE_P4_CHECKLIST.md`, `docs/settlement/LIVE_EVIDENCE.md`, `plan.md`, and `plan_missing_parts.md`.
4. Run full repository verification checks and FreePi review gates.

## Key decisions

- Kept both published registrations documented rather than wasting gas on deprecation transactions; the underlying IPFS CID `Qma8SKdatVjuwYzrZsHK4ZqVR2MGX8m4BxQFu6PqzXwHLi` is identical.
- Augmented `LiveSubgraphMcpRecoveryPort` with optional `graphQueryUrl` to query Subgraph Studio directly, transforming `usdcTransfers` into the standardized MCP candidate envelope so internal domain invariants remain unchanged.
- Ensured all recovery operations maintain `settlementPermission: NEVER` and emit 0 new broadcasts.

## Files/components touched

- `packages/reconciliation/src/subgraph-mcp-client.ts`: added `graphQueryUrl` option and Studio `usdcTransfers` schema adaptation.
- `packages/reconciliation/test/subgraph-mcp-client.test.ts`: added unit test for `graphQueryUrl` and Studio schema mapping.
- `evidence/c06/sanitized-proof.json`: recorded full live The Graph Subgraph MCP + Vertex AI Gemini proof.
- `packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md`: updated The Graph to `QUALIFIED`.
- `docs/GATE_P4_MANIFEST.md`: updated Gate P4 status to `PASS` and The Graph to `LIVE_VERIFIED`.
- `docs/GATE_P4_CHECKLIST.md`: marked step 5 complete and Gate P4 `PASS`.
- `docs/settlement/LIVE_EVIDENCE.md`: documented live Subgraph MCP + Vertex AI drill and updated limitations.
- `plan.md`: updated The Graph deployment status and sponsor claim mapping to `QUALIFIED`.
- `plan_missing_parts.md`: moved live Graph recovery and Gate P4 proof to completed.

## Commands/checks

- `pnpm --filter @oneshot/reconciliation test` - PASS (8 files, 84 tests)
- `pnpm --filter @oneshot/worker test` - PASS (4 files, 27 tests)
- `node scratch/run-live-graph-proof.mjs` - PASS (live Arc Testnet receipt + Studio Subgraph + Vertex AI Gemini + safety core)

## External-doc findings

- Subgraph Studio Query URL format: `https://api.studio.thegraph.com/query/<id>/<slug>/version/latest`
- The Graph decentralized network requires active Indexer allocations; Studio indexes custom testnets immediately without GRT staking.

## Unresolved questions

- None.

## Git and PR state

- Branch: `feat/graph-sponsor-qualification`
- Base: `develop` (`d40af37ef1130232fb651cf83087795e5c26b3fb`)
- Commit: pending
- PR: pending

## Review gates

- Gate A: pending
- Gate B: pending

## Handoff/next steps

1. Run root workspace checks (`lint`, `typecheck`, `test`, `format:check`, `check:generated`, `validate:fixtures`, `markdownlint`).
2. Run Gate A via `free-pi-cli`.
3. Commit, push, open PR, and run Gate B.
