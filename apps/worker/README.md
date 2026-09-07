# @oneshot/worker

Atomic at-most-once execution worker for OneShot Business Intents.

## Key Invariants

1. **At-most-once settlement**: An intent can result in at most one committed settlement transaction on-chain.
2. **CAS Submission Ownership**: Transition `READY -> SUBMITTING` is an atomic compare-and-set database transaction that commits before any network or port call is initiated.
3. **Fail-Closed on Uncertainty**: Network timeouts, unexpected adapter results, or crashes during `SUBMITTING` transition the intent into `UNKNOWN` and enqueue reconciliation work. Blind retries are strictly prohibited.
4. **Clean Scheduling Hygiene**: Queue keys are used for scheduling hygiene (`submit:<id>:<version>`); the duplicate prevention lock is authoritative in PostgreSQL.

## Tasks

- `authorize_intent`: Validates intent against corporate spending and policy rules, advancing state to `READY` (or `REJECTED`).
- `submit_settlement`: Atomically claims submission right and executes settlement via configured settlement port.
- `reconcile_intent`: Reconciles ambiguous intent state against evidence observations.

## Architecture and Dispatch

The worker supports dual execution modes:

1. **Graphile Worker TaskList (`createTaskList`)**: Exposes standard typed job handlers conforming to Graphile Worker `TaskList` specification for production multi-worker runner pools.
2. **Transactional Outbox Poller (`drainOutboxJobs`)**: Embedded transactional worker engine using PostgreSQL `FOR UPDATE SKIP LOCKED` for atomic job delivery without external message broker dependencies.
