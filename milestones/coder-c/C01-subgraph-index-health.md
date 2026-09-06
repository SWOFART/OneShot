# C01 — Subgraph Mapping and Index Health

Owner: Coder C
Effort: M — roughly one focused week
Branch: `milestone/c01-subgraph-index-health`
Depends on: frozen `milestones/CONTRACTS.md` only
Next: C02 immediately after closure

## Outcome

A standalone Subgraph maps Arc USDC Transfer fixtures, and a Graph client returns freshness-labeled observations including `_meta`, deployment, lag, and indexing health.

## Small tasks

### C01.1 — Subgraph schema

- Define transfer entity identity as transaction hash plus log index.
- Store sender, recipient, Graph `BigInt` amount, transaction hash, log index, block number, and block timestamp.
- Document public/sanitized fields and immutable IDs.

### C01.2 — Manifest and mapping

- Target Arc Testnet and the exact ERC-20 USDC Transfer event.
- Map duplicate/out-of-order fixture events deterministically.
- Reject assumptions that one transaction has only one log.

### C01.3 — Mapping tests

- Add Matchstick/unit fixtures for normal, multiple-log, duplicate delivery, wrong contract/topic, zero/large amount, and ordering behavior.
- Assert exact decimal-string/BigInt preservation.

### C01.4 — Graph query client

- Query transfers plus `_meta` block, deployment identity, timestamp, and `hasIndexingErrors`.
- Compare indexed block with chain head supplied through an injectable seam.
- Validate all untrusted GraphQL output.

### C01.5 — Freshness classifier

- Emit `FRESH`, `LAGGING`, `UNHEALTHY`, `UNAVAILABLE`, or `UNKNOWN_FRESHNESS` with observed-through bounds.
- Make empty data distinct from authoritative non-payment.
- Add simulator fixtures for every health/result combination.

## Acceptance evidence

- Subgraph tests run without network or credentials.
- Identity remains transaction hash plus log index and amount never becomes a JS float.
- Missing `_meta`, indexing errors, head-query failure, or excessive lag is visibly non-fresh.
- Empty result says only “not observed through block N” and grants no permission.

## Handoff artifact

Publish `index-view-v1`, schema/manifest digest, mapping fixture pack, Graph query schema, freshness simulator, and package-local commands.

## No-wait continuation

Start C02 with synthetic local/Privy/Arc evidence. A/B packages and live deployment are not required.

## Non-goals

No durable state authority, settlement submission, provider wallet operation, or UI.
