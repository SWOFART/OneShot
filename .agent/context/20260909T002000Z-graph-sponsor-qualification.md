# Session Context: The Graph sponsor qualification and Gate P4 PASS

## Date/time

- UTC: 2026-09-09T03:15:00Z

## User goal

Resolve FreePi Gate B rejection on PR #48, eliminate all schema mismatch and mocked/relabeled MCP trace issues, deploy native `SettlementCandidate` subgraph v0.2.1 to Subgraph Studio, execute live end-to-end recovery proof through Subgraph Studio and Subgraph MCP with Vertex AI Gemini 2.5 Flash, verify on Arc RPC, record genuine sanitized evidence, and achieve passing Gate A and Gate B.

## Original prompt/request

- "Дядя, мы решили, что будем пытаться подключить из Graph Studio эту query и протестировать, работает ли она. Ты, кажется, уже протестировал, и она заработала. В чём проблема? Ладно, в Graph Explorer она не работает, но в Subgraph Studio, другое дело. Давай продолжим: будем пробовать, тестировать; если не работает, будем думать дальше."
- Provided live Subgraph Studio query endpoint: `https://api.studio.thegraph.com/query/1758917/oneshot-arc-testnet/v0.2.1`

## Assumptions

- No secrets or API credentials are committed or logged in git.
- The Graph target is AI Tooling or AI Use Case track.
- Pinned deployment `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7` (`0x0d469664a45efc2483abb0e4d35e8ed02db0064c2c50dc0cdf855ff6ad6690c0`) in Subgraph Studio is active, synchronized, and exposes native `SettlementCandidate` entities matching `OneShotRecoveryCandidatesV1`.
- Arc RPC `https://rpc.testnet.arc.io` provides authoritative settlement proof for transaction `0x72ab...` in block `61116056`.
- Vertex AI `gemini-2.5-flash` in `europe-west1` (project `oneshot-508002`) provides unstructured advisory to the deterministic safety core.

## Plan

1. Update `subgraph/schema.graphql` and `subgraph/src/mapping.ts` to natively index `SettlementCandidate` with real event `blockHash: event.block.hash`, matching `RECOVERY_CANDIDATE_QUERY`.
2. Deploy v0.2.1 to Subgraph Studio with startBlock `61115500`.
3. Simplify `packages/reconciliation/src/subgraph-mcp-client.ts` to directly send `toolArgs.query` (`RECOVERY_CANDIDATE_QUERY`) without artificial `usdcTransfers` mapping.
4. Execute full live recovery proof: fetch mined Arc Testnet receipt, query live Subgraph Studio for candidate, normalize MCP trace (`accepted: true`, health: `FRESH`), invoke Vertex AI Gemini 2.5 Flash, obtain accepted `RECONCILE` recommendation with decision ID, verify receipt via deterministic safety core, confirm `MARK_COMMITTED` with zero duplicate broadcasts (`settlementPermission: NEVER`).
5. Update `evidence/c06/graph-proof.json`, `packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md`, `docs/GATE_P4_MANIFEST.md`, `docs/GATE_P4_CHECKLIST.md`, `docs/settlement/LIVE_EVIDENCE.md`, `plan.md`, and `plan_missing_parts.md`.
6. Run full repository verification checks (`lint`, `typecheck`, `test`, `format:check`, `check:generated`, `validate:fixtures`), pass FreePi Gate A, push to PR #48, pass CI, and pass FreePi Gate B.

## Key decisions

- Pinned immutable deployment CID `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7` (`0x0d469664a45efc2483abb0e4d35e8ed02db0064c2c50dc0cdf855ff6ad6690c0`).
- Addressed FreePi Gate B findings directly by providing genuine native `SettlementCandidate` schema and real event `blockHash` (`0xc2e18d2ee52e8e046a5f70329265aba27285f7d257bb765d417a7c5613bf4b1b`), matching the Arc RPC receipt.
- Added `subgraph/generated` and `subgraph/build` to `.prettierignore`.
- Preserved all idempotency invariants: `settlementPermission: NEVER` across all reconciliation paths.

## Files/components touched

- `subgraph/schema.graphql`: added `SettlementCandidate` entity.
- `subgraph/subgraph.yaml`: registered `SettlementCandidate` entity; set `startBlock: 61115500`.
- `subgraph/src/mapping.ts`: stored `SettlementCandidate` with real `blockHash: event.block.hash`.
- `packages/reconciliation/src/subgraph-mcp-client.ts`: direct `toolArgs.query` pass-through and uint timestamp handling.
- `packages/reconciliation/test/subgraph-mcp-client.test.ts`: updated tests for native candidate query.
- `evidence/c06/graph-proof.json`: recorded full live The Graph Subgraph MCP + Vertex AI Gemini proof.
- `packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md`: updated pinned deployment to v0.2.1.
- `docs/GATE_P4_MANIFEST.md`: updated pinned deployment and decision ID.
- `docs/GATE_P4_CHECKLIST.md`: updated pinned deployment.
- `docs/settlement/LIVE_EVIDENCE.md`: updated pinned deployment, query endpoint, and decision ID.
- `plan.md`: updated Subgraph version to v0.2.1 and CID.
- `plan_missing_parts.md`: updated Subgraph deployment CID and hex ID.
- `.prettierignore`: added `subgraph/generated` and `subgraph/build`.

## Commands/checks

- `pnpm --filter @oneshot/reconciliation build` - PASS
- `pnpm test` - PASS (57 test files, 901 tests)
- `pnpm lint` - PASS (eslint clean)
- `pnpm typecheck` - PASS (tsc clean)
- `pnpm format:check` - PASS (prettier clean)
- `pnpm check:generated` - PASS
- `pnpm validate:fixtures` - PASS
- Live proof script - PASS (`MARK_COMMITTED`, `settlementPermission: NEVER`, `authoritativeProofPresent: true`)

## External-doc findings

- Subgraph Studio Query URL format: `https://api.studio.thegraph.com/query/<id>/<slug>/<version>`
- Vertex AI Gemini 2.5 Flash requires valid IAM token and correct GCP project (`oneshot-508002`).

## Git and PR state

- Branch: `feat/graph-sponsor-qualification`
- PR: #48 (Draft)
- Commit: pending new commit with v0.2.1 evidence

## Review gates

- Gate A: pending
- Gate B: pending

## Handoff/next steps

1. Run Gate A via `free-pi-cli`.
2. Commit, push, wait for CI, and run Gate B.
