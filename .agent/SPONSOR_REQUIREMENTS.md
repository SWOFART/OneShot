# Sponsor Requirements

Use this document before sponsor-facing implementation, demo preparation,
release, or submission claims.

## Primary target: Privy

- Privy must be core corporate wallet authorization, not login-only branding.
- The working path must demonstrate a Privy wallet plus scoped authorization,
  policies, signers, quorum, or spending permissions that constrain settlement.
- Policy denial or an amount above policy must produce zero settlement.
- The normal agent path must not bypass Privy authorization.

## Primary target: Arc

- The demo must execute a real USDC settlement on Arc Testnet.
- Showing a network label, wallet, explorer page, or mocked payment alone does
  not qualify.
- The product must have a working frontend, backend, architecture diagram,
  public source, documentation, and short demonstration.
- OneShot must retain settlement identity and result through retries and
  downstream failures.
- For the Launch track, include a disabled Arc Mainnet profile, deployment and
  rollback artifacts, and readiness evidence. Actual mainnet execution remains
  disabled until Circle publishes official production access/identities and a
  human explicitly authorizes real-value activation.

## Selected target: The Graph AI Tooling or AI Use Case

The Graph is load-bearing for automatic recovery when a successful submission
lost its transaction hash. It discovers candidates; Arc verifies them; OneShot
decides. C01 must prove this with live data before any qualification claim.

- Target the AI Tooling or AI Use Case track. The recovery agent must use live
  Graph data for meaningful candidate selection, explanation, and automation.
- The production/demo path must query the pinned live OneShot/Arc Subgraph
  through a Graph provider. For the ETHOnline 2026 AI track, a live API-key
  query from Subgraph Studio qualifies; Subgraph MCP is an optional transport
  and must not be claimed when the active Arc deployment is Studio-only.
- The LLM Recovery Agent must use the live Graph result to select `WAIT`,
  `RECONCILE`, `ESCALATE`, or `RETURN_EXISTING_RESULT`. A sanitized trace must
  bind the tool call, deployment/query/result, `_meta` health, referenced
  evidence, model recommendation, and deterministic-core disposition.
- Do not target Composable/Standardized with one custom Subgraph; that track
  requires two Graph products or meaningful standardized-schema work.
- One live Subgraph is sufficient for the selected AI track; do not add a second
  Subgraph merely to satisfy a requirement that belongs to another track.
- Empty, delayed, multiple, or contradictory candidates preserve `UNKNOWN` and
  cannot unlock another settlement.
- Malformed/injected Graph content and invalid model output also preserve
  `UNKNOWN`. Graph transports and the LLM have no signing, settlement, retry,
  Attempt-creation, or submission-ownership capability.
- Include a public repository, clear README, and a two-to-four-minute demo.

## Claim standard

Do not state or imply sponsor qualification unless working code and live demo
evidence prove every selected track requirement. Plans, placeholders, mocks,
environment variables, dependencies, and network labels are not evidence.

Use the `sponsor-qualification` skill to report each selected sponsor as
`QUALIFIED`, `NOT QUALIFIED`, or `NOT VERIFIED`, with code, test, demo, network,
and limitation evidence.
