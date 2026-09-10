# A03 Worker Failure Point Catalog

This catalog documents the external-boundary failure points, expected state transitions, and at-most-once guarantees enforced by the OneShot atomic worker.

## Failure Points and Recovery Matrix

| Scenario | Point of Interruption | Durable State at Interruption | External Port Calls | Recovery Action | Invariant Enforced |
| --- | --- | --- | --- | --- | --- |
| **FP-01: Crash before submission** | Process killed before `claimSubmission` CAS | `READY` | 0 | Safe continuation: worker picks up job and executes CAS | Zero unintended side effects; retry allowed |
| **FP-02: Crash during external call** | Process killed while port call in flight | `SUBMITTING` | $\le 1$ | State resolves to `UNKNOWN`; enqueue reconciliation; never blind retry | No duplicate external submission |
| **FP-03: Provider error / timeout** | Port throws network exception or timeout | `SUBMITTING` | 1 | Transition to `UNKNOWN`, persist sanitized error, enqueue reconciliation | No retry without proof |
| **FP-04: Definitive rejection** | Port returns `DEFINITELY_NOT_SUBMITTED` | `SUBMITTING` | 1 | Transition to `FAILED_SAFE`, persist failure reason; a policy layer may schedule a fresh authorization attempt | No retry without authoritative no-effect proof |
| **FP-05: Downstream failure after commit** | Failure after `COMMITTED` state and settlement persisted | `COMMITTED` | 1 | Settlement remains permanently recorded; no replacement payment | Settlement identity is immutable |
| **FP-06: 10 Parallel workers storm** | 10 workers race on same `READY` intent | `READY` | 1 (winner only) | Exactly 1 worker wins CAS to `SUBMITTING`; 9 workers exit without calling port | Exactly 1 committed settlement |
| **FP-07: 10 Sequential deliveries** | Same intent job delivered 10 times in sequence | `AUTHORIZING` $\rightarrow$ `COMMITTED` | 1 | First delivery commits settlement; subsequent deliveries find `COMMITTED` and exit | At most 1 settlement |

## Concurrency and CAS Proof

The atomic compare-and-set transition:

```sql
UPDATE business_intents
SET state = 'SUBMITTING', version = version + 1, updated_at = now()
WHERE business_intent_id = $1 AND version = $2 AND state = 'READY';
```

Because this update runs inside a PostgreSQL transaction that commits **prior** to the external port invocation, only the single transaction that successfully updates the row obtains the right to invoke the settlement port.
