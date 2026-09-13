# C01 — Recovery Evidence Strategy

Owner: Coder C
Branch: `milestone/c01-recovery-evidence-strategy`
Depends on: frozen `milestones/CONTRACTS.md` only
Next: C02 immediately after closure

## Outcome

A provider-neutral recovery evidence contract proves the known-identity
Privy/Arc baseline and validates a live OneShot/Arc Subgraph queried through
Subgraph MCP as the selected hashless candidate-discovery layer for an LLM
Recovery Agent. Arc remains authoritative; a failed live MCP/Graph value gate
removes the Graph claim and selects the direct-recovery fallback.

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
- Retain The Graph only if removing the live Graph-provider path breaks automatic
  hashless recovery or a named LLM recovery-agent decision instead of merely
  removing a dashboard query.

### C01.3 — Subgraph MCP candidate and correlation contract

- Pin the intended OneShot/Arc deployment and define MCP tool/query identity,
  Graph observations, provider/deployment identity, observed-through block/time,
  lag, health, retrieval time, candidate count, and contradiction.
- Model tuple/window lookup and the preferred Arc Memo `memoId` correlation;
  distinguish empty or multiple candidates from authoritative non-payment.
- Validate MCP arguments/results, `_meta`, schema, size bounds, and untrusted
  content; keep gateway/API credentials outside prompts, logs, and evidence.

### C01.4 — Fixtures and simulator

- Cover fresh, empty, lagging, unhealthy, unavailable, malformed/injected,
  duplicate, out-of-order, and contradictory results without selecting a vendor
  in domain code.
- Add provider-specific mapping tests only after the decision record selects an
  implementation.

### C01.5 — Live MCP and AI-value spike

- Query the intended live deployment through the approved Graph-provider path,
  not an unpinned direct
  application GraphQL client, and capture a sanitized tool trace.
- Feed the live candidate/freshness result to an LLM Recovery Agent and prove it
  materially affects candidate selection or explanation.
- Record `SELECT_SUBGRAPH_MCP` or `FALLBACK_DIRECT_RECOVERY`; the fallback keeps
  safety but makes The Graph qualification `NOT VERIFIED`.

## Acceptance evidence

- Known-identity recovery remains safe with The Graph disabled; automatic
  hashless discovery is explicitly unavailable in that fallback.
- No Graph result grants settlement permission.
- Live evidence shows whether Subgraph MCP finds the lost-hash candidate, how
  freshness and multiple matches behave, how the LLM uses the result, and what
  capability removal loses.
- All fixtures run without network access or credentials.

## Handoff artifact

Publish `index-view-v1`, the baseline recovery evidence schema, MCP tool/query
schema, removal/value matrix, sanitized live MCP/agent trace, decision record,
simulator fixtures, and package-local checks.

## No-wait continuation

Start C02 with the provider-neutral evidence contract and recorded decision.

## Non-goals

No settlement submission, database authority, MCP/LLM financial authority,
sponsor claim from mocked evidence, or production UI.
