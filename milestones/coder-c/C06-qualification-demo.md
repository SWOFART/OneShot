# C06 — Graph Discovery and Recovery Qualification Bundle

Owner: Coder C
Branch: `milestone/c06-qualification-demo`
Depends on: C05 only
Project convergence: Gate P6

## Outcome

A repeatable recovery demo proves an LLM Recovery Agent can use live OneShot/Arc
Subgraph data obtained through Subgraph MCP to discover/select a candidate after
the transaction hash is lost, while Arc and the deterministic OneShot safety
core verify or safely hold `UNKNOWN` without a second payment.

## Small tasks

### C06.1 — Live recovery evidence

- Place the fault injector after Privy/Arc broadcast and before the adapter
  returns to OneShot. Swallow the successful response and transaction hash so
  the chain receives the real payment while the durable intent records only
  `UNKNOWN`; do not delete a hash that OneShot already persisted.
- Query the original Privy request; deliberately exercise the branch where no transaction hash is recovered.
- Through Subgraph MCP, query the pinned live OneShot/Arc deployment for
  candidates and record a sanitized tool trace with deployment, observed block,
  lag, health, and candidate count.
- Show the LLM materially using that tool result to emit one allowed recommendation with evidence references.
- Verify the selected candidate through exact Arc Testnet receipt/log evidence.

### C06.2 — Recovery story

- Show Subgraph MCP returning candidates, the LLM selecting/explaining them,
  Arc proving the exact transfer, and the deterministic core deciding the durable transition.
- Show the operator view before recovery with no transaction hash, then after
  recovery with the discovered hash, exact transfer evidence, and unchanged
  Business Intent identity.
- Demonstrate zero, stale, multiple, and contradictory candidates staying `UNKNOWN` with no new submission.

### C06.3 — Graph removal and degradation story

- Run recovery with The Graph disabled, then delayed, empty, unhealthy,
  unavailable, missing freshness metadata, malformed/injected MCP output,
  multiple/contradictory candidates, and invalid model output.
- Show safe hold/escalation and accurate observed-through language.

### C06.4 — Audit and repeatability

- Verify evidence survives service restart, can be replayed, and contains no provider secret/raw credential data.
- Document reset steps that do not rewrite chain history or require database surgery.

### C06.5 — Sponsor qualification

- Run `sponsor-qualification` against actual code, tests, live Subgraph MCP trace,
  meaningful LLM decision, deterministic safety proof, network, deployment, and limitations.
- Report Privy, Arc, and The Graph individually as `QUALIFIED`, `NOT QUALIFIED`, or `NOT VERIFIED`; target the Graph AI Tooling or AI Use Case track only.
- Never treat plans, mocks, variables, labels, or dependency declarations as proof.

## Acceptance evidence

- Live The Graph data obtained through Subgraph MCP demonstrably enables
  hashless discovery and meaningful LLM recovery automation beyond direct known-hash lookup.
- The agent exposes only four advisory actions, and the deterministic core independently enforces the final domain action.
- OneShot remains authoritative and Graph degradation never unlocks settlement.
- Demo is repeatable and evidence is sanitized.
- Qualification verdicts cite concrete code, test, and live evidence or honestly remain `NOT VERIFIED`.

## Handoff artifact

Publish recovery evidence index, sanitized Subgraph MCP tool trace, agent/core
decision trace, Graph deployment/health/value snapshot, degraded-state matrix,
demo steps, qualification report, and limitations.

## No-wait continuation

C06 closes independently. Gate P6 composes exact reviewed A06/B06/C06 bundles; any failed qualification returns to the owning implementation/evidence lane.

## Non-goals

No index authority claim, production SLA, real mainnet transaction, external mutation by an agent, or agent-performed merge.
