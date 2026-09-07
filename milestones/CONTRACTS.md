# Frozen v1 Contract Pack

Status: proposed freeze for project Gate P0
Owners: A owns canonical schemas; B and C own additive provider/recovery extensions
Change rule: expand-migrate-contract only

## 1. Immutable product semantics

- Cardinality: `1 Business Intent / N Attempts / <= 1 committed Settlement`.
- `business_intent_id` is stable across retries, redelivery, restarts, workers, and agents.
- OneShot durable state grants submission ownership.
- Privy authorizes and constrains the wallet action but is not the durable duplicate lock.
- Arc receipt plus expected ERC-20 Transfer evidence establishes committed settlement.
- Direct Privy/Arc evidence resolves known transaction identities. The selected v1 hashless path queries the live OneShot/Arc Subgraph through Subgraph MCP and lets an LLM Recovery Agent recommend a bounded action after C01; all indexed/model evidence remains non-authoritative.
- Subgraph MCP and the LLM expose no signing, settlement, retry, Attempt-creation, or submission-ownership capability.
- Any possibly submitted but unconfirmed outcome is `UNKNOWN`; reconciliation precedes another submission.

## 2. Canonical identifiers and money

| Field | Rule | Redaction |
| --- | --- | --- |
| `business_intent_id` | caller-supplied UUID/opaque stable string; length bounded | safe operational ID |
| `attempt_id` | server-generated UUID; append-only attempt identity | safe operational ID |
| `correlation_id` | validated inbound or generated; never grants idempotency | safe if non-secret |
| `payload_fingerprint` | deterministic hash of normalized immutable payload | safe hash |
| `amount_atomic` | canonical unsigned base-10 integer string, no sign/decimal/exponent/whitespace | safe business datum; do not over-log |
| `asset` | exactly `USDC` | public |
| `network` | exactly the enabled Arc deployment profile; v1 live proof uses `eip155:5042002`; mainnet remains disabled until official values are pinned and human-approved | public |
| `token_contract` | exactly the enabled profile USDC interface; v1 testnet uses `0x3600000000000000000000000000000000000000`; no implicit mainnet default | public |
| `recipient` | normalized EVM address; allowlist/policy checked | display only where required |
| `privy_idempotency_key` | stable derivative of intent identity; same key requires same body | never log raw if classified sensitive |
| `privy_reference_id` | stable lookup identity derived from intent | sanitized evidence only |
| `memo_id` | optional `bytes32` hash of the Business Intent used only when the Arc Memo path passes B01 policy validation | public correlation hash |

`purpose` is a bounded, non-secret display/audit string. It participates in the immutable payload fingerprint and is redacted from routine logs by default.

## 3. Create-intent command

```json
{
  "business_intent_id": "018f-example-stable-id",
  "recipient": "0x1111111111111111111111111111111111111111",
  "amount_atomic": "1250000",
  "asset": "USDC",
  "network": "eip155:5042002",
  "purpose": "Invoice INV-1001"
}
```

Normalization order is fixed: validate types and bounds; normalize EVM address; retain canonical integer string; encode asset/network constants; normalize the permitted purpose representation; serialize with a deterministic field order; hash the canonical bytes.

Identical ID and fingerprint is a replay. Identical ID with a different fingerprint is `INTENT_PAYLOAD_CONFLICT` and creates no new settlement right.

## 4. Public HTTP seam

| Operation | Success behavior | Stable error families |
| --- | --- | --- |
| `POST /v1/intents` | `202` accepted; `200` identical replay | `400 INVALID_REQUEST`, `401/403 UNAUTHORIZED`, `409 INTENT_PAYLOAD_CONFLICT`, `429 RATE_LIMITED` |
| `GET /v1/intents/{id}` | authoritative intent, attempts, settlement, sanitized evidence, version | `404 INTENT_NOT_FOUND` |
| `POST /v1/intents/{id}/reconcile` | enqueue/read-trigger only; never submit | `404 INTENT_NOT_FOUND`, `409 RECONCILIATION_NOT_ALLOWED` |
| `GET /v1/intents/{id}/recovery-view` | local authority plus labeled provider/index observations | `404 INTENT_NOT_FOUND`, `503 EVIDENCE_UNAVAILABLE` with local state retained |
| `GET /health/live` | process liveness only | `503` when process cannot serve |
| `GET /health/ready` | DB/config ready and Arc identity checks satisfied | `503 NOT_READY` with sanitized reason |

Mutations require service authentication, schema validation, request-size limits, correlation IDs, rate limits, and sanitized stable errors.

## 5. Port contracts

### AuthorizationPort.evaluate

Input includes intent/attempt identity, immutable request fingerprint, wallet/policy expectation, recipient, amount, network, token, method, native value, and correlation identity.

Results:

- `AUTHORIZED`: exact expected scope is permitted.
- `DENIED`: no submission; terminal authorization rejection for this attempt.
- `UNAVAILABLE`: retryable only before submission ownership crosses the external boundary.

### SettlementPort.submit

Input includes persisted Privy idempotency key/reference ID and exact request fingerprint.

Results:

- `CONFIRMED`: verified final Arc receipt and exactly matching Transfer evidence.
- `DEFINITELY_NOT_SUBMITTED`: narrow documented proof that no broadcast or external effect occurred.
- `POSSIBLY_SUBMITTED`: timeout, lost/truncated response, uncertain provider/RPC failure, crash window, or any doubt.

### EvidencePort.lookup

Results:

- `FINAL_SUCCESS`
- `FINAL_REVERT`
- `PENDING`
- `NOT_FOUND`
- `UNAVAILABLE`

`NOT_FOUND` alone never proves that no payment occurred.

### IndexViewPort.lookup

The v1 implementation defines `IndexViewPort` as provider-neutral: direct GraphQL
querying of the live OneShot/Arc Subgraph is the minimal baseline path, and a
deployment-pinned Subgraph MCP tool call is supported as an optional adapter.
Both return candidate transfer observations plus observed block/time,
provider/deployment identity, chain-head comparison, lag, provider health
details, retrieval time, and health classification: `FRESH`, `LAGGING`,
`UNHEALTHY`, `UNAVAILABLE`, or `UNKNOWN_FRESHNESS`. The adapter validates query/tool
arguments, target deployment, result schema, `_meta`, size bounds, and untrusted
text. Credentials never enter prompts, tool results, fixtures, logs, or evidence.

No IndexViewPort result grants settlement permission.

### RecoveryAdvisorPort.recommend

Input is a bounded, sanitized recovery view containing durable-state summary,
authority labels, exact identity bindings, Arc/Privy observations, and validated
Subgraph MCP observations. The only accepted recommendations are:

- `WAIT`: preserve `UNKNOWN` until fresher or authoritative evidence exists.
- `RECONCILE`: request another read-only evidence cycle.
- `ESCALATE`: request operator investigation with no financial effect.
- `RETURN_EXISTING_RESULT`: return candidate/evidence references for a result the deterministic core must independently prove already exists.

The response includes a bounded reason, referenced evidence IDs, model
configuration identity, and decision ID. Unknown actions, free-form tool calls,
missing/fabricated references, malformed output, prompt/tool injection, or model
unavailability fail closed to `WAIT` plus a sanitized diagnostic.

### Deterministic recovery safety core

The safety core treats the recommendation as advisory and rechecks the current
state version and authoritative OneShot/Arc evidence. `RECONCILE` can enqueue
only a read-only lookup, `WAIT` maps to `HOLD_UNKNOWN`, `ESCALATE` maps to
`ESCALATE_UNKNOWN`, and `RETURN_EXISTING_RESULT` can produce
`MARK_COMMITTED`/an existing terminal response only when independently proven.
No mapping calls `SettlementPort`, creates an Attempt, or grants submission
ownership.

## 6. Durable state machine

| Current | Trigger | Next | Submission permission |
| --- | --- | --- | --- |
| `NONE` | validated intent accepted | `AUTHORIZING` | No |
| `AUTHORIZING` | policy authorizes | `READY` | No |
| `AUTHORIZING` | policy denies | `REJECTED` | No; terminal |
| `READY` | atomic owner grant persists request identity | `SUBMITTING` | Exactly one owner crosses boundary |
| `SUBMITTING` | verified final receipt/Transfer | `COMMITTED` | No; terminal |
| `SUBMITTING` | authoritative proof of no submission/final failure | `FAILED_SAFE` | Policy may schedule a new attempt |
| `SUBMITTING` | possible submission, crash, timeout, doubt | `UNKNOWN` | No |
| `UNKNOWN` | verified success | `COMMITTED` | No; terminal |
| `UNKNOWN` | authoritative matching final revert/no-effect proof | `FAILED_SAFE` | Policy may schedule a new attempt |
| `UNKNOWN` | pending/not found/unavailable/lag/error/contradiction | `UNKNOWN` | No; escalate by age |

All transitions are compare-and-set with monotonic versioning. No database transaction remains open during a provider/RPC call. Startup treats orphaned `SUBMITTING` work as reconciliation-required `UNKNOWN`, never as a new lease to submit.

## 7. Required durable records

- Business Intent primary identity and immutable fingerprint.
- Append-only Attempts with stage, timestamps, sanitized error class, and correlation ID.
- At most one Settlement row per Business Intent; provider transaction hash unique when present.
- Transactional outbox/job record.
- Persisted request body fingerprint, Privy request identities, wallet/policy identity, chain/token/recipient/amount, provider transaction ID/hash/nonce when learned.
- Receipt block/hash/status and verified Transfer log transaction hash plus log index.
- When enabled, Arc Memo ID, call-data hash, event log identity, and proof that the Memo and Transfer share the verified transaction.
- Append-only evidence observations with source, retrieval time, block/freshness, sanitized payload or digest, and authority label.

## 8. Fixture catalog

The canonical fixture root is `packages/contracts/fixtures/v1/`. Every fixture has a JSON Schema validation test and explicit expected durable transition and external-submission count.

| Fixture | Required expectation |
| --- | --- |
| `intent/accepted.json` | new intent, one queued execution, zero settlement at API boundary |
| `intent/replay-identical.json` | same durable intent, no duplicate job/right |
| `intent/replay-conflict.json` | `409`, explicit conflict, zero additional right |
| `authorization/allowed.json` | exact scope authorized |
| `authorization/denied-*.json` | wrong chain/token/method/recipient/value/amount denied, zero submission |
| `settlement/confirmed.json` | matching final receipt and one Transfer |
| `settlement/final-revert.json` | final failure, zero committed settlement |
| `settlement/pending.json` | remain unresolved, no resubmission |
| `settlement/lost-response.json` | `POSSIBLY_SUBMITTED` -> durable `UNKNOWN` |
| `settlement/mismatched-transfer.json` | not confirmed, hold safely |
| `evidence/not-found.json` | no permission change |
| `index/candidate-one.json` | one bindable candidate still requires Arc verification |
| `index/candidate-multiple.json` | remain `UNKNOWN`; no candidate selection by guess |
| `index/empty.json` | labeled observation through observed block, no permission change |
| `index/lagging.json` | `LAGGING`, no permission change |
| `index/provider-error.json` | `UNHEALTHY`, no permission change |
| `index/unavailable.json` | `UNAVAILABLE`, local authority still returned |
| `mcp/malformed.json` | rejected before agent input; fail-closed `WAIT` |
| `mcp/injected-content.json` | content remains untrusted evidence, never an instruction |
| `agent/wait.json` | `WAIT` -> `HOLD_UNKNOWN`, zero external submissions |
| `agent/reconcile.json` | `RECONCILE` -> read-only evidence cycle only |
| `agent/escalate.json` | `ESCALATE` -> operator escalation only |
| `agent/return-existing-result.json` | accepted only when authoritative evidence independently proves the result |
| `agent/unsupported-action.json` | rejected; fail-closed `WAIT`, zero external submissions |

## 9. Simulator behavior

- Domain simulator exposes the HTTP seam and deterministic clock/IDs with an external-submission counter.
- Settlement simulator consumes canonical requests and emits each SettlementPort/EvidencePort result family without network access.
- Subgraph MCP simulator consumes pinned-deployment query fixtures and emits validated Graph candidates without network or credentials.
- Recovery-agent simulator consumes the labeled recovery view and emits every allowed/invalid recommendation deterministically.
- Recovery simulator passes recommendations through the deterministic safety core and emits commands and a labeled recovery view.
- Simulators reject unknown fixture versions and schema drift.
- Simulators never silently default an unknown enum to a successful or retryable result.

## 10. Public test seams

1. HTTP API plus returned durable state.
2. Worker task plus durable state and external-submission counter.
3. Adapter ports plus official-response fixtures.
4. Reconciliation command plus durable transition and evidence record.
5. Subgraph MCP candidate query/tool result plus deployment-specific freshness and ambiguity classification after C01.
6. RecoveryAdvisorPort recommendation plus deterministic safety-core command and external-submission counter.
7. Browser UI through frozen OpenAPI/mock server after Gate P4.

## 11. Compatibility and ownership

- A owns base schemas, OpenAPI, error codes, state vocabulary, and fixture validation tooling.
- B owns provider-specific optional evidence fields and response-to-port classification fixtures.
- C owns index/MCP/recovery observation fields, recovery-agent recommendation fields, and reconciliation-decision fixtures.
- Optional fields must not change existing result meaning.
- Unknown enum values fail closed at boundaries.
- A breaking change requires ADR, new fixture version, dual-form simulator support, independent consumer migration, and later removal.

## 12. Freeze exit checklist

- Every field has type, normalization, authority, and redaction rules.
- Every terminal result has a durable transition and external-submission expectation.
- Every lane can run a simulator with no credentials.
- No unresolved item can change settlement cardinality, monetary precision, Privy enforcement, Arc identity, `UNKNOWN` semantics, or the non-authoritative MCP/LLM boundary.
- Human approval records the exact Git tree containing this contract pack.
