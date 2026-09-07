---
name: sponsor-qualification
description: Validate selected sponsor integration evidence before OneShot demos, releases, submissions, or qualification claims.
---

# Sponsor Qualification

Read `.agent/SPONSOR_REQUIREMENTS.md`, `.agent/PROJECT_CONTEXT.md`, and relevant
code, tests, and demo instructions. Review working evidence, not plans.

## Mandatory checks

- Privy: prove corporate wallet authorization constrains the normal settlement
  path through scoped policy or spending permission. Login-only is insufficient.
- Arc: prove a real USDC settlement on Arc Testnet and, for the Launch track,
  fail-closed mainnet-readiness artifacts without inventing unavailable values.
- The Graph: prove a pinned live OneShot/Arc Subgraph is queried through
  Subgraph MCP and that the LLM Recovery Agent materially uses the result for
  hashless candidate selection/explanation beyond direct known-hash lookup.
- Bind a sanitized MCP trace to deployment/query/result, `_meta` health,
  evidence references, one of `WAIT`, `RECONCILE`, `ESCALATE`, or
  `RETURN_EXISTING_RESULT`, and the deterministic-core disposition. Direct
  GraphQL, mocks, dependencies, variables, and prompt text alone are insufficient.
- Arc verifies candidates and OneShot decides. Empty, stale, malformed/injected,
  multiple, or contradictory MCP results and invalid model output cannot unlock
  another settlement. MCP/model code exposes no settlement or retry capability.
- Do not require multiple Subgraphs for the selected AI track or award the
  separate Composable/Standardized claim without its own proof.
- Verify the demo preserves `1 intent / N attempts / <=1 settlement` and never
  exposes secrets.

For each selected sponsor, report `QUALIFIED`, `NOT QUALIFIED`, or
`NOT VERIFIED`, citing code, tests, live demo evidence, network, and known
limitations. Never upgrade missing or mocked evidence into qualification.
