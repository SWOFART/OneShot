# A06 — Operational Demo and Release Bundle

Owner: Coder A
Branch: `milestone/a06-release-operations`
Depends on: A05 only
Project convergence: Gate P6

## Outcome

The authoritative-state and operations portion of the demo is repeatable from a clean testnet environment, includes a disabled mainnet-ready deployment profile, and produces sanitized release evidence.

## Small tasks

### A06.1 — Reset/bootstrap runbook

- Automate safe local database bootstrap/migration and demo fixture reset.
- Never delete or mutate external chain history; label testnet artifacts.
- Document prerequisites and rollback/safe-disable behavior.

### A06.2 — Invariant scenarios

- Script identical replay, conflicting replay, ten parallel workers, two processes, restart, lost response, and downstream failure.
- Record Business Intent ID, durable final state, attempt count, and external settlement count.

### A06.3 — Operations evidence

- Demonstrate readiness/liveness boundaries, safe disable, `UNKNOWN` alerts, queue lag, and redacted logs.
- Verify no manual database edit is needed for normal recovery.

### A06.4 — Documentation

- Finalize architecture, API/worker operation, migrations, debugging, recovery escalation, and known limitations.
- Link exact B/C evidence slots without copying secrets or raw provider responses.

### A06.5 — Mainnet-readiness package

- Validate the disabled Arc Mainnet profile schema, deployment manifest, safe-disable, rollback, and environment separation without sending a transaction.
- Document the human gate for pinning official chain/token values and activating a limited real-value pilot.

### A06.6 — Candidate verification

- Run root quality, migration, matrix, browser, secret, and intended-file checks against the exact candidate.
- Prepare concise release evidence for mandatory independent review and human merge.

## Acceptance evidence

- Clean bootstrap and repeatable demo work without manual database surgery.
- Every scripted money/retry case includes durable state and settlement count.
- Safe disable halts new submissions and retains recovery visibility.
- Evidence contains no credentials, private wallet material, or sensitive provider payloads.
- Mainnet readiness fails closed while official values or human approval are absent, and requires no domain redesign once supplied.

## Handoff artifact

Publish the operations runbook, invariant scenario runner, sanitized result table, architecture/API links, mainnet-readiness manifest, rollback procedure, and release checklist.

## No-wait continuation

A06 closes independently. Gate P6 composes exact reviewed A06/B06/C06 artifacts; any mismatch becomes an owner-specific fix ticket.

## Non-goals

No real mainnet transaction, production compliance certification, or agent-performed merge.
