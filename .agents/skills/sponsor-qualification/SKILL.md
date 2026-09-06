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
- The Graph: prove live indexed data drives hashless candidate discovery and
  meaningful recovery-agent automation beyond direct known-hash lookup. Arc
  verifies candidates; empty, stale, multiple, or contradictory results cannot
  unlock another settlement.
- Verify the demo preserves `1 intent / N attempts / <=1 settlement` and never
  exposes secrets.

For each selected sponsor, report `QUALIFIED`, `NOT QUALIFIED`, or
`NOT VERIFIED`, citing code, tests, live demo evidence, network, and known
limitations. Never upgrade missing or mocked evidence into qualification.