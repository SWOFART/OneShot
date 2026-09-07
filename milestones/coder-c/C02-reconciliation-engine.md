# C02 — LLM Recovery Agent and Deterministic Reconciliation

Owner: Coder C
Branch: `milestone/c02-reconciliation-engine`
Depends on: C01 only
Next: C03 immediately after closure

## Outcome

An LLM Recovery Agent consumes sanitized Subgraph MCP candidate observations and
recommends exactly one of `WAIT`, `RECONCILE`, `ESCALATE`, or
`RETURN_EXISTING_RESULT`. A deterministic safety core combines authoritative
local/Arc evidence with that advisory output to emit safe reconciliation
commands and a provenance-labeled recovery view. It can never submit payment.

## Small tasks

### C02.1 — Evidence model

- Define source, authority class, request binding, retrieval time, block/finality/freshness, sanitized reason, and digest.
- Reject evidence that cannot bind to the exact intent/request/transaction identity.

### C02.2 — Evidence precedence and agent input

- Make durable committed record and exact verified Arc receipt authoritative.
- Use Privy status and direct Arc evidence to resolve the original activity; use Subgraph MCP/LLM only to locate, select, corroborate, or explain candidates.
- Encode contradictory, stale, missing, and unavailable combinations explicitly.
- Build a bounded, sanitized input that labels MCP content as untrusted data and excludes secrets/raw provider bodies.

### C02.3 — LLM recommendation contract

- Accept only structured `WAIT`, `RECONCILE`, `ESCALATE`, or
  `RETURN_EXISTING_RESULT` with bounded reason and evidence/candidate references.
- Reject unknown actions, extra tool calls, fabricated/missing bindings,
  free-form commands, and prompt/tool injection.
- Publish a deterministic agent simulator so C02 closes without model credentials.

### C02.4 — Safety-core commands and recovery view

- Map `WAIT` to `HOLD_UNKNOWN`, `RECONCILE` to read-only lookup, and `ESCALATE` to `ESCALATE_UNKNOWN`.
- Permit `RETURN_EXISTING_RESULT` to become `MARK_COMMITTED`/a terminal response only after exact current Arc/durable proof; otherwise hold or escalate.
- Never emit submit/retry, create submission ownership, or call `SettlementPort`.
- Separate authoritative state from provider/Arc/indexed observations.
- Include MCP deployment/tool identity, observed-through block/time, lag, health,
  agent recommendation, core disposition, and contradiction warnings.
- Sanitize raw payloads and bound collection sizes.

### C02.5 — Idempotency tests

- Repeat recommendations, reorder/duplicate observations, change retrieval time, and replay MCP/provider events.
- Prove deterministic semantic command and zero external submissions.

## Acceptance evidence

- Verified matching success resolves `UNKNOWN -> COMMITTED`.
- Matching final revert/no-effect proof may resolve `UNKNOWN -> FAILED_SAFE`.
- Pending, not found, unavailable, empty/lagging/unhealthy Graph/MCP candidates,
  mismatch, contradiction, model failure, or invalid output remains `UNKNOWN`.
- Each allowed recommendation is exercised; none can bypass Arc/durable proof or create a settlement right.
- Every decision explains authority and provenance without leaking raw sensitive data.
- Package imports no A/B implementation and contains no SettlementPort call.

## Handoff artifact

Publish `reconciliation-v1`, RecoveryAdvisorPort schema, four-action/invalid-output
matrix, deterministic agent and safety-core simulators, command schema,
evidence/recovery fixtures, and verification command.

## No-wait continuation

Start C03 using the local state and provider simulators from the frozen pack.

## Non-goals

No direct database mutation, queue ownership, settlement submission, live
external-index/model requirement, or frontend.
