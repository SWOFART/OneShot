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
- Arc: prove a real USDC settlement on Arc Testnet. Mainnet readiness is not
  deployment proof for the conditional award; require actual authorized
  deployment evidence before claiming it, without inventing network values.
- The Graph: prove a pinned live OneShot/Arc Subgraph is queried through the
  active Studio GraphQL path or supported Subgraph MCP transport and that the
  LLM Recovery Agent materially uses the result for recovery/incident triage
  beyond direct known-hash lookup. A routine evidence panel alone is insufficient.
- Bind a sanitized live Graph trace to deployment/query/result, `_meta` health,
  evidence references, one of `WAIT`, `RECONCILE`, `ESCALATE`, or
  `RETURN_EXISTING_RESULT`, and the deterministic-core disposition. Live Studio
  GraphQL is eligible; mocks, dependencies, configuration and prompt text alone
  are insufficient. Do not claim MCP when Studio GraphQL is the active transport.
- Arc verifies candidates and OneShot decides. Empty, stale, malformed/injected,
  multiple, or contradictory Graph results and invalid model output cannot unlock
  another settlement. Graph/model code exposes no settlement or retry capability.
- Do not require multiple Subgraphs for the selected AI track or award the
  separate Composable/Standardized claim without its own proof.
- Verify the demo preserves `1 intent / N attempts / <=1 settlement` and never
  exposes secrets.

For each selected sponsor, report `QUALIFIED`, `NOT QUALIFIED`, or
`NOT VERIFIED`, citing code, tests, live demo evidence, network, and known
limitations. Never upgrade missing or mocked evidence into qualification.
