# A02 — Durable Intent Ledger and API

Owner: Coder A
Effort: M — roughly one focused week
Branch: `milestone/a02-durable-intents`
Depends on: A01 only
Next: A03 immediately after closure

## Outcome

PostgreSQL becomes authoritative for Business Intents, Attempts, Settlement identity, evidence, and transactional work. Create/replay/conflict/status behavior is complete without real adapters.

## Small tasks

### A02.1 — Schema and migration safety

- Add intent, attempt, settlement, evidence, outbox/job, and schema-version tables.
- Enforce unique intent identity, immutable payload fingerprint, one settlement row per intent, and unique transaction hash when present.
- Test empty bootstrap, forward migration, transactional failure, and safe rollback/disable notes.

### A02.2 — Canonical fingerprint

- Validate and normalize recipient, atomic amount, asset, network, and purpose before hashing.
- Add golden vectors and ordering/Unicode/address-case tests.
- Reject negative, signed, decimal, exponent, padded, overflow-policy, and malformed amounts.

### A02.3 — Create, replay, and conflict

- Implement atomic insert-or-replay behavior.
- Enqueue initial work transactionally only for a new valid intent.
- Return `202`, `200`, or `409` with stable sanitized bodies.

### A02.4 — Query seams

- Implement intent status and recovery-view local-authority projection.
- Preserve append-only attempts and evidence order.
- Add pagination/bounds where collections can grow.

### A02.5 — Boundary controls

- Add service authentication interface, request-size limit, schema validation, rate-limit seam, correlation ID handling, and sanitized errors.
- Keep provider material out of API responses and logs.

## Acceptance evidence

- Real PostgreSQL tests prove identical replay creates one intent and one queued execution.
- Conflicting payload returns `409` and creates no extra job, attempt, settlement row, or submission right.
- State survives API restart and concurrent duplicate POSTs.
- Constraint failures are mapped to stable errors without leaking SQL or payloads.
- Public API contract matches A01 OpenAPI and fixture digests.

## Handoff artifact

Publish migration set, `storage-v1` schema digest, API contract tests, synthetic database fixtures, and a containerized test command.

## No-wait continuation

Start A03 with the settlement simulator. Real B output and C recovery code are not required.

## Non-goals

No external wallet call, Arc transaction, Graph query, or frontend.
