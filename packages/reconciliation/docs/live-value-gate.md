# C01 live Graph provider value gate

## Current decision

`FALLBACK_DIRECT_RECOVERY` (provisional until the live promotion protocol passes)

The Arc Testnet USDC Subgraph source is present and a Studio deployment was
reported on 2026-09-08. However, no canonical immutable deployment identity
with an active Indexer allocation, approved Gateway/MCP connection, or sanitized
live model-to-core trace exists in the repository. The live sponsor/model
promotion is therefore not admitted. This is a safe capability fallback, not
evidence that The Graph failed technically.

Known-identity Privy/Arc recovery remains available. Automatic hashless
discovery through the live Studio GraphQL path is available in the
implementation, but The Graph qualification is `NOT VERIFIED` until a fresh
model-to-core trace is captured.

B01/B02 define v1 settlement as a direct USDC ERC-20 `transfer`. The live query
must bind sender, token, recipient, amount, and a bounded block window. It must
not rely on `memo_id`, because the approved settlement path does not emit one.

## Promotion protocol

Change the decision to `SELECT_GRAPH_PROVIDER` only when one sanitized trace
binds (Studio GraphQL is the active Arc path; Subgraph MCP remains optional):

1. immutable deployment ID and `_meta.deployment` manifest CID;
2. Retrieval path and pinned endpoint, plus query digest, variables, call ID
   when applicable, and retrieval time;
3. candidate data plus `_meta` indexed block/time, Arc RPC chain head, computed lag, health, and candidate count;
4. an LLM recommendation that references only evidence/candidate IDs and uses one frozen action;
5. deterministic-core disposition plus proof of zero new settlement calls;
6. exact Arc receipt/Transfer verification for any returned existing result.

Credentials, authorization headers, raw provider bodies, prompts containing
secrets, and model chain-of-thought are never recorded. Empty, delayed,
unhealthy, malformed, injected, multiple, or contradictory results preserve
`UNKNOWN`.

## Primary sources checked

- The Graph Subgraph MCP introduction: the server exposes Subgraph data as MCP tools and is not an LLM.
- `graphops/subgraph-mcp` main branch: the immutable tool is `execute_query_by_deployment_id`; it accepts `deployment_id`, `query`, and optional `variables`, and returns GraphQL JSON in one text content block.
- The Graph GraphQL API: `_meta` exposes deployment, indexed block number/hash/timestamp, and `hasIndexingErrors`.
- The Graph supported-network registry: Arc Testnet is supported as `arc-testnet` with CAIP-2 chain ID `eip155:5042002`.
