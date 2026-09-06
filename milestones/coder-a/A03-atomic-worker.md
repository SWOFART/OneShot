# A03 — Atomic At-Most-Once Worker

Owner: Coder A
Branch: `milestone/a03-atomic-worker`
Depends on: A02 only
Next: A04 immediately after closure

## Outcome

Duplicate delivery and concurrent workers converge on exactly one submission owner. Every simulator result is durably classified before task completion, and uncertainty can never cause a blind retry.

## Small tasks

### A03.1 — Transactional work delivery

- Integrate Graphile Worker with the same PostgreSQL database and transactional enqueueing.
- Configure `submit_settlement` for one queue attempt.
- Treat queue job keys as scheduling hygiene, not the duplicate lock.

### A03.2 — Submission ownership CAS

- Implement `AUTHORIZING -> READY -> SUBMITTING` compare-and-set transitions with monotonic version.
- Persist request fingerprint and provider identities before calling the port.
- Ensure database transactions end before network/simulator calls.

### A03.3 — Result persistence

- Map `CONFIRMED`, `DEFINITELY_NOT_SUBMITTED`, and `POSSIBLY_SUBMITTED` exhaustively.
- Persist `COMMITTED`, `FAILED_SAFE`, or `UNKNOWN` before returning from the task.
- Reject unexpected/partial adapter results as `UNKNOWN`.

### A03.4 — Concurrency proof

- Test one job, ten sequential deliveries, ten parallel workers, and two worker processes.
- Assert stable intent ID, append-only attempts, final durable state, external-submission count, and committed-settlement count.

### A03.5 — External-boundary failure points

- Kill before submission: zero call and safe continuation.
- Kill after persisted `SUBMITTING` and before/after simulator response: `UNKNOWN`, no new submission.
- Fail downstream work after commit: retain original settlement permanently.

## Acceptance evidence

- All required A-owned rows from `.agent/TEST_MATRIX.md` pass against real PostgreSQL and deterministic simulator counter.
- Ten parallel workers and two processes result in at most one external call/commit.
- No exception path leaves a possibly submitted intent retryable.
- Redelivery is idempotent after every durable transition.

## Handoff artifact

Publish worker contract tests, concurrency runner, failure-point catalog, database-state snapshots, and concise result table.

## No-wait continuation

Start A04 using B/C simulators. A project gate will later repeat these proofs with reviewed real adapters.

## Non-goals

No real Privy/settlement-rail call, external-index lookup, automatic replacement, or UI.
