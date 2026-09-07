# The Graph Subgraph MCP Clarification

Date: 2026-09-07
Scope: primary-source clarification for OneShot's The Graph AI-track architecture and qualification evidence.

## Primary-source findings

- The Graph's Subgraph MCP is an open-source Model Context Protocol server that
  exposes Subgraph data to MCP-compatible clients. Its tools can inspect a
  schema, discover Subgraphs, and execute queries against a specific deployment
  ([Subgraph MCP introduction](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/)).
- The MCP server is not an LLM. It translates MCP tool requests into Subgraph
  queries and returns structured results for a client model to reason over
  ([Subgraph MCP introduction](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/)).
- The Graph's AI overview describes Subgraph MCP as the bridge through which
  models explore schemas, execute GraphQL queries, find Subgraphs, and retrieve
  live blockchain data ([AI overview](https://thegraph.com/docs/en/ai-overview/)).
- Current hackathon guidance lists AI applications that use The Graph as a live
  data source, including agents querying Subgraphs through Subgraph MCP. The
  catalog size does not impose a multiple-Subgraph minimum for this AI track;
  composable/standardized products are a separate prize path
  ([hackathon resources](https://thegraph.com/blog/hackathon-resources/)).

## OneShot decision

The production/demo recovery path is:

```text
live OneShot/Arc Subgraph
        ↓
Subgraph MCP
        ↓
LLM Recovery Agent
        ↓
WAIT / RECONCILE / ESCALATE / RETURN_EXISTING_RESULT
        ↓
deterministic OneShot safety core
```

The LLM recommendation is meaningful but advisory. The deterministic core
rechecks the durable state version and authoritative Arc/OneShot evidence.
Neither The Graph, Subgraph MCP, nor the LLM can sign, submit, retry, create an
Attempt, acquire submission ownership, or call `SettlementPort`.

## Qualification consequence

The Graph remains `NOT VERIFIED` until a sanitized demo trace proves all of:

1. the intended live OneShot/Arc deployment was queried (via direct GraphQL as
   minimal baseline path or Subgraph MCP as optional adapter);
2. the returned live indexed evidence and `_meta` health reached the LLM;
3. the LLM selected one of the four frozen recommendations using referenced evidence;
4. the deterministic core independently accepted, constrained, or rejected it;
5. empty, delayed, malformed, injected, unavailable, or contradictory tool data
   and invalid model output never create settlement permission.

One live Subgraph is sufficient for this AI-track claim. OneShot must not claim
the separate composable/multiple-products track without separate evidence.
