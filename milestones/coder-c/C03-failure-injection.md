# C03 — Cross-Source Failure Injection

Owner: Coder C
Branch: `milestone/c03-failure-injection`
Depends on: C02 only
Next: C04 immediately after closure

## Outcome

A deterministic chaos harness proves that crashes, lost responses, duplicate/out-of-order evidence, Graph degradation, and provider/RPC contradictions cannot turn uncertainty into settlement permission.

## Small tasks

### C03.1 — Failure timeline DSL

- Define injection points: definitely before submission, possibly submitted, and definitely confirmed.
- Model process kill, timeout, disconnect, response loss, delayed evidence, and restart between durable transitions.
- Make each scenario deterministic and seed-recorded.

### C03.2 — Graph degradation suite

- Delay/empty results, trail chain head, set indexing errors, omit `_meta`, fail query, return duplicates/out-of-order events, and switch deployment identity.
- Assert health labels and no permission change.

### C03.3 — Provider/RPC contradiction suite

- Combine provider pending/success/not-found/unavailable with Arc pending/success/revert/mismatch/unavailable.
- Bind evidence to intent/request/transaction and hold on mismatch.

### C03.4 — Restart/evidence replay

- Persist synthetic evidence feed, restart the harness, replay/reorder it, and compare decisions.
- Prove semantic idempotency and stable audit chronology.

### C03.5 — UNKNOWN aging and escalation

- Add configurable age buckets, alerts, operator context, and escalation outcomes.
- Ensure runbook language never instructs “just retry” or treats lease expiry as permission.

## Acceptance evidence

- Every `.agent/TEST_MATRIX.md` case involving ambiguity/evidence has a deterministic scenario.
- Crash/lost response after possible submission remains `UNKNOWN` until authoritative resolution.
- Empty, delayed, unhealthy, contradictory, or unavailable sources never unlock payment.
- Repeated/reordered evidence causes zero settlement calls and stable commands.
- Harness runs with no network or credentials.

## Handoff artifact

Publish failure DSL/schema, scenario catalog, one-command matrix runner, deterministic seeds, result table, and escalation runbook draft.

## No-wait continuation

Start C04 using A/B simulators. Integrated process kills and live evidence are added at Gate P4.

## Non-goals

No destructive live-funds testing, automatic remediation, provider mutation, or UI.
