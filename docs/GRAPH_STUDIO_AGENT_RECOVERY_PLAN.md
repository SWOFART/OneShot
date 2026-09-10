# Graph Studio Agent Recovery Plan

Status: proposed fix plan; implementation not started

## Decision

Use the live Arc Testnet Subgraph Studio GraphQL endpoint as the active recovery
data source. Normalize and validate that response before passing a bounded
evidence summary to the Vertex AI recovery agent. Keep the official Subgraph MCP
adapter inactive until the Arc deployment is queryable through The Graph Network
Gateway.

This remains eligible for the ETHOnline 2026 **Best AI Tooling or AI Use Case
with The Graph** track. Its qualification requirements explicitly accept live
Subgraph queries using an API key from Subgraph Studio; MCP is one allowed
product, not a mandatory transport.

The Studio endpoint is rate-limited and documented for development, staging, and
testing. It is suitable for the hackathon demo, not a production availability
claim.

## Target flow

```text
Arc Testnet USDC events
  -> OneShot Subgraph in Subgraph Studio
  -> authenticated, pinned GraphQL query
  -> strict response and _meta validation
  -> normalized recovery evidence
  -> bounded Vertex AI context
  -> WAIT | RECONCILE | ESCALATE | RETURN_EXISTING_RESULT
  -> deterministic OneShot safety core
  -> authoritative Arc RPC receipt verification
```

The Graph and the model remain read-only observations. They cannot sign, submit,
retry a payment, create an Attempt, or grant settlement permission.

## Current evidence and blockers

- Arc Testnet `eip155:5042002` is listed by The Graph as a supported network.
- The pinned Studio deployment is synchronized and direct GraphQL returns real
  Arc USDC transfers.
- The Network Gateway returns `subgraph not found` for this deployment. The
  hosted Subgraph MCP queries The Graph Network, so it cannot query this
  Studio-only deployment today.
- PR #65 added the direct Studio query path and dynamic Arc head lookup.
- PR #66 adds safe same-version reconciliation retries after a delivered job;
  it has been human-merged into `develop` at `c1c720a128f9f76aff1f5e2b715684c24f4c47d4`.
- The public API route `/reconcile` returning HTTP 500 was root-caused to Fastify
  throwing `FST_ERR_CTP_EMPTY_JSON_BODY` when clients send `Content-Type: application/json`
  with an empty body; requests without empty JSON body return 202 `queued: true`.
- Fresh recovery evidence has not yet replaced the old Graph `UNAVAILABLE` and
  Vertex HTTP 403 records. Verify actual outbox consumption before judging the
  IAM change.
- The Cloud Run worker has always-allocated CPU confirmed (`run.googleapis.com/cpu-throttling: false`,
  `minScale: 1`).
- Direct Studio observations are currently labeled with MCP server/tool fields.
  That metadata and all sponsor wording must truthfully identify `STUDIO_GRAPHQL`.

## Implementation tasks

### 1. Land the retry prerequisite

1. Human merged PR #66 into `develop` (`c1c720a128f9f76aff1f5e2b715684c24f4c47d4`).
2. Pull the resulting `develop` commit and create the implementation branch from
   that exact base.
3. Preserve `ONESHOT_SUBMISSIONS_DISABLED=true` for every live recovery check.

### 2. Make the source identity truthful

1. Add a provider-neutral transport/source discriminator to recovery evidence,
   with `STUDIO_GRAPHQL` and `SUBGRAPH_MCP` as explicit values.
2. Direct queries must record the pinned Studio URL identity, deployment ID,
   manifest CID, query digest, retrieval time, `_meta` health, Arc head, lag, and
   candidate count without recording the API key.
3. Do not emit `server_name=subgraph-mcp` or
   `tool_name=execute_query_by_deployment_id` for direct GraphQL results.
4. Keep the existing MCP adapter and tests as an optional fail-closed adapter;
   do not call it in the Arc Testnet production/demo profile.

### 3. Pass validated Graph evidence to the agent

1. Query the pinned Studio deployment with the API key stored only in Secret
   Manager.
2. Validate response size, schema, deployment identity, `_meta`, freshness,
   block bounds, addresses, integer amount, transaction hash, and candidate
   cardinality before model use.
3. Pass only the normalized evidence summary to Vertex AI. Do not pass raw
   GraphQL text, credentials, arbitrary entity fields, or chain of thought.
4. Require the model to return the existing four-action structured contract and
   evidence references.
5. Preserve `settlementPermission: NEVER`; only the deterministic safety core
   may request authoritative Arc receipt/log verification and a version-checked
   state transition.

### 4. Repair live execution

1. Reproduce the API `/reconcile` HTTP 500 with a fixed correlation ID and add
   sanitized server-side error logging. Fix the shared root cause, not the route
   symptom.
2. Prove the first eligible request returns 202 and an immediate duplicate
   pending request returns 409.
3. Inspect the outbox row lifecycle (`PENDING` -> locked -> `DELIVERED`) without
   manually changing intent authority.
4. Configure the Cloud Run worker with always-allocated CPU if background
   polling is currently throttled, then prove it consumes reconciliation work
   without an HTTP request keeping the instance active.
5. Re-run Vertex after confirming the worker service account and region/model
   permissions. Require a new decision timestamp; stale HTTP 403 evidence is not
   proof of the current configuration.

### 5. Correct qualification and product documentation

1. Update `.agent/SPONSOR_REQUIREMENTS.md` to match the official ETHOnline 2026
   requirement: live Graph-provider data is mandatory; MCP is optional.
2. Update `plan.md`, `plan_missing_parts.md`, architecture diagrams, runbooks,
   UI labels, and qualification reports to show the active Studio GraphQL path.
3. Remove or downgrade every unsupported claim that the Arc recovery ran through
   official Subgraph MCP.
4. Claim The Graph qualification only after a fresh live trace proves Studio
   data materially affected the model decision and the deterministic core
   disposition.
5. State the Studio rate-limit/testing limitation and keep production Network or
   self-hosted Graph Node migration as future work.

### 6. Validate failures and invariants

Add the smallest tests that prove:

- direct Studio success, empty result, stale `_meta`, wrong deployment, malformed
  response, oversized response, timeout, and multiple candidates;
- prompt context contains normalized evidence and never the API key;
- invalid or injected Graph/model data holds `UNKNOWN`;
- concurrent reconciliation requests leave at most one pending manual job;
- no recovery case calls the settlement port or changes the wallet nonce.

Run repository format, lint, typecheck, full tests, generated-contract checks,
fixture validation, demo E2E, and the PostgreSQL integration suites.

## Live acceptance gate

With submissions disabled:

1. Studio returns fresh `_meta` plus bounded real candidates from the pinned Arc
   deployment.
2. The persisted observation identifies `STUDIO_GRAPHQL`, not MCP.
3. Vertex produces a fresh valid four-action decision referencing the Graph
   evidence.
4. The deterministic core independently holds UNKNOWN or verifies an existing
   Arc receipt; ambiguous candidates must hold UNKNOWN.
5. The wallet nonce is identical before and after the drill.
6. The worker consumes the outbox job without health-check traffic.
7. Sanitized evidence contains no credential or personal data.

## Review and release gates

1. Implement in one narrow branch after PR #66 is human-merged.
2. Run local validation and stage only intended files.
3. Run mandatory FreePi Gate A on the immutable candidate tree.
4. Commit, push, and open a draft PR.
5. Require all CI checks, including PostgreSQL integration, on the exact head.
6. Run fresh FreePi Gate B on that head and identical Gate A tree.
7. Mark ready for human review; never agent-merge.
8. Deploy the reviewed image, run the live acceptance gate, scale the worker back
   to its normal minimum, and delete the temporary diagnostic Cloud Run job.

## Primary sources

- ETHOnline 2026 The Graph prize requirements:
  <https://ethglobal.com/events/ethonline2026/prizes/the-graph>
- The Graph hackathon resources:
  <https://thegraph.com/blog/hackathon-resources/>
- Arc Testnet network entry:
  <https://thegraph.com/docs/en/supported-networks/arc-testnet/>
- Studio querying lifecycle:
  <https://thegraph.com/docs/en/subgraphs/querying/from-an-application/>
- Subgraph MCP scope:
  <https://thegraph.com/docs/en/subgraphs/subgraph-mcp/introduction/>
