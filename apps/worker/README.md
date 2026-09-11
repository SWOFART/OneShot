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

The worker exports two scheduling interfaces:

1. **Graphile Worker TaskList (`createTaskList`)**: Exposes standard typed job handlers conforming to Graphile Worker `TaskList` for host integrations and tests.
2. **Transactional Outbox Poller (`drainOutboxJobs`)**: The scheduler used by the executable `RestartRunner`, with PostgreSQL `FOR UPDATE SKIP LOCKED` for atomic job delivery without an external message broker.

The production process does not start a Graphile Worker runner; `createTaskList`
is an integration seam, while `RestartRunner` is the current runtime scheduler.

## Production process

Build the workspace and run `pnpm --filter @oneshot/worker start`, or build
`Dockerfile.worker`. The process validates all Privy, Arc, Graph, Vertex,
and database configuration before accepting work. It performs startup recovery,
immediately drains durable outbox work, continues polling without overlapping
cycles, and waits for an in-flight cycle during SIGTERM/SIGINT shutdown.

Set `ONESHOT_SUBGRAPH_SOURCE=STUDIO_GRAPHQL` and
`ONESHOT_SUBGRAPH_QUERY_URL` for the active Arc Testnet profile. The URL is
authenticated with `ONESHOT_GRAPH_API_KEY` from Secret Manager and is recorded
only as a pinned source identity; the key never enters evidence or Vertex
context. Set `ONESHOT_SUBGRAPH_SOURCE=SUBGRAPH_MCP` and the MCP endpoint only for
a deployment served by The Graph Network. The adapter validates both
paths fail-closed and never grants settlement permission.

The HTTP listener exposes `GET /health/live` and `GET /health/ready`. Readiness
requires a reachable database, compatible adapter identities, and a running
outbox runner with no unresolved cycle error. Google Vertex authentication uses
Application Default Credentials; Privy and Graph secrets must come from the
deployment secret store. See `.env.example` for the full variable contract.

## R4 response-loss drill

The reviewed `ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST=true` hook drops one
confirmed settlement response after the provider call and before the confirmed
result is persisted. It is accepted only with
`ONESHOT_DEMO_CONFIRM_TESTNET=true` and an Arc Testnet profile; normal operation
leaves it disabled. The worker records `UNKNOWN` and queues reconciliation, so
the hook never grants a replacement settlement.

Run the safe offline rehearsal with `pnpm demo:r4`. A live run additionally
requires the explicit testnet confirmation, the API URL/bearer token, a stable
`ONESHOT_R4_TASK_KEY`, and the worker hook. The runner emits only sanitized
state, Graph freshness/deployment, and result-availability fields. A missing
Studio capture or unresolved payment is reported as `HOLD`/`INCOMPLETE`, never
as a successful sponsor claim.
