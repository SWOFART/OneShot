# Subgraph MCP Gate P4 Checklist

## Target identity

- [ ] Pin the reviewed Subgraph deployment ID and manifest CID.
- [ ] Require the configured MCP server name and version.
- [ ] Require tool `execute_query_by_deployment_id`.
- [ ] Require query identity `OneShotRecoveryCandidatesV1` and its frozen digest.
- [ ] Reject any tool, deployment, manifest, query, or variable mismatch.

## Live data and freshness

- [ ] Use a live Graph provider; local and static fixtures remain labelled simulator evidence.
- [ ] Require `_meta.deployment`, indexed block number/hash, timestamp, and indexing-error state.
- [ ] Observe the Arc chain head independently.
- [ ] Start with `maxLagBlocks: 5`; a larger production threshold requires a reviewed change.
- [ ] Treat missing freshness, lag, indexing errors, timeout, empty results, and multiple candidates as a hold or escalation.

## Data boundary

- [ ] Limit candidates to 25, GraphQL result text to 128 KiB, and the MCP envelope to 160 KiB.
- [ ] Bind network, sender, token, recipient, amount, and block window before exposing a candidate.
- [ ] Persist MCP call identity, retrieval time, freshness, evidence references, and digest.
- [ ] Never persist raw MCP/provider bodies, headers, Graph API keys, or injected instructions.
- [ ] Verify every discovered transaction through authoritative Arc evidence before committing.

## Degradation and disable

- [ ] Run wrong-tool, wrong-deployment, malformed, oversized, injected, delayed, empty, duplicate, and out-of-order fixtures.
- [ ] Keep direct known-hash recovery runnable with Subgraph MCP disabled.
- [ ] Keep hashless intents `UNKNOWN` when the index path is disabled or inconclusive.
- [ ] Confirm the recovery path has no settlement submission capability.
