# Session Context: Vertex AI Recovery Advisor and Subgraph MCP Client

## Date/time

- UTC: 2026-09-08T23:25:00Z

## User goal

Implement the live Recovery Agent (Vertex AI Gemini) and Subgraph MCP Client for candidate recovery, wire them into worker composition, verify fail-closed invariants, and execute a live recovery drill.

## Original prompt/request

"we can not add graph mcp without recovery agent. we need to do that first than everything else"

## Assumptions

- Google Cloud ADC or dynamic token retrieval provides authentication for Vertex AI REST API in `europe-west1`.
- The Graph Gateway deployment endpoint provides fallback candidate discovery when no local MCP server process is running.
- Invariants: external indexer absence, lag, or model errors must NEVER grant settlement permissions (`settlementPermission: 'NEVER'`). All settlements are decided solely by the OneShot deterministic safety core and verified against authoritative Arc receipts.
- Secrets remain in Secret Manager / environment, never committed or exposed in logs.

## Plan

1. Implement `VertexAiRecoveryAdvisor` in `packages/reconciliation/src/vertex-advisor.ts` conforming to `RecoveryAdvisorPort` and `validateAndNormalizeRecommendation`.
2. Implement `LiveSubgraphMcpRecoveryPort` in `packages/reconciliation/src/subgraph-mcp-client.ts` supporting both MCP JSON-RPC and direct Gateway deployment endpoints.
3. Export both implementations from `@oneshot/reconciliation`.
4. Add unit test suites for `VertexAiRecoveryAdvisor` and `LiveSubgraphMcpRecoveryPort`.
5. Wire both into `apps/worker` composition and add integration tests in `p4-composition.test.ts`.
6. Execute live recovery drill with real Vertex AI `gemini-2.5-flash` on GCP and real Arc Testnet receipt.
7. Run repository validation checks and FreePi Gate A / Gate B.

## Key decisions

- Vertex AI REST `generateContent` with JSON response mode (`application/json`) is used for low overhead and no heavy SDK dependencies.
- Subgraph MCP client wraps Gateway responses into the standard MCP tool content envelope, ensuring unified downstream normalization through `normalizeSubgraphMcpTrace`.
- Safety core maintains total authority over settlement decisions: LLM advice is strictly advisory (`settlementPermission: 'NEVER'`).

## Files/components touched

- `packages/reconciliation/src/vertex-advisor.ts`: Vertex AI Gemini recovery advisor implementation.
- `packages/reconciliation/src/subgraph-mcp-client.ts`: Live Subgraph MCP / Gateway recovery client.
- `packages/reconciliation/src/index.ts`: Public exports for both clients.
- `packages/reconciliation/test/vertex-advisor.test.ts`: Comprehensive tests for Vertex AI advisor (valid recommendation, HTTP error fallback, invalid JSON, prompt injection defense, fabricated ID rejection).
- `packages/reconciliation/test/subgraph-mcp-client.test.ts`: Tests for MCP JSON-RPC and Gateway modes.
- `apps/worker/test/p4-composition.test.ts`: End-to-end composition test verifying `ProductionRecoveryService` with `LiveSubgraphMcpRecoveryPort` and `VertexAiRecoveryAdvisor` converging an `UNKNOWN` intent to `COMMITTED` with zero external submissions.

## Commands/checks

- `pnpm --filter @oneshot/reconciliation test`: PASS (83 tests).
- `pnpm --filter @oneshot/worker test`: PASS (27 tests).
- `pnpm test`: PASS (56 test files, 878 tests).
- `pnpm lint`: PASS (0 errors, 0 warnings).
- `pnpm typecheck`: PASS.
- Prettier targeted check: PASS.
- `git diff --check`: PASS.
- Live Drill (`scratch/live-recovery-agent-drill.mjs`): PASS. Real Gemini 2.5 Flash on Vertex AI responded in 5.3s, evaluated UNKNOWN intent, advised RECONCILE, verified on-chain against Arc Testnet receipt, marked COMMITTED with 0 duplicate broadcasts.
