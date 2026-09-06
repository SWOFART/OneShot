---
name: oneshot-failure-injection
description: Design or test OneShot failure boundaries around external effects, including timeouts, lost responses, process kills, duplicate delivery, retries, and parallel execution before, during, or after payment submission.
---

# OneShot Failure Injection

Read `.agent/SECURITY_INVARIANTS.md` and `.agent/TEST_MATRIX.md`. Map each
external effect into three boundaries: definitely before submission, possibly
submitted, and definitely confirmed.

## Mandatory checks

- Inject failure before submission and prove zero settlement plus safe retry.
- Inject timeout/process kill/lost response during or after submission and prove
  durable `UNKNOWN`, reconciliation, and no blind retry.
- Deliver the same request repeatedly and from 10 parallel workers; prove at
  most one committed settlement.
- Restart services between durable transitions and external responses.
- Delay or empty The Graph results; prove no duplicate settlement.
- Deny Privy policy and exceed spending amount; prove zero settlement.
- Fail a supplier/API action after payment; prove settlement result remains.
- Assert external settlement count, durable intent/attempt/settlement state, and
  stable identifiers. Do not rely only on returned HTTP status.

Use testnet or isolated fakes. Never inject failures against unauthorized live
funds or expose secrets in fixtures/logs. Record exact injection points and
results in session context and PR evidence.
