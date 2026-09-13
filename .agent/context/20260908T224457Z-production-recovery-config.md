# Session Context: production recovery configuration

## Date/time

- UTC: 2026-09-08T22:44:57Z

## User goal

Fix blockers left by earlier plans before continuing future work, using provider access already held in Google Cloud, Privy, and The Graph.

## Original prompt/request

"let's fix current issues that we have from previous plans, after contining future work. all of api's i have in google cloud, privy, the graph and etc."

## Assumptions

- Credentials and API secrets remain outside Git and review prompts.
- The current packet fixes the production recovery configuration boundary before any live MCP/model adapter or evidence claim.
- A single configured sender and bounded block window are sufficient for the current live-value gate; per-intent window derivation is future work if multi-intent production recovery needs it.

## Plan

1. Remove placeholder Graph identity and unbounded recovery correlation values.
2. Require explicit production recovery lookup configuration and reject invalid input before MCP lookup.
3. Run repository checks and mandatory FreePi review gates, then open a draft PR.

## Key decisions

- Reused reconciliation's existing validation predicates through one exported boolean; no duplicate validator and no new dependency.
- Kept Subgraph MCP and advisor unavailable by default. Live admission still requires the recorded C01 promotion evidence.
- Used an options object for production recovery composition so provider ports and lookup configuration cannot be positionally confused.

## Files/components touched

- `packages/reconciliation/src/validation.ts`: reusable lookup-input validation.
- `packages/reconciliation/src/index.ts`: public validation export.
- `apps/worker/src/recovery-bridge.ts`: explicit real lookup configuration; placeholder removal; fail-closed validation.
- `apps/worker/src/composition.ts`: required production recovery options.
- `apps/worker/test/p4-composition.test.ts`: valid identities, propagation, and placeholder rejection coverage.

## Commands/checks

- `pnpm --filter @oneshot/reconciliation typecheck` - PASS; local Node 22 warning against pinned Node 24.19.0.
- `pnpm --filter @oneshot/worker typecheck` - PASS; same engine warning.
- `pnpm --filter @oneshot/worker test -- --run test/p4-composition.test.ts` - PASS, 7 tests after fixture correction.
- `pnpm --filter @oneshot/reconciliation test` - PASS, 74 tests.
- `pnpm lint` - PASS.
- `pnpm typecheck` - PASS.
- `pnpm test` - PASS, 54 files and 868 tests; includes full build.
- `pnpm format:check` - FAIL only on two pre-existing generated subgraph files; all five touched TypeScript files pass targeted Prettier check.
- `git diff --check` - PASS.

## External-doc findings

- The Graph official `graphops/subgraph-mcp` documentation confirms immutable queries use `execute_query_by_deployment_id` with deployment ID, query, and variables.
- MCP 2025-11-25 schema confirms `tools/call` is JSON-RPC 2.0 with a tool name and arguments.
- Google Cloud Vertex AI documentation confirms REST `generateContent` bearer authentication and JSON structured output support. No adapter is admitted in this packet.

## Unresolved questions

- Canonical live deployment ID, manifest CID, MCP endpoint/version, sender, and bounded Arc block window still need retrieval from operator-controlled systems.
- Live Subgraph MCP and Vertex AI model traces remain required before `SELECT_SUBGRAPH_MCP` or sponsor qualification.

## Git and PR state

- Branch: `fix/production-recovery-config`
- Base: `origin/develop` at `48391e4968675764632627716e580988a271c13d`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Finish local checks and Gate A.
2. Commit, push, open draft PR, wait for exact-head CI, and run Gate B.
3. After human merge, retrieve non-secret live identities and implement/admit the minimal MCP/model adapters only with live evidence.
