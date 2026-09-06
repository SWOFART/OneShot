# C06 — The Graph, Recovery, and Qualification Bundle

Owner: Coder C
Forecast: 2 working days
Branch: `milestone/c06-qualification-demo`
Depends on: C05 only
Project convergence: Gate P6

## Outcome

A repeatable recovery demo proves live indexed Arc observations add useful history/recovery context while degraded Graph states remain non-authoritative, and it supplies evidence-based sponsor qualification inputs.

## Small tasks

### C06.1 — Live index health

- Query the pinned live Arc Testnet deployment with `_meta`, deployment ID, indexed block/time, chain head, lag, and indexing errors.
- Record sanitized endpoint/deployment evidence and freshness threshold.

### C06.2 — Recovery story

- Show one exact transaction in durable/Privy/Arc evidence and indexed history.
- Demonstrate `UNKNOWN` reconciliation to the original transaction with no new submission.

### C06.3 — Degraded index story

- Run delayed, empty, unhealthy, unavailable, missing `_meta`, and contradictory fixtures against the same recovery UI/engine.
- Show safe hold/escalation and accurate observed-through language.

### C06.4 — Audit and repeatability

- Verify evidence survives service restart, can be replayed, and contains no provider secret/raw credential data.
- Document reset steps that do not rewrite chain history or require database surgery.

### C06.5 — Sponsor qualification

- Run `sponsor-qualification` against actual code, tests, live demo, network, deployment, and known limitations.
- Report Privy, Arc, and The Graph individually as `QUALIFIED`, `NOT QUALIFIED`, or `NOT VERIFIED`.
- Never treat plans, mocks, variables, labels, or dependency declarations as proof.

## Acceptance evidence

- Live indexed data is demonstrably used for recovery/history or agent decision support.
- OneShot remains authoritative and Graph degradation never unlocks settlement.
- Demo is repeatable and evidence is sanitized.
- Qualification verdicts cite concrete code, test, and live evidence or honestly remain `NOT VERIFIED`.

## Handoff artifact

Publish Graph/recovery evidence index, live health snapshot, degraded-state matrix, demo steps, qualification report, and limitations.

## No-wait continuation

C06 closes independently. Gate P6 composes exact reviewed A06/B06/C06 bundles; any failed qualification returns to the owning implementation/evidence lane.

## Non-goals

No Graph authority claim, production SLA, mainnet evidence, external mutation by an agent, or agent-performed merge.
