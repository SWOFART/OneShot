# OneShot Test Matrix

Select every applicable case for changes to intents, retries, workers, queues,
payments, settlements, reconciliation, Privy, Arc, or The Graph discovery. Prefer tests at
the public domain boundary plus focused adapter tests. A test must assert durable
state and external settlement count, not only an HTTP response.

| Case | Fault or concurrency setup | Required result |
| --- | --- | --- |
| Normal job | One valid intent and one worker | Exactly 1 committed settlement |
| Same request twice | Deliver identical request twice | Exactly 1 committed settlement |
| Conflicting payload, same ID | Different request payloads share one `business_intent_id` | At most 1 committed settlement; conflict is explicit |
| Sequential retry storm | Run 10 sequential attempts for one intent | Exactly 1 committed settlement |
| Parallel worker storm | Run 10 workers concurrently for one intent | Exactly 1 committed settlement |
| Crash before submission | Kill process before any external submission | 0 settlements; retry is allowed from durable state |
| Crash after submission | Kill process after possible submission but before local confirmation | Enter `UNKNOWN`; reconcile; no blind retry |
| Lost payment response | Payment succeeds but HTTP response is lost | Exactly 1 committed settlement after reconciliation |
| Graph delay, absence, or ambiguity | The Graph returns nothing, lags, is unavailable, or returns multiple candidates | Remain `UNKNOWN`; no duplicate settlement; absence is not non-payment proof |
| Privy denial | Policy denies or amount exceeds permission | 0 settlements and explicit authorization failure |
| Service restart | Restart after durable intent creation or in-flight work | Intent and settlement state survive; invariant holds |
| Downstream failure after payment | Supplier/API step fails after settlement | Payment result remains durable; no replacement payment |
| Two agent instances | Same business obligation reaches two agents | Exactly 1 committed settlement |

## Cross-cutting assertions

- `business_intent_id` is stable across all attempts.
- Monetary values use integer atomic units or `bigint` end to end.
- State transitions are atomic under real concurrency, not only mocked sequence.
- External submission identifiers and reconciliation evidence survive restart.
- Logs and test fixtures contain no real secrets or wallet material.
- Tests use testnet or isolated fakes; never create unauthorized mainnet effects.

Record selected cases and results in the session context and pull request.
