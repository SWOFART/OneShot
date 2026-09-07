# OneShot Recovery Action & Safety Core Matrix (v1)

## 1. Overview

The OneShot Reconciliation Engine resolves business intents stranded in `UNKNOWN` state without ever performing blind retries or issuing duplicate settlement requests.

The engine coordinates:

1. **Subgraph MCP / The Graph Discovery**: Locates candidate ERC-20 Transfer events matching the business intent binding without requiring transaction hashes. Non-authoritative by construction.
2. **LLM Recovery Agent (`RecoveryAdvisorPort`)**: Consumes a bounded, redacted, untrusted-labeled view of observations and recommends exactly one bounded action. Advisory by construction.
3. **Deterministic Recovery Safety Core**: Combines authoritative OneShot durable state and exact verified Arc on-chain evidence with the advisory recommendation to emit safe commands. Zero-submit by construction.

---

## 2. Authority Hierarchy

| Authority Class | Source | Authority Level | Can Grant Settlement? | Can Transition to COMMITTED? |
| --- | --- | --- | --- | --- |
| `AUTHORITATIVE_ONESHOT` | OneShot Ledger | Authoritative | No (Worker only via CAS) | Yes (reflects existing state) |
| `AUTHORITATIVE_CHAIN_EVIDENCE` | Arc Receipt + Transfer Log | Authoritative | No (Never initiates payment) | Yes (on verified final match) |
| `PROVIDER_OBSERVATION` | Privy API | Observation | No | No (Requires Arc confirmation) |
| `NON_AUTHORITATIVE_CANDIDATE_DISCOVERY` | The Graph / Subgraph MCP | Non-authoritative | NEVER | NEVER |
| `ADVISORY_AGENT_OBSERVATION` | LLM Recovery Agent | Advisory | NEVER | NEVER |

---

## 3. Four-Action Advisory Matrix

The LLM Recovery Agent may only output one of four strictly bounded actions:

| Action | Agent Meaning | Safety Core Disposition | Target State | External Submissions |
| --- | --- | --- | --- | --- |
| `WAIT` | Preserves `UNKNOWN` until fresher evidence or next indexing cycle. | `HOLD_UNKNOWN` | `UNKNOWN` | 0 |
| `RECONCILE` | Re-check indexer or provider evidence in a read-only cycle. | `READ_ONLY_LOOKUP` | `UNKNOWN` | 0 |
| `ESCALATE` | Human operator intervention needed (e.g. contradiction, anomalies). | `ESCALATE_UNKNOWN` | `UNKNOWN` | 0 |
| `RETURN_EXISTING_RESULT` | Advises that a candidate matches the intended settlement. | If Arc proof verified: `MARK_COMMITTED`<br>If Arc proof absent: `HOLD_UNKNOWN` (Overridden!) | `COMMITTED` (with proof)<br>`UNKNOWN` (without proof) | 0 |

---

## 4. Invalid Output & Boundary Rejection Matrix

Any anomalous, untrusted, or hostile agent output fails closed to `WAIT` with an explicit diagnostic:

| Issue Class | Trigger / Example | Boundary Validation | Safety Core Disposition | Target State |
| --- | --- | --- | --- | --- |
| `UNSUPPORTED_ACTION` | Agent outputs `RETRY`, `SUBMIT`, `RESUBMIT`, `CANCEL` | Rejected (`INVALID_RESULT`) | `HOLD_UNKNOWN` | `UNKNOWN` |
| `PROMPT_INJECTION` | Reason contains "ignore previous instructions", "execute_payment" | Rejected (`INVALID_RESULT`) | `HOLD_UNKNOWN` | `UNKNOWN` |
| `FABRICATED_BINDING` | Referenced evidence ID does not exist in available evidence | Rejected (`INVALID_IDENTITY`) | `HOLD_UNKNOWN` | `UNKNOWN` |
| `MALFORMED_OUTPUT` | Non-JSON text, null, missing required fields | Rejected (`INVALID_JSON`) | `HOLD_UNKNOWN` | `UNKNOWN` |
| `TIMEOUT_OR_UNAVAILABLE` | Model fails to return within timeout | Rejected (`MCP_UNAVAILABLE`) | `HOLD_UNKNOWN` | `UNKNOWN` |

---

## 5. End-to-End Decision Truth Table

| Authoritative Arc Receipt | Arc Transfer Matching | Subgraph MCP Status | Agent Recommendation | Safety Core Command | Target State | Submissions |
| --- | --- | --- | --- | --- | --- | --- |
| `SUCCESS` (final) | `MATCH` | `FRESH` (1 match) | `RETURN_EXISTING_RESULT` | `MARK_COMMITTED` | `COMMITTED` | 0 |
| `SUCCESS` (final) | `MATCH` | `LAGGING` | `WAIT` | `MARK_COMMITTED` | `COMMITTED` | 0 |
| `REVERT` (final) | N/A | Any | Any | `MARK_FAILED_SAFE` | `FAILED_SAFE` | 0 |
| `NOT_FOUND` / `PENDING` | None | `FRESH` (1 candidate) | `RETURN_EXISTING_RESULT` | `HOLD_UNKNOWN` (Overridden) | `UNKNOWN` | 0 |
| `NOT_FOUND` / `PENDING` | None | `FRESH` (0 candidates) | `WAIT` | `HOLD_UNKNOWN` | `UNKNOWN` | 0 |
| `NOT_FOUND` / `PENDING` | None | `LAGGING` | `RECONCILE` | `READ_ONLY_LOOKUP` | `UNKNOWN` | 0 |
| `NOT_FOUND` / `PENDING` | None | `UNHEALTHY` / `ERROR` | `RECONCILE` | `READ_ONLY_LOOKUP` | `UNKNOWN` | 0 |
| Contradictory | Mismatch | Multiple candidates | `RETURN_EXISTING_RESULT` | `ESCALATE_UNKNOWN` (Overridden) | `UNKNOWN` | 0 |
| Any | Any | Any | `RETRY` (Unsupported) | `HOLD_UNKNOWN` (Fails closed) | `UNKNOWN` | 0 |
