# OneShot Product Implementation Plan

Status: implementation-ready proposal
Team: exactly three engineers
Planning horizon: 20 working days, recalibrated after Milestone 1
Base for implementation: current `develop` after the agent-infrastructure work is human-reviewed and merged
Research basis: `.agent/research/20260906-integration-decisions.md`

## 1. Outcome

Deliver a testnet application that accepts one approved Business Intent, safely survives retries, crashes, duplicate delivery, parallel workers, and ambiguous provider responses, and produces at most one committed USDC settlement on Arc Testnet through a Privy-controlled corporate wallet. The Graph supplies live indexed history and recovery evidence without becoming an authorization source.

The release claim is:

`1 Business Intent / N Attempts / <= 1 committed Settlement`

The milestone plan is deliberately backend-first. No production frontend work begins until the backend integration and failure suite pass in Milestone 4.

## 2. Success criteria

- A caller creates a Business Intent with a stable `business_intent_id`; identical replays return the same durable result and conflicting payloads under the same ID fail explicitly.
- Privy authorization and wallet policy constrain every normal settlement path. Wrong network, asset, recipient, method, or above-cap amount results in zero settlement.
- A valid intent produces a real ERC-20 USDC transfer on Arc Testnet and stores the final receipt and transfer identity.
- A timeout, lost response, or crash after possible submission produces durable `UNKNOWN`; no new settlement submission is allowed until reconciliation resolves it.
- Ten sequential retries, ten parallel workers, a restart, and two agent instances cannot produce more than one committed settlement.
- Live The Graph data explains settlement history and supports recovery. Empty, delayed, or unhealthy indexed data never unlocks another payment.
- Money remains an integer string/`bigint` in six-decimal ERC-20 USDC atomic units from API through policy evaluation, storage, calldata, indexing, and UI.
- The final demo proves Privy, Arc, and The Graph requirements with testnet evidence and exposes no secrets.

## 3. Scope

### In scope

- TypeScript backend, worker, shared contracts, PostgreSQL state, and migrations.
- Privy execution-wallet authorization and a fail-closed wallet policy.
- Arc Testnet ERC-20 USDC submission, receipt verification, and explorer evidence.
- Durable reconciliation using OneShot state, Privy identifiers/status, Arc RPC receipts, and The Graph evidence.
- A custom Subgraph plus freshness and indexing-health classification.
- Failure injection, concurrency tests, service restart tests, audit-safe structured logs, metrics, and a demo runbook.
- A minimal operator/user frontend only after backend acceptance.

### Explicit non-goals

- Mainnet, multi-chain, multi-asset, swaps, bridging, fiat on/off ramps, or custody beyond the configured Privy testnet wallet.
- Treating The Graph as authoritative settlement state or as permission to retry.
- Automatic same-nonce transaction replacement in the first release.
- General workflow automation, arbitrary supplier integrations, accounting/ERP integrations, or production compliance certification.
- Production-scale multi-region deployment, high availability, or a native mobile client.

## 4. Fixed technical decisions

These decisions are frozen for the first implementation. Changing one requires a short ADR, updated contract fixtures, and approval from all affected owners.

| Area | Decision | Reason |
| --- | --- | --- |
| Runtime | Node.js LTS + strict TypeScript; exact versions pinned in Milestone 1 | One language across API, worker, Privy, Arc, Subgraph tooling, and frontend |
| Repository | `pnpm` workspace with independently testable packages | Each owner can build and test without waiting for root integration |
| API | HTTP JSON described by OpenAPI; generated schemas are checked for drift | Stable seam for simulators and the late frontend |
| Durable state | PostgreSQL | Atomic conditional transitions, constraints, transactional enqueueing |
| Work delivery | Graphile Worker in the same PostgreSQL database | At-least-once work without adding Redis; transactional enqueueing |
| Money | Decimal-free integer strings at boundaries and `bigint` internally | Prevents floating-point loss and JSON `bigint` ambiguity |
| Settlement asset | Arc Testnet ERC-20 USDC at `0x3600000000000000000000000000000000000000`, six decimals | One canonical payment representation; native USDC is gas accounting only |
| Privy | Execution wallet with authorization owner/key quorum and one fail-closed policy | Privy remains a real authorization boundary, not branding |
| Chain access | Arc RPC with startup checks for chain ID `5042002` and USDC bytecode | Fails closed on misconfiguration |
| Indexed view | Custom Subgraph on `arc-testnet`, queried with `_meta` and explicit freshness | Live recovery/history with visible limitations |
| External-effect queueing | `submit_settlement` gets one queue attempt; reconciliation reads may retry | Prevents the queue from blindly repeating an ambiguous payment |

## 5. Architecture and ownership boundaries

```text
Caller / late frontend
        |
        v
HTTP API ---------> PostgreSQL authoritative ledger <------ Worker claims
                         |          |                            |
                         |          +---- durable outbox/jobs ---+
                         |
                         +--> AuthorizationPort --> Privy policy + wallet
                         +--> SettlementPort ----> Arc ERC-20 USDC
                         +--> EvidencePort ------> Privy status + Arc RPC
                         +--> IndexViewPort -----> The Graph (non-authoritative)
```

### Person A — Domain, storage, API, and work delivery

Owns `packages/contracts`, `packages/domain`, `packages/storage-postgres`, `apps/api`, `apps/worker`, migrations, OpenAPI, and the domain adapter simulator. Person A does not implement Privy, Arc, or The Graph clients.

### Person B — Privy authorization and Arc settlement

Owns `packages/privy-adapter`, `packages/arc-adapter`, policy fixtures, Arc chain configuration, transaction construction, receipt verification, provider error classification, and the settlement-adapter simulator. Person B does not change domain states or database tables directly.

### Person C — Reconciliation, The Graph, and reliability evidence

Owns `packages/reconciliation`, `packages/graph-client`, `subgraph`, recovery-view contracts, freshness/health classification, and the failure-injection harness. Person C may propose state transitions only through the frozen reconciliation command port.

### Shared files and conflict rule

- Only Person A edits root workspace/build configuration after Milestone 1.
- Every package must have a package-local test command so Persons B and C can run independently before root composition exists.
- Contract changes are additive during a milestone. Breaking changes require an ADR and all three owners' approval; consumers retain the old form until migration is complete.
- No owner imports another owner's implementation package. Integration happens only through ports and JSON fixtures defined below.

## 6. Contract freeze — the mechanism that removes day-to-day blockers

The following semantics are the Milestone 0 contract. Implementation details may vary, but no track may reinterpret them.

### 6.1 Create-intent command

Required input:

- `business_intent_id`: caller-supplied UUID/opaque stable ID.
- `recipient`: checksummed or normalized EVM address.
- `amount_atomic`: canonical base-10, non-negative integer string; no signs, decimals, exponent, or leading whitespace.
- `asset`: exactly `USDC`.
- `network`: exactly `eip155:5042002`.
- `purpose`: non-secret, length-bounded human description used only for display/audit.

The server computes an immutable payload fingerprint from normalized recipient, amount, asset, network, and purpose. Reusing the ID with the same fingerprint is a replay; reusing it with a different fingerprint is a conflict and never creates another settlement right.

### 6.2 Public HTTP seam

| Operation | Required behavior |
| --- | --- |
| `POST /v1/intents` | Create or replay an intent; return `202` for accepted, `200` for identical replay, `409` for same-ID conflict, and no external effect in the request transaction |
| `GET /v1/intents/{id}` | Return intent, attempts, settlement state, sanitized evidence, and stable version |
| `POST /v1/intents/{id}/reconcile` | Enqueue/read-trigger reconciliation only; never directly submit settlement |
| `GET /v1/intents/{id}/recovery-view` | Return authoritative local state plus clearly labeled indexed/provider evidence and freshness |
| `GET /health/live` | Process liveness without external dependency claims |
| `GET /health/ready` | Database plus configuration readiness; fail on wrong Arc chain ID or invalid required configuration |

Every mutation uses service authentication, request-size limits, schema validation, a correlation ID, and rate limiting. API errors use stable machine codes and never expose provider secrets or raw authorization material.

### 6.3 Port result contracts

| Port | Terminal result families | Required meaning |
| --- | --- | --- |
| `AuthorizationPort.evaluate` | `AUTHORIZED`, `DENIED`, `UNAVAILABLE` | `DENIED` and invalid scope produce zero submission; `UNAVAILABLE` is retryable only before submission |
| `SettlementPort.submit` | `CONFIRMED`, `DEFINITELY_NOT_SUBMITTED`, `POSSIBLY_SUBMITTED` | The adapter must never collapse an ambiguous response into a safe retry |
| `EvidencePort.lookup` | `FINAL_SUCCESS`, `FINAL_REVERT`, `PENDING`, `NOT_FOUND`, `UNAVAILABLE` | `NOT_FOUND` alone cannot authorize a new submission |
| `IndexViewPort.lookup` | evidence plus indexed block, timestamp, deployment, lag, health | Data is explanatory; missing/unhealthy data cannot transition `UNKNOWN` to retryable |

All port requests contain the stable Business Intent ID, immutable payload fingerprint, Arc/USDC identifiers, persisted provider idempotency key, correlation ID, and attempt ID. Simulators must read and emit the same checked JSON fixtures as production adapters.

### 6.4 Durable state model

Keep separate records for Business Intent, Attempt, and Settlement. A compact settlement state machine is:

| Current | Trigger | Next | External submission allowed? |
| --- | --- | --- | --- |
| `NONE` | validated intent accepted | `AUTHORIZING` | No |
| `AUTHORIZING` | Privy policy authorizes | `READY` | No |
| `AUTHORIZING` | policy denies | `REJECTED` | No, terminal |
| `READY` | atomic owner grant persists request identity | `SUBMITTING` | Exactly one owner may cross the boundary |
| `SUBMITTING` | verified final receipt and expected Transfer log | `COMMITTED` | No, terminal |
| `SUBMITTING` | narrow proof of no broadcast | `FAILED_SAFE` | A new attempt may be scheduled by policy |
| `SUBMITTING` | timeout, disconnect, lost response, crash, or doubt | `UNKNOWN` | No |
| `UNKNOWN` | reconciliation finds verified success | `COMMITTED` | No, terminal |
| `UNKNOWN` | reconciliation proves final revert/no settlement with authoritative evidence | `FAILED_SAFE` | Only then may policy schedule a new attempt |
| `UNKNOWN` | pending, not found, lagging, unhealthy, or contradictory evidence | `UNKNOWN` | No; operator attention if deadline exceeded |

Mandatory storage constraints and records:

- Primary/unique Business Intent ID plus immutable fingerprint.
- At most one Settlement row per Business Intent; provider transaction hash unique when present.
- N append-only Attempt rows with stage, timestamps, sanitized error class, and correlation ID.
- Persisted Privy idempotency key, reference ID, request fingerprint, wallet ID, recipient, amount, chain, token contract, transaction ID/hash/nonce when learned, receipt block/hash/status, and verified Transfer log identity.
- Compare-and-set state transitions with a monotonically increasing version. No database transaction spans an external network call.
- Transactional outbox/job insertion. Queue delivery and API retries are assumed duplicate and out of order.
- On worker startup, any orphaned `SUBMITTING` record is conservatively moved/treated as `UNKNOWN` for reconciliation; lease expiry never grants a blind resubmission.

### 6.5 Agreed test seams

Tests observe behavior through these public seams only:

1. HTTP API plus returned durable state.
2. Worker task input/output plus durable state and external-submission counter.
3. Adapter ports with official-response fixtures.
4. Reconciliation command plus durable transition and evidence record.
5. Subgraph mappings/GraphQL query plus indexed entity and `_meta` classification.
6. Browser UI through the public API contract in Milestone 5.

Each implementation ticket uses one red-green vertical slice at a time. Tests must assert both durable state and settlement count; HTTP status alone is insufficient.

## 7. Milestone overview and dependency graph

| Milestone | Days | Exit outcome |
| --- | ---: | --- |
| M0 — Contract and safety freeze | 0.5 | This plan, research, ports, fixtures, states, ownership, and test seams accepted |
| M1 — Three independent walking skeletons | 1–4 | Each track runs locally with its own simulator and no cross-track implementation import |
| M2 — Safety-critical vertical slices | 5–8 | Domain concurrency, real policy/transaction adapter, and reconciliation logic pass independently |
| M3 — Failure and operational hardening | 9–12 | Each track passes its assigned fault, restart, and observability evidence |
| M4 — Integrated backend and live testnet proof | 13–15 | All adapters compose; full matrix passes; one real authorized settlement is recorded and indexed |
| M5 — Frontend, last | 16–18 | Minimal intent, status, and recovery UI works against the stable backend |
| M6 — Demo qualification and release candidate | 19–20 | Scripted demo, sponsor evidence, runbooks, and release checks pass |

```text
A1 -> A2 -> A3 --\
B1 -> B2 -> B3 ----> M4 integrated backend -> M5 frontend -> M6 demo/release
C1 -> C2 -> C3 --/
```

There are no cross-person blockers through M3. Each task depends only on the same owner's prior task. M4 is the first convergence dependency; its build work can continue against simulators, but its exit test requires all three artifacts. This is intentional and cannot be removed without pretending integration is optional.

## 8. Detailed milestones

### M0 — Contract and safety freeze (all three, half day)

Deliverables:

- Accept Sections 4–6 as the initial ADR-equivalent contract.
- Create versioned JSON fixtures for identical replay, conflicting replay, authorization denial, confirmed transfer, final revert, pending transaction, lost response, empty Graph result, lagging Graph result, and indexing error.
- Confirm package/file ownership and the no-cross-implementation-import rule.
- Record required environment-variable names in `.env.example` with placeholders only; classify each as secret or public.
- Confirm the six public test seams before any test is written.

Exit criteria:

- Each person can run their package tests with local fakes and no credentials.
- Every contract field has one owner, type, normalization rule, and redaction rule.
- No unresolved decision can change settlement cardinality, money representation, or the classification of `UNKNOWN`.

### M1 — Three independent walking skeletons (days 1–4)

#### A1 — Durable intent skeleton (Person A; blockers: M0 only)

What it delivers: an intent can be accepted, replayed, queried, queued, and observed end to end using fake authorization/settlement ports.

Work:

- Create the workspace, strict compiler/lint/test/build commands, API/worker entry points, OpenAPI validation, and package-local commands.
- Add PostgreSQL migrations for intents, attempts, settlements, outbox/jobs, evidence, and schema versioning.
- Implement normalized fingerprinting, create/replay/conflict behavior, GET status, atomic state transitions, and a fake adapter with an external-settlement counter.
- Add containerized PostgreSQL test support and deterministic clock/ID seams.

Acceptance:

- Identical request twice returns the same Business Intent and one queued execution.
- Conflicting payload under the same ID returns `409`, records the conflict safely, and creates zero extra settlement rights.
- State survives API and worker restarts.
- Package tests prove constraints using a real PostgreSQL transaction, not only mocks.

#### B1 — Privy/Arc adapter skeleton (Person B; blockers: M0 only)

What it delivers: a standalone adapter can validate configuration, build exactly one canonical ERC-20 transfer request, classify official-response fixtures, and verify receipts without a real domain service.

Work:

- Pin and validate the Privy Node SDK plus Arc client library in a package-local compatibility test.
- Define Arc Testnet configuration and readiness checks for chain ID, USDC contract code, wallet address, and amount precision.
- Build six-decimal ERC-20 transfer calldata and the Privy request with stable idempotency/reference identifiers.
- Implement receipt verification: chain, sender, token contract, status, recipient, amount, transaction hash, block, and unique Transfer log.
- Draft the fail-closed Privy wallet policy fixture; do not store credentials.

Acceptance:

- Golden fixtures produce byte-for-byte stable request fingerprints and calldata.
- Wrong chain, token, recipient, amount format, or native value is rejected before signing.
- `status: 1` without the expected Transfer log is not `CONFIRMED`; `status: 0` is final revert.
- Timeout/lost-response fixtures return `POSSIBLY_SUBMITTED`, never safe retry.

#### C1 — Indexed recovery skeleton (Person C; blockers: M0 only)

What it delivers: a standalone Subgraph and recovery package map Arc USDC Transfer fixtures and expose a freshness-labeled recovery view against a fake domain/evidence host.

Work:

- Create Subgraph schema, manifest, mapping, and Matchstick/unit fixtures for the Arc USDC contract.
- Create the Graph client query including `_meta`, deployment, block, timestamp, and indexing errors.
- Implement freshness states: `FRESH`, `LAGGING`, `UNHEALTHY`, `UNAVAILABLE`, `UNKNOWN_FRESHNESS`.
- Create the reconciliation decision table and a simulator for local state, Privy evidence, Arc receipts, and indexed evidence.

Acceptance:

- Mapping identity is transaction hash plus log index; amount remains Graph `BigInt`/decimal string.
- Empty or lagging Graph fixtures never return permission to resubmit.
- Recovery output labels which facts are authoritative and which are indexed observations.
- Package tests run with no network or credentials.

M1 exit: all three package suites pass independently. Re-estimate M2–M6 from actual SDK, chain, and Subgraph friction; do not reduce safety acceptance to preserve the date.

### M2 — Safety-critical vertical slices (days 5–8)

#### A2 — Atomic at-most-once engine (Person A; blockers: A1 only)

What it delivers: duplicate deliveries and concurrent workers converge on one submission owner and at most one committed settlement in the fake-adapter system.

Work and acceptance:

- Implement transactional authorization-to-ready and ready-to-submitting compare-and-set transitions.
- Configure `submit_settlement` with one queue attempt and catch/classify all adapter results into durable states before returning.
- Prove one normal job, 10 sequential retries, 10 parallel workers, and two worker/agent instances produce exactly one external submission/commit.
- Kill before external call: zero settlement and safe retry. Kill after the boundary: durable `UNKNOWN` and no new submission.
- Preserve a committed Settlement when a downstream/supplier simulation fails.

#### B2 — Authorized Arc Testnet settlement (Person B; blockers: B1 only)

What it delivers: the adapter executes one policy-constrained testnet USDC settlement from the standalone harness and returns verified normalized evidence.

Work and acceptance:

- Provision the execution wallet, owner/key quorum, and one attached policy through a human-run setup procedure; write secrets only to ignored runtime storage/approved CI secrets.
- Test policy allow and deny cases against Arc Testnet: wrong chain, wrong contract/method, wrong recipient, above cap, non-zero native value, expired authorization.
- Submit via Privy with `eip155:5042002`, persisted idempotency key, and stable reference ID; capture Privy transaction ID/hash and Arc receipt.
- Prove one allowed transfer commits once and every denial produces zero settlement.
- Produce sanitized fixtures from real response shapes for Person A and C without exposing secrets.

#### C2 — UNKNOWN reconciliation engine (Person C; blockers: C1 only)

What it delivers: a deterministic read-only reconciliation decision engine resolves authoritative evidence or holds safely without ever submitting a payment.

Work and acceptance:

- Implement evidence precedence: durable committed record and verified Arc receipt are authoritative; Privy status locates provider activity; Graph corroborates/history only.
- Resolve verified receipt success to `COMMITTED` and final revert with matching identity to `FAILED_SAFE`.
- Keep `UNKNOWN` for pending, provider unavailable, RPC unavailable, Graph empty/lagging/unhealthy, identity mismatch, or contradictory evidence.
- Persist every observation with source, retrieval time, block height, health, and sanitized reason.
- Prove repeated reconciliation and duplicate webhook/provider events are idempotent and create zero submissions.

### M3 — Failure and operational hardening (days 9–12)

#### A3 — Restart-safe orchestration and auditability (Person A; blockers: A2 only)

What it delivers: the API/worker system recovers after process/database interruptions, exposes useful safe telemetry, and has a deterministic safe-disable path.

Acceptance:

- Restart after intent creation, job claim, `SUBMITTING` persistence, and adapter return; invariant holds at every point.
- Stale/orphaned work becomes reconciliation work, not a new submission lease.
- Structured logs carry Business Intent/Attempt IDs and state transitions but redact payload purpose as configured and never include credentials, authorization signatures, raw provider bodies, or private wallet material.
- Metrics cover state counts, transition failures, queue lag, UNKNOWN age, reconciliation outcomes, policy denials, and duplicate/conflict counts.
- A kill switch stops new submissions while status and reconciliation reads remain available.

#### B3 — Provider ambiguity and policy hardening (Person B; blockers: B2 only)

What it delivers: provider/RPC outcomes are conservatively classified across realistic failures and the policy remains effective after restart/config changes.

Acceptance:

- Inject DNS failure, connection refusal, timeout before response, truncated response, 429/5xx, malformed payload, lost success response, pending/evicted transaction, final revert, and mismatched receipt.
- Only documented, proven pre-broadcast failures become `DEFINITELY_NOT_SUBMITTED`; every doubtful result becomes `POSSIBLY_SUBMITTED`.
- Reusing the persisted Privy idempotency key and identical body is tested; its 24-hour limit is documented and never treated as permanent protection.
- Policy fingerprint/ID and expected restrictions are checked at readiness; mismatch fails closed.
- If webhooks are available, signature verification and duplicate/out-of-order delivery tests pass; otherwise polling remains complete and webhooks stay disabled.

#### C3 — Indexer lag, contradiction, and chaos evidence (Person C; blockers: C2 only)

What it delivers: recovery remains safe when The Graph or other evidence sources are delayed, empty, unhealthy, inconsistent, or unavailable.

Acceptance:

- Delay and empty The Graph results, set `hasIndexingErrors`, trail chain head, remove `_meta`, fail the query, and return duplicate/out-of-order events; none unlock a payment.
- Inject crash/lost response after possible submission and show the record remains `UNKNOWN` until authoritative evidence resolves it.
- Verify recovery evidence survives service restart and can be replayed for audit without provider secrets.
- Define UNKNOWN-age alerts and a human escalation runbook; the runbook never tells an operator to “just retry.”
- Produce a single command that runs the cross-source fixture matrix against the reconciliation package.

M3 exit: each owner passes their package suite and provides a versioned artifact plus fixtures. No cross-track package implementation is required to reach this exit.

### M4 — Integrated backend and live testnet proof (days 13–15)

This is the first cross-track convergence. Each person prepares against simulators immediately; only the final acceptance run waits for all three M3 artifacts.

#### A4 — Composition and migration integration (Person A)

- Wire production ports without importing provider details into the domain package.
- Run migrations from an empty database and from the previous schema; verify rollback/safe-disable behavior.
- Validate OpenAPI, generated contract fixtures, root lint/type/test/build, and service readiness.
- Own conflict resolution only in shared/root files; provider owners resolve their packages.

#### B4 — Live authorization/settlement evidence (Person B)

- Run one allowed Arc Testnet transfer through the integrated worker.
- Run policy-denied and above-cap intents and prove zero settlement.
- Capture sanitized transaction ID/hash, receipt, expected Transfer log, chain, policy identity, and explorer link for demo evidence.
- Trace an intentionally lost local response into `UNKNOWN` without permitting a second transaction.

#### C4 — Integrated reconciliation and matrix (Person C)

- Reconcile the lost-response scenario to the original final transaction using durable/Privy/Arc evidence.
- Demonstrate live Subgraph history with `_meta`, then simulate lag/empty/error and show safe behavior.
- Run the full `.agent/TEST_MATRIX.md` suite and publish a sanitized results table with durable state and external settlement count.
- Verify alerts and recovery-view output distinguish authoritative and indexed evidence.

M4 exit criteria:

- All lint, static analysis, type, unit, integration, contract, build, migration, and focused failure-injection checks pass from the repository root.
- Every required test-matrix row records stable ID, final durable state, and external settlement count.
- Real testnet happy path has exactly one committed settlement; denial paths have zero; ambiguous path has no duplicate.
- Backend API/OpenAPI and recovery semantics are frozen for the frontend. Breaking changes after this point use expand-migrate-contract.

### M5 — Frontend, last (days 16–18)

Frontend work starts only after M4 passes. All three slices use the frozen OpenAPI and mock server, so component work remains parallel.

#### F-A — Intent shell and status (Person A)

- App shell, service-auth handoff suitable for the demo environment, create-intent form, exact atomic-amount parsing/formatting, and status polling.
- Show replay and same-ID conflict clearly; never generate a new Business Intent ID on a retry unless the user starts a genuinely new obligation.
- Display only USDC, Arc Testnet, and six payment decimals; keep native gas details separate.

#### F-B — Authorization and settlement details (Person B)

- Policy scope summary, authorization denied state, submission/pending/final state, sanitized transaction details, and Arc explorer link.
- No bypass button and no “force pay” action. `UNKNOWN` disables new settlement submission.
- Do not show a confirmation counter: Arc is pending or final.

#### F-C — Recovery timeline and indexed history (Person C)

- Attempt/reconciliation timeline, authoritative local state, Privy/Arc evidence, Graph observations, indexed-through block/time, lag, and health.
- Empty Graph data is labeled “not observed through block N,” never “not paid.”
- UNKNOWN state provides safe explanation/escalation, not a retry shortcut.

M5 exit criteria:

- Browser tests cover create, identical replay, conflict, denial, committed, UNKNOWN, reconciliation, Graph lag/error, and service-unavailable paths.
- Accessibility smoke tests, responsive layout, lint/type/build, and no-secret/source-map checks pass.
- The UI cannot invoke an unguarded settlement path.

### M6 — Demo qualification and release candidate (days 19–20)

#### Person A — Invariant and operational demo

- Script duplicate requests, 10 parallel workers, restart, lost response, and downstream failure; show durable states and settlement count.
- Verify clean database bootstrap, safe-disable switch, logs/metrics, README, architecture diagram, and operator runbook.

#### Person B — Privy and Arc evidence

- Demonstrate policy-constrained corporate wallet execution, one real authorized USDC transfer on Arc Testnet, and zero-settlement denials.
- Record sanitized policy scope, transaction/receipt/Transfer proof, network, explorer URL, and limitations.

#### Person C — The Graph and recovery evidence

- Demonstrate live indexed Arc data in the recovery view and the same flow under delayed/empty/unhealthy indexed data.
- Run sponsor qualification against working code/tests/demo evidence and report each sponsor `QUALIFIED`, `NOT QUALIFIED`, or `NOT VERIFIED`; never promote missing evidence.

Release-candidate exit:

- Full test matrix and root checks pass on the exact candidate content.
- Secret scan and intended-file review pass; `.env*`, credentials, wallet material, and authorization responses are absent from review inputs.
- Each implementation change follows `.agent/IMPLEMENTATION_LOOP.md`: local checks, a fresh FreePi Gate A, draft PR to `develop`, green required CI, a separate fresh Gate B, then human review. Agents never merge.
- Demo can be reset and repeated using testnet-only funds without manual database surgery.

## 9. Test ownership matrix

| Required case | Primary owner | Independent harness | Integrated verifier |
| --- | --- | --- | --- |
| Normal job | A | Fake settlement counter | B |
| Same request twice / conflicting payload | A | HTTP + PostgreSQL | C observes recovery output |
| 10 sequential retries | A | Worker + fake port | B validates one adapter call |
| 10 parallel workers | A | Real PostgreSQL concurrency | C captures evidence timeline |
| Crash before submission | A | Worker kill point | B proves zero call |
| Crash after possible submission | B | Adapter fault point | C reconciles; A verifies state |
| Lost payment response | B | Proxy/fixture fault | C resolves original transaction |
| Graph delay or absence | C | Graph simulator | A verifies no submission grant |
| Privy denial / above policy | B | Policy testnet harness | A verifies zero settlement |
| Service restart | A | Process orchestration | C verifies evidence durability |
| Downstream failure after payment | A | Supplier fake | B verifies original receipt retained |
| Two agent instances | A | Two workers/processes | C verifies one settlement history |

The primary owner builds the failure fixture and focused proof. Integrated verification is a Milestone 4 responsibility, not a prerequisite for the owner to finish M1–M3.

## 10. Branching, review, and merge train

- Do not implement product code on `agents-setup`, `develop`, or `main`. Once this planning/infrastructure change is human-merged to `develop`, create short-lived `milestone/a-*`, `milestone/b-*`, and `milestone/c-*` branches from the same `develop` SHA.
- One branch/PR delivers one task above. Within M1–M3, each branch is blocked only by the prior branch in the same lettered track.
- Merge independent package PRs before root composition. If two changes touch a shared contract, use expand-migrate-contract: add the new form, migrate all consumers in independent PRs, then remove the old form.
- Only Person A edits root composition files during M4. Persons B/C supply reviewed package commits and fixtures, preventing three-way conflicts.
- Every PR lists exact blockers, acceptance evidence, selected test-matrix cases, invariant impact, safe-disable strategy, and both required review gates.
- A human controls merge order and performs every merge.

## 11. Human-only configuration plan

Person B owns a repeatable interactive setup wizard after B1 fixes the variable contract. It must guide a human through Privy application/wallet/key-quorum/policy creation, Arc testnet funding, The Graph Studio deployment credentials, and CI secret entry. It must:

- Open current official URLs before each instruction.
- Capture secrets with hidden input and write them only to ignored `.env` or approved CI secrets.
- Keep public chain/contract/deployment identifiers in non-secret variables.
- Confirm before policy replacement, wallet ownership change, funding, deployment, or any irreversible action.
- Be statically validated but never run end to end by an agent without the human.

The backend must still boot in fake/local mode with no third-party credentials, so configuration work never blocks Persons A or C.

## 12. Observability and safe operation

- Correlation keys: Business Intent ID, Attempt ID, settlement version, Privy reference/transaction ID, Arc transaction hash, and Graph deployment/indexed block. Never log authorization signatures, credentials, private keys, or raw sensitive payloads.
- Alerts: oldest UNKNOWN age, count of UNKNOWN intents, repeated reconciliation failures, Graph block lag/health, policy denials, provider/RPC failure rate, queue lag, and state-transition conflicts.
- Safe disable: stop accepting/claiming new settlement submissions while keeping GET status, evidence ingestion, and reconciliation reads operational.
- Manual escalation: operators inspect durable request identity and evidence; there is no generic retry button. Any future override requires a separate audited design and is outside this plan.

## 13. Risks and mitigations

| Risk | Mitigation / fail-closed response | Owner |
| --- | --- | --- |
| Privy idempotency expires after 24 hours | Durable OneShot constraint remains authoritative; reuse stored key/body only as supplemental protection | A/B |
| SDK or policy syntax changes | Pin after B1 compatibility test; readiness verifies policy ID/fingerprint and network; deny on mismatch | B |
| Arc native/ERC-20 precision confusion or double counting | Settlement uses six-decimal ERC-20 only; native balance is gas; verify one canonical Transfer identity | B/C |
| Lost response or process crash after broadcast | Persist request identity before call, enter UNKNOWN, reconcile, forbid new nonce/payment | All |
| Arc transaction pending/evicted with no receipt | Hold UNKNOWN; no automatic replacement in v1; escalate after threshold | B/C |
| Graph lag, error, endpoint version drift, or empty result | Query `_meta`, compare chain head, pin deployment for demo, label stale/unhealthy, never authorize from absence | C |
| Queue redelivery | One queue attempt for submission, domain CAS/unique constraints, idempotent reconciliation | A |
| Shared-file merge conflicts | File ownership plus independent package commands; root composition owned by A | A |
| Credential/setup delays | Fakes unblock all tracks; human wizard and live setup occur in B2, before M4 | B |
| Schedule pressure | Preserve safety acceptance; cut optional webhooks, rolling policies, visual polish, and nonessential telemetry first | All |

## 14. Definition of done for every implementation task

- Outcome and non-goals match the task above; no hidden follow-up is required for claimed behavior.
- Public-seam test is written red first, then the smallest vertical behavior is implemented; tests avoid private implementation coupling.
- Relevant unit, contract, integration, concurrency, failure-injection, migration, lint, type, and build checks pass.
- Durable state and external settlement count are asserted where money or retries are involved.
- Security boundaries, input validation, integer money, logging redaction, testnet restriction, and safe-disable behavior are reviewed.
- Documentation, OpenAPI/fixtures, runbooks, and `.env.example` are updated without secrets.
- The branch/diff is focused and passes the repository's FreePi/CI/human-review policy. No agent merges.

## 15. First implementation actions after plan approval

1. Human merges the planning/agent-infrastructure change to `develop`; record the exact base SHA.
2. All three people complete M0 together and create their independent branches/worktrees.
3. Person A starts A1; Person B starts B1; Person C starts C1 simultaneously.
4. Hold one 15-minute daily contract check limited to proposed breaking changes, UNKNOWN classification, and risks. Status reporting must not become an approval dependency.
5. At M1 exit, re-estimate the calendar from evidence while preserving M2–M6 acceptance criteria and the rule that frontend remains last.
