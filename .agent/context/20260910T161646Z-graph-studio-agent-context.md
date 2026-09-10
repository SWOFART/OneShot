# Session Context: Graph Studio agent context

## Date/time

- UTC: 2026-09-10T16:16:46Z

## User goal

Implement the Graph Studio recovery plan: use truthful direct Studio GraphQL
transport for Arc Testnet, pass validated data to the recovery agent, preserve
the deterministic safety boundary, and keep optional MCP metadata truthful.

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

- `docs/GRAPH_STUDIO_AGENT_RECOVERY_PLAN.md`: implementation plan and gate plan.
- `.agent/context/20260910T161646Z-graph-studio-agent-context.md`: durable context.
- Runtime, reconciliation, API, generated contracts, storage projection, UI,
  tests, runbooks, and qualification documents listed by the implementation
  plan were updated on the implementation branch.

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

## Implementation checks

- `@oneshot/contracts` generated-contract check - PASS.
- `@oneshot/reconciliation` build - PASS.
- Reconciliation, API, worker runtime-config, and web recovery tests - PASS
  after updating the worker test expectation for explicit source selection.
- Workspace typecheck - PASS.
- Full repository format/lint/test and demo E2E - PASS; browser acceptance 7/7
  - PASS; PostgreSQL integration suites ran with all 25 cases skipped because
  `TEST_POSTGRES` is not enabled; live acceptance remains pending.
- The branch was merged with current `origin/develop` at
  `dd79e71be187a86671fd127613732dd99f0e1529` (PR #67) before final validation.

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

- Branch: `plan/graph-studio-agent-recovery`
- Base lineage: remote plan branch includes `develop` at
  `c1c720a128f9f76aff1f5e2b715684c24f4c47d4` (incorporates PR #66)
- Commit: uncommitted implementation and documentation changes
- PR: not created for this plan branch; prerequisite PR #66 is merged

## Review gates

- Gate A: NOT RUN for this implementation tree. PR #66 Gate A passed independently.
- Gate B: NOT RUN for this implementation tree. PR #66 Gate B passed independently.

## Handoff/next steps

1. Run the remaining repository checks and inspect the exact candidate tree.
2. Run Gate A, then commit/push and open a draft PR only when authorized by the
   implementation workflow.
3. Require CI and Gate B on the identical head before human review.
4. Run the live acceptance gate with nonce unchanged before any qualification
   claim; keep the Graph verdict `NOT VERIFIED` until that trace exists.
