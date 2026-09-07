# Session Context: C01 recovery evidence strategy

## Date/time

- UTC: 2026-09-07T13:06:20Z

## User goal

Implement the Coder C milestone sequence, starting with C01, so OneShot has a provider-neutral, fail-closed recovery evidence contract before any live Subgraph MCP adapter is admitted.

## Original prompt/request

Reply in English and keep responses concise. Work as Coder C on the milestones under `milestones/coder-c`, create a new branch from `develop`, begin coding, use existing `.agent/research` on Subgraph MCP, and perform additional Graph research when needed. Stop and ask if a material requirement is unclear.

## Assumptions

- C01 is the first implementation scope; later C milestones remain out of this branch.
- Offline contract mode is sufficient for local implementation. Missing live deployment/model credentials must remain an explicit evidence gap and cannot be represented as sponsor qualification.
- The Graph, Subgraph MCP, and any future model output remain non-authoritative and cannot grant settlement or retry permission.
- C01 is integrated into Coder A's pnpm workspace scaffold now present on `develop`.

## Plan

1. Freeze `index-view-v1` provider-neutral evidence and MCP boundary schemas.
2. Add strict runtime validation, deterministic fixtures, and simulator coverage for healthy and degraded observations.
3. Publish the removal/value matrix, live-spike protocol, safe fallback decision, and package-local verification commands.
4. Run format, lint, type, test, and build checks; inspect scope and record results.

## Key decisions

- Branch from the verified current `develop` SHA using the milestone-prescribed branch name.
- Keep C01 in `packages/reconciliation`; do not create `packages/subgraph-mcp-adapter` or `subgraph/` until a live deployment passes the value gate.
- Pin immutable deployment/query identity in the contract and reject unknown fields or missing `_meta` freshness instead of trusting generic MCP output.
- Follow B01/B02's direct USDC transfer decision: production correlation is sender/token/recipient/amount plus a bounded block window; `memo_id` is unused.

## Files/components touched

- `.agent/context/20260907T130620Z-c01-recovery-evidence-strategy.md` - active C01 decisions and evidence.
- `packages/reconciliation` - implemented standalone `index-view-v1`, known-identity evidence schema, strict MCP boundary, deterministic simulator, 24 tests, and live-value decision docs.

## Commands/checks

- `git fetch origin develop` - passed; branch rebased to `c3ab0ca5faba435f4ca8275f6e60c08e877b97b0`.
- Required repository policy, implementation loop, security/sponsor rules, test matrix, Coder C milestones, and repo skills read before editing.
- Official The Graph documentation checked on 2026-09-07 for immutable deployment query tools and `_meta` fields.
- Package-local Prettier check - passed.
- Package-local ESLint 10.0.1 strict typed lint - passed.
- TypeScript 6.0.3 strict typecheck and build - passed on Node 24.19.0.
- Vitest 5.0.0 - 24 tests passed; fresh/empty/lagging/unhealthy/unavailable/malformed/injected/duplicate/out-of-order/contradictory and identity-drift cases covered with zero settlement permission.

## External-doc findings

- The Graph Subgraph MCP introduction and `graphops/subgraph-mcp` README, checked 2026-09-07: use a deployment-pinned execute-query tool; the MCP server returns structured Subgraph results and is not an LLM.
- The Graph GraphQL API docs, checked 2026-09-07: `_meta` exposes deployment, indexed block number/hash/timestamp, and `hasIndexingErrors`; C01 validates these as non-authoritative health/freshness evidence.
- The Graph supported-network registry, checked 2026-09-07: Arc Testnet is supported under `arc-testnet` and chain ID `eip155:5042002`, so a live OneShot/Arc Subgraph is feasible.

## Unresolved questions

- The repository contains no immutable OneShot/Arc deployment ID, Subgraph MCP connection, model access, or deployment credentials. The user authorized a new deployment if needed, but credential entry remains a human setup dependency. Until those inputs exist, the production adapter remains unadmitted and the safe mode is `FALLBACK_DIRECT_RECOVERY`.

## Git and PR state

- Branch: `milestone/c01-recovery-evidence-strategy`
- Base: `develop` at `c3ab0ca5faba435f4ca8275f6e60c08e877b97b0`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Resolve the live deployment/configuration choice, then run the C01 live MCP/agent value gate or retain the explicit fallback.
2. Stage the exact candidate, run Gate A, and continue the implementation loop only after the decision is reflected in code and evidence.
