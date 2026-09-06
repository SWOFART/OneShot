# C02 — Deterministic Reconciliation Engine

Owner: Coder C
Branch: `milestone/c02-reconciliation-engine`
Depends on: C01 only
Next: C03 immediately after closure

## Outcome

A pure decision engine combines authoritative local/Arc evidence, provider lookup, and non-authoritative Graph observations to emit safe reconciliation commands and a provenance-labeled recovery view. It can never submit payment.

## Small tasks

### C02.1 — Evidence model

- Define source, authority class, request binding, retrieval time, block/finality/freshness, sanitized reason, and digest.
- Reject evidence that cannot bind to the exact intent/request/transaction identity.

### C02.2 — Precedence table

- Make durable committed record and exact verified Arc receipt authoritative.
- Use Privy status to locate provider activity and The Graph only to corroborate/explain.
- Encode contradictory, stale, missing, and unavailable combinations explicitly.

### C02.3 — Reconciliation commands

- Emit `MARK_COMMITTED`, `MARK_FAILED_SAFE`, `HOLD_UNKNOWN`, or `ESCALATE_UNKNOWN` with expected state version.
- Require exact verified success for commit and authoritative matching final failure/no-effect proof for failed-safe.
- Never emit a submit/retry command.

### C02.4 — Recovery view

- Separate authoritative state from provider/Arc/indexed observations.
- Include observed-through block/time, lag, health, and contradiction warnings.
- Sanitize raw payloads and bound collection sizes.

### C02.5 — Idempotency tests

- Repeat decisions, reorder/duplicate observations, change retrieval time, and replay webhooks/provider events.
- Prove deterministic semantic command and zero external submissions.

## Acceptance evidence

- Verified matching success resolves `UNKNOWN -> COMMITTED`.
- Matching final revert/no-effect proof may resolve `UNKNOWN -> FAILED_SAFE`.
- Pending, not found, unavailable, empty/lagging/unhealthy Graph, mismatch, or contradiction remains `UNKNOWN`.
- Every decision explains authority and provenance without leaking raw sensitive data.
- Package imports no A/B implementation and contains no SettlementPort call.

## Handoff artifact

Publish `reconciliation-v1`, complete decision matrix, command schema, evidence/recovery fixtures, pure simulator, and verification command.

## No-wait continuation

Start C03 using the local state and provider simulators from the frozen pack.

## Non-goals

No direct database mutation, queue ownership, settlement submission, live Graph requirement, or frontend.
