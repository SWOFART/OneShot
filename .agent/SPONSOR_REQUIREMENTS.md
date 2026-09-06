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
- Do not target Composable/Standardized with one custom Subgraph; that track
  requires two Graph products or meaningful standardized-schema work.
- Empty, delayed, multiple, or contradictory candidates preserve `UNKNOWN` and
  cannot unlock another settlement.
- Include a public repository, clear README, and a two-to-four-minute demo.

## Claim standard

Do not state or imply sponsor qualification unless working code and live demo
evidence prove every selected track requirement. Plans, placeholders, mocks,
environment variables, dependencies, and network labels are not evidence.

Use the `sponsor-qualification` skill to report each selected sponsor as
`QUALIFIED`, `NOT QUALIFIED`, or `NOT VERIFIED`, with code, test, demo, network,
and limitation evidence.
