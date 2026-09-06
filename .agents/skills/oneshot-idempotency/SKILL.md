---
name: oneshot-idempotency
description: Enforce OneShot's at-most-once settlement invariant when work touches business intents, payments, retries, settlements, reconciliation, workers, queues, jobs, invoices, or duplicate delivery.
---

# OneShot Idempotency

Read `.agent/PROJECT_CONTEXT.md`, `.agent/SECURITY_INVARIANTS.md`, and
`.agent/TEST_MATRIX.md` before editing.

## Mandatory checks

- Preserve `1 intent / N attempts / <=1 committed settlement`.
- Create and persist one stable `business_intent_id` before external effects;
  reuse it across retries, restarts, workers, and agents.
- Keep authoritative intent and settlement state in OneShot durable storage.
- Grant submission rights through an atomic, concurrency-safe transition or
  equivalent uniqueness guarantee.
- Use a stable provider idempotency/submission key tied to the Business Intent
  where the provider supports it. This supplements, not replaces, OneShot state.
- Treat any possibly submitted but unconfirmed payment as `UNKNOWN`. Reconcile
  from durable/provider/Arc evidence before retrying.
- Never use Graph absence or indexing delay as permission to pay.
- Keep money in integer atomic units or `bigint`; validate asset, network,
  recipient, amount, and Privy policy before submission.
- Preserve payment results when later supplier/API work fails.

Select applicable matrix cases, including duplicate input, 10 sequential
retries, 10 parallel workers, process restart, two agents, and ambiguous
submission. Report any invariant that cannot be proven; do not claim safety from
happy-path tests alone.
