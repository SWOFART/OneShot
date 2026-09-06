# Sponsor Requirements

Use this document before sponsor-facing implementation, demo preparation,
release, or submission claims.

## Privy

- Privy must be core corporate wallet authorization, not login-only branding.
- The working path must demonstrate scoped authorization, policies, or spending
  permissions that constrain settlement.
- Policy denial or an amount above policy must produce zero settlement.
- The normal agent path must not bypass Privy authorization.

## Arc

- The demo must execute a real USDC settlement on the authorized Arc testnet.
- Showing an Arc network label, wallet address, explorer page, or mocked payment
  alone does not qualify.
- OneShot must retain the settlement identity and result through retries and
  downstream failures.

## The Graph

- The integration must use live indexed data for recovery, history, or agent
  decision support.
- The demo should show how indexed evidence helps resolve or explain an
  ambiguous outcome.
- The Graph must never be the sole duplicate-payment lock, authoritative intent
  state, or proof that another settlement may be submitted.
- Empty results and indexing delay must preserve safe behavior.

## Claim standard

Do not state or imply sponsor qualification unless the integration exists in
working code and the demo proves the required behavior. Plans, placeholders,
mockups, environment variables, dependency declarations, and network labels are
not implementation evidence.

Use the `sponsor-qualification` skill to report each sponsor as `QUALIFIED`,
`NOT QUALIFIED`, or `NOT VERIFIED`, with code, test, and demo evidence.
