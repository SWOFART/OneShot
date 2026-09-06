# C01 — Recovery Evidence Strategy

Owner: Coder C
Branch: `milestone/c01-recovery-evidence-strategy`
Depends on: frozen `milestones/CONTRACTS.md` only
Next: C02 immediately after closure

## Outcome

A provider-neutral recovery evidence contract proves the known-identity
Privy/Arc baseline and validates The Graph as the selected hashless
candidate-discovery layer. Arc remains authoritative; a failed live Graph value
gate removes the Graph claim and selects the direct-recovery fallback.

## Small tasks

### C01.1 — Required evidence baseline

- Model persisted OneShot identity, Privy request lookup, exact selected-rail
  transaction/receipt evidence, observed position, finality, retrieval time,
  and evidence binding.
- Keep all payment authority outside the Graph candidate view.

### C01.2 — Indexer removal/value test

- Compare The Graph with no-index, direct Arc event search, and enhanced RPC by
  lost-hash discovery, freshness, testnet/mainnet support,
  operational dependency, reuse, and sponsor leverage.
- Retain The Graph only if removing it breaks automatic hashless recovery or a
  named recovery-agent decision instead of merely removing a dashboard query.

### C01.3 — Graph candidate and correlation contract

- Define Graph observations, provider/deployment identity, observed-through
  block/time, lag, health, retrieval time, candidate count, and contradiction.
- Model tuple/window lookup and the preferred Arc Memo `memoId` correlation;
  distinguish empty or multiple candidates from authoritative non-payment.

### C01.4 — Fixtures and simulator

- Cover fresh, empty, lagging, unhealthy, unavailable, duplicate, out-of-order,
  and contradictory results without selecting a vendor in domain code.
- Add provider-specific mapping tests only after the decision record selects an
  implementation.

## Acceptance evidence

- Known-identity recovery remains safe with The Graph disabled; automatic
  hashless discovery is explicitly unavailable in that fallback.
- No Graph result grants settlement permission.
- Live evidence shows whether The Graph finds the lost-hash candidate, how
  freshness and multiple matches behave, and what capability removal loses.
- All fixtures run without network access or credentials.

## Handoff artifact

Publish `index-view-v1`, the baseline recovery evidence schema, removal/value
matrix, decision record, simulator fixtures, and package-local checks.

## No-wait continuation

Start C02 with the provider-neutral evidence contract and recorded decision.

## Non-goals

No settlement submission, database authority, mandatory third-party indexer,
sponsor claim, or production UI.