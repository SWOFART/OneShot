---
name: sponsor-qualification
description: Validate Privy, Arc, and The Graph integration evidence before OneShot demos, releases, submissions, sponsor checklists, or qualification claims.
---

# Sponsor Qualification

Read `.agent/SPONSOR_REQUIREMENTS.md`, `.agent/PROJECT_CONTEXT.md`, and relevant
code/tests/demo instructions. Review actual working evidence, not plans.

## Mandatory checks

- Privy: prove corporate wallet authorization constrains the normal settlement
  path through scoped policy or spending permission. Login-only is insufficient.
- Arc: prove the demo performs a real USDC settlement on the authorized testnet.
  A network label, address, explorer link, or mock alone is insufficient.
- The Graph: prove live indexed data supports recovery/history/agent decisions,
  while OneShot durable state remains authoritative and empty/indexing-delayed
  results cannot unlock another settlement.
- Verify the demo preserves `1 intent / N attempts / <=1 settlement` and never
  exposes secrets.

For each sponsor, report `QUALIFIED`, `NOT QUALIFIED`, or `NOT VERIFIED`, citing
code, tests, live demo evidence, network, and known limitations. Never upgrade
missing or mocked evidence into a qualification claim.
