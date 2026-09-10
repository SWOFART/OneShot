# Session Context: Graph Studio agent context

## Date/time

- UTC: 2026-09-10T16:16:46Z

## User goal

Replace the unavailable Arc Testnet Subgraph MCP path with qualifying direct
Subgraph Studio queries, pass validated data to the recovery agent, and leave an
exact implementation plan for the next context window.

## Original prompt/request

Determine whether Arc Testnet's Studio-only support means official Subgraph MCP
cannot work, whether direct Studio queries still satisfy The Graph requirements,
and, if so, create a new-branch fix plan before context ends.

## Assumptions

- Target prize is ETHOnline 2026 Best AI Tooling or AI Use Case with The Graph.
- Subgraph Studio is acceptable for the hackathon demo but is not presented as a
  production-grade decentralized Network endpoint.
- Live checks keep settlement submissions disabled.

## Plan

1. Follow `docs/GRAPH_STUDIO_AGENT_RECOVERY_PLAN.md` after PR #66 is human-merged.
2. Identify direct Studio observations truthfully, pass only validated normalized
   evidence to Vertex, and preserve the deterministic safety boundary.
3. Repair API/outbox/Cloud Run background execution, capture a fresh live trace,
   correct sponsor docs, and complete Gate A/CI/Gate B.

## Key decisions

- Official ETHOnline requirements explicitly accept live Subgraph queries with
  an API key from Subgraph Studio. MCP is optional for the selected AI track.
- Hosted Subgraph MCP queries deployments on The Graph Network. The current Arc
  deployment is available in Studio but returns `subgraph not found` through the
  Network Gateway, so MCP stays inactive for Arc Testnet.
- The active flow is Studio GraphQL -> validated normalized evidence -> Vertex
  context -> deterministic core -> Arc receipt verification.
- Direct GraphQL results must not be labeled or claimed as MCP results.

## Files/components touched

- `docs/GRAPH_STUDIO_AGENT_RECOVERY_PLAN.md`: proposed implementation and gate plan.
- `.agent/context/20260910T161646Z-graph-studio-agent-context.md`: durable handoff.

## Commands/checks

- Official ETHOnline prize page review - PASS; Studio API-key queries explicitly
  meet the live-provider requirement.
- The Graph supported-network page - PASS; Arc Testnet is listed as
  `eip155:5042002`.
- Direct Studio GraphQL - previously PASS with fresh `_meta` and real transfers.
- Network Gateway query - previously FAIL with `subgraph not found`.
- PR #66 CI and Gate A/B - PASS on head `206ad437da5fb3a059ea21723d2de8f27da907b7`;
  human-merged into `develop` at `c1c720a128f9f76aff1f5e2b715684c24f4c47d4`.
- Cloud Build `9418b788-88aa-40b2-87ab-1ff47864017b` - PASS for the exact PR #66 API image.
- API revision `oneshot-api-00006-2cf` - health PASS after explicitly preserving
  the pre-existing wildcard-auth behavior.
- API POST `/reconcile` - root cause resolved: Fastify throws `FST_ERR_CTP_EMPTY_JSON_BODY`
  when requests supply `Content-Type: application/json` with an empty string body;
  calling without empty JSON body returns 202 `queued: true`.
- Direct exact-image ledger diagnostic - PASS; both stale UNKNOWN intents queued
  a retry.
- Worker health/readiness - PASS; submissions disabled; wallet nonce `0x9`.
- Cloud Run worker background CPU - PASS; `run.googleapis.com/cpu-throttling: false`
  and `minScale: 1` confirmed active on service.
- Persisted recovery view - still stale, showing prior Graph unavailable and
  Vertex HTTP 403; fresh job consumption not yet proven.

## External-doc findings

- ETHGlobal qualification says an agent may use Subgraphs, Subgraph MCP, or
  Substreams and explicitly gives Studio API-key queries as qualifying live data:
  <https://ethglobal.com/events/ethonline2026/prizes/the-graph>.
- The Graph documents Studio endpoints as testing/staging and rate-limited:
  <https://thegraph.com/docs/en/subgraphs/querying/from-an-application/>.
- Subgraph MCP is documented for Subgraphs on The Graph Network:
  <https://thegraph.com/docs/en/subgraphs/subgraph-mcp/introduction/>.
- Arc Testnet is listed at
  <https://thegraph.com/docs/en/supported-networks/arc-testnet/>.

## Resolved questions

- API 500 root cause: Fastify error handler falls through to 500 on `FST_ERR_CTP_EMPTY_JSON_BODY`
  when clients send empty body with `Content-Type: application/json`.
- Cloud Run CPU throttling: Service has `cpu-throttling: false` and `minScale: 1` explicitly set.

## Git and PR state

- Branch: `plan/graph-studio-agent-context`
- Base: `origin/develop` at `c1c720a128f9f76aff1f5e2b715684c24f4c47d4` (incorporates PR #66)
- Commit: uncommitted plan files
- PR: not created for this plan branch; prerequisite PR #66 is merged

## Review gates

- Gate A: NOT RUN for this plan branch. PR #66 Gate A passed independently.
- Gate B: NOT RUN for this plan branch. PR #66 Gate B passed independently.

## Handoff/next steps

1. Commit this plan on `plan/graph-studio-agent-context` and push to origin.
2. Create implementation branch (e.g. `feat/graph-studio-agent-recovery`) from merged `develop` (`c1c720a`).
3. Implement truthful Studio source metadata (`STUDIO_GRAPHQL` vs `SUBGRAPH_MCP`) and bounded agent context.
4. Run the live acceptance gate with nonce unchanged, then update qualification
   docs and complete mandatory Gate A/CI/Gate B.
