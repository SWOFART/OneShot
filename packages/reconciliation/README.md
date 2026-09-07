# `@oneshot/reconciliation`

`index-view-v1` is C01's provider-neutral recovery evidence contract. It turns
a deployment-pinned Subgraph MCP query result into a bounded, sanitized,
non-authoritative candidate view.

B01/B02 establish direct USDC ERC-20 `transfer` as the v1 settlement shape.
The production lookup therefore uses sender/token/recipient/amount plus a
bounded block window. `memo_id` is not sent by v1 settlement and is not a query
variable.

This package cannot submit or retry a settlement. It imports no domain,
storage, Privy, or Arc implementation and exposes no `SettlementPort`.

## Boundary

The parser accepts the public MCP `CallToolResult` shape used by
`execute_query_by_deployment_id`: exactly one text content block containing a
GraphQL JSON response. It validates byte limits before parsing and then checks:

- expected MCP server, tool, immutable deployment, query digest, and variables;
- a strict OneShot candidate schema and bounded candidate count;
- `_meta.deployment`, indexed block identity/time, and indexing-error state;
- chain-head lag and exact intent/request/correlation bindings;
- duplicate, out-of-order, mismatched, and contradictory observations.

Invalid, oversized, unavailable, injected, stale, or contradictory input
produces a fail-closed view. Empty data means only “not observed through block
N.” No output grants permission to pay.

## Verify

From this directory:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

The package participates in the root pnpm workspace and TypeScript project.

## Artifacts

- `schemas/index-view-v1.schema.json`: downstream sanitized view contract.
- `schemas/subgraph-mcp-result-v1.schema.json`: accepted GraphQL result body.
- `schemas/recovery-evidence-v1.schema.json`: known-identity local/Privy/Arc baseline.
- `src/simulator.ts`: credential-free deterministic scenarios.
- `docs/removal-value-matrix.md`: Graph removal/value comparison.
- `docs/live-value-gate.md`: sanitized live MCP/agent spike protocol and current decision.
