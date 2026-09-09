# Gate P4 Manifest: Backend Convergence and Frozen Frontend Boundary

## Objective and Convergence Status

Gate P4 represents the backend convergence boundary across all three coders (A04 restart safety & worker composition, B04 settlement adapter & Privy authorization, C04 recovery matrix & Subgraph MCP) and establishes the frozen HTTP seam for frontend milestones (A05, B05, C05).

All checked simulators in production worker composition are replaced with real reviewed package entry points, and the OpenAPI v1 contract seam is frozen with additive sanitized fields, versioned mock server, and validated UI fixtures.

| Scope | Status | Meaning |
| --- | --- | --- |
| Backend package composition | `COMPLETE` | Reviewed package entry points are wired into the production composition boundary. |
| Frontend contract boundary | `FROZEN` | OpenAPI v1, fixtures, and mock-server semantics are published. |
| Privy authorization and Arc settlement proof | `LIVE_VERIFIED` | The checked-in sanitized evidence proves the recorded Arc Testnet transaction and denial drills. |
| Hashless Graph MCP and model recovery proof | `LIVE_VERIFIED` | Pinned live Studio Subgraph queried via Subgraph MCP, analyzed by Vertex AI Gemini 2.5 Flash, verified by Arc RPC with 0 duplicate broadcasts. |
| Overall Gate P4 | `PASS` | All backend composition, frozen frontend contracts, and live settlement/recovery proofs are complete. |

## Package Version Slots

| Slot | Planned Package | Owning Lane | Gate P4 State | Pinned Identifier / Digest |
| --- | --- | --- | --- | --- |
| Core Contracts | `@oneshot/contracts@0.1.0` | Shared / Frozen | Pinned & Regenerated | Schema Digest: `4e1fd12de4ee2cb268774437e6adf1b4939e16d2be44e50553b555e7945847e0`<br>OpenAPI Digest: `f639e2d2729cd061d606cd35eb83961c58067a3660ecc5437c0f4596c88edc2c`<br>Mock Server: `1.0.0` |
| Domain Models | `@oneshot/domain@0.1.0` | Lane A | Pinned | Contract v1 compliant |
| PostgreSQL Storage | `@oneshot/storage-postgres@0.1.0` | Lane A | Pinned | Schema Digest: `5d5888894ff0f4f44049579f1c8ffca2a24e0b61c3af65aabdbcd78f06020d65` |
| Settlement Worker | `@oneshot/worker@0.1.0` | Lane A | Converged | Production profile wired with Lane B and C adapters |
| Arc Settlement Adapter | `@oneshot/privy-adapter` (`ArcSettlementAdapter`) | Lane B | Integrated & Wired | Pinned Arc testnet `eip155:5042002` |
| Privy Authorization Adapter | `@oneshot/privy-adapter` (`PrivyAuthorizationAdapter`) | Lane B | Integrated & Wired | Policy authorization `1.0.0` |
| Subgraph MCP Recovery | `@oneshot/reconciliation` (`RecoveryService`) | Lane C | Integrated & Live-Verified | Wired via `recovery-bridge` over durable `IntentLedger`; live Subgraph MCP + Vertex AI Gemini recovery verified |
| Recovery UI Components | `@oneshot/recovery-ui@0.1.0` | Lane C | Pinned | Mock Server `1.0.0` |

## Frozen Frontend Boundary (OpenAPI v1)

### Endpoints and Invariants

The OpenAPI v1 contract seam exposes exactly the following 6 paths:

1. `POST /v1/intents`: Create or idempotent replay of a Business Intent (202 Accepted, 200 OK replay, 409 Conflict).
2. `GET /v1/intents/{id}`: Read authoritative intent state and evidence observations.
3. `POST /v1/intents/{id}/reconcile`: Queue read-only reconciliation without submitting replacement settlement (409 if terminal state).
4. `GET /v1/intents/{id}/recovery-view`: Read authority-labelled recovery evidence and recommended actions (`WAIT`, `RECONCILE`, `ESCALATE`, `RETURN_EXISTING_RESULT`).
5. `GET /health/live`: Process liveness check.
6. `GET /health/ready`: Database, configuration, and Arc identity readiness probe.

**Critical Contract Invariant**: Zero endpoints allow blind settlement retries. Any `/retry` path is strictly absent and rejected.

### Additive Sanitized Fields for B05

To support the B05 frontend milestone without breaking existing consumers or contract invariants, the following additive fields are frozen in OpenAPI v1:

- `IntentResponse.policy`: Optional `PolicySummaryView` containing `policy_id`, `status` (`CONFIGURED` | `EXCEEDED` | `NOT_CONFIGURED` | `UNKNOWN`), `settlement_cap_atomic`, and `allowed_recipients`.
- `AttemptView.authorization_status`: Optional `AuthorizationStatus` (`CHECKING` | `AUTHORIZED` | `DENIED` | `UNAVAILABLE` | `CONFIG_MISMATCH`).
- `SettlementView.token_contract`: Optional EVM contract address (`0x...`).
- `SettlementView.explorer_url`: Optional block explorer URI for the settled transaction.

## Versioned Mock Server

The versioned mock server is published directly in `@oneshot/contracts`:

- **Version**: `OPENAPI_MOCK_SERVER_VERSION = '1.0.0'`
- **Header**: Every mock response emits `x-oneshot-mock-version: 1.0.0`.
- **Exports**:
  - `handleOpenApiMockRequest(url, method, body, state)`: Pure deterministic request dispatcher.
  - `createOpenApiMockFetch(state)`: `fetch`-compatible mock router for Node and browser environments.
  - `createOpenApiMockClient(options)`: Strongly-typed mock API client for frontend milestones.
  - `UI_FIXTURES`: Typed in-memory scenarios covering all frozen states.

## Sanitized UI Fixtures

Published under `packages/contracts/fixtures/ui/v1/`:

1. `authorized-committed.json`: Fully settled intent on Arc testnet (`COMMITTED`), containing policy, settlement explorer link, and authoritative Arc/Privy observations.
2. `auth-checking.json`: Pending intent undergoing Privy policy authorization (`AUTHORIZING`, attempt `CHECKING`).
3. `auth-denied-recipient.json`: Rejected intent due to recipient not present on allowlist (`REJECTED`, `DENIED`).
4. `auth-cap-exceeded.json`: Rejected intent due to requested amount exceeding spending cap (`REJECTED`, `DENIED`, policy `EXCEEDED`).
5. `auth-unavailable.json`: Safe-failed intent due to authorization service unavailability (`FAILED_SAFE`, attempt `UNAVAILABLE`).
6. `auth-config-mismatch.json`: Rejected intent due to policy configuration mismatch (`REJECTED`, `CONFIG_MISMATCH`).
7. `unknown-reconcile-only.json`: Ambiguous intent post-broadcast timeout (`UNKNOWN`), requiring read-only reconciliation with lagging Graph evidence.

All fixtures are verified free of sensitive keys and conform to the published JSON Schema bundle via `pnpm validate:fixtures`.

## Privy and Arc Testnet Evidence Status

Per `plan.md` (procedure steps 8-13):

- **Verification Status**: `LIVE_VERIFIED` for Privy authorization and Arc settlement only. This is not an overall Gate P4 verdict.
- **Human Provisioning (Step 8)**: Completed per `docs/settlement/PROVIDER_SETUP.md` with Privy app `cmtqbf5zo013w0cky3r0jqjca`, server execution wallet `0xfCC366c88A0c980e2FD5a7Cf7a36494E4457D943`, policy `balx3rtrpns3gnvhz3n32dml`, and funded Arc Testnet account.
- **Live Settlement Drill (Step 9)**: Executed and confirmed on Arc Testnet (`eip155:5042002`).
  - Transaction Hash: `0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7`
  - Block Number: `61116056` (Hash: `0xc2e18d2ee52e8e046a5f70329265aba27285f7d257bb765d417a7c5613bf4b1b`)
  - Transfer Event: Confirmed at log index `23` (`1000000` atomic units USDC transferred to `0xa605EE031E41f04f8e193059a39A24407f83677c`).
  - Explorer Proof: [https://testnet.arcscan.app/tx/0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7](https://testnet.arcscan.app/tx/0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7)
- **Live Policy Denial Drills (Step 10)**:
  - Unauthorized recipient (`0x1111...`) &rarr; HTTP 400 `policy_violation`, 0 broadcasts, 0 settlements.
  - Above-cap amount (`2000000` > `1000000`) &rarr; HTTP 400 `policy_violation`, 0 broadcasts, 0 settlements.
  - Nonce remained `0`, proving zero unauthorized on-chain transactions.
- **Lost-Hash & Lost-Response Recovery Drill (Step 11)**:
  - Simulated worker crash after broadcast: intent marked `UNKNOWN`.
  - Authoritative read-only reconciliation via `verifyReceipt`: transitioned state to `COMMITTED`.
  - External replacement submissions: **0**.
  - Idempotent replay: returned `200 REPLAYED` with 0 duplicate broadcasts, preserving the strict `1 intent -> at most 1 settlement` invariant.
- **Degraded Matrix Verification (Step 12)**:
  - All 6 test suites and 74 tests in `@oneshot/reconciliation` passed. Fail-closed behavior verified under degraded Subgraph MCP, indexer lag, and conflicting model advice.
- **Evidence References**:
  - Live settlement proof: `evidence/c06/sanitized-proof.json`
  - Live Graph recovery proof: `evidence/c06/graph-proof.json`
  - Settlement evidence log: `docs/settlement/LIVE_EVIDENCE.md`
  - Qualification report: `packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md`

## Gate P4 Live Proof Verification

- **Verification Status**: `LIVE_VERIFIED`
- Pinned immutable OneShot/Arc Subgraph deployment `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7` (`0x0d469664a45efc2483abb0e4d35e8ed02db0064c2c50dc0cdf855ff6ad6690c0`) queried through live Subgraph Studio endpoint via Subgraph MCP (`execute_query_by_deployment_id`) for a lost-hash recovery case.
- Recorded the deployment, query, variables digest, retrieval identity, `_meta` health/freshness (`FRESH`), and candidate count (`1`) without credentials.
- Fed the sanitized candidate result to Vertex AI Gemini 2.5 Flash structured-output model adapter, capturing its bounded recommendation (`RECONCILE`), decision ID (`dec-a83a0050...`), reason, and referenced evidence ID.
- The deterministic OneShot safety core validated the recommendation, verified the candidate through authoritative Arc block `61116056` receipt and Transfer log index 23 evidence, and committed the settlement.
- Proved zero new settlement submissions throughout empty, delayed, malformed, multiple-candidate, invalid-model-output, and successful-existing-result cases (`settlementPermission: NEVER`, `externalSubmissionCount: 0`).
- Gate P4 backend convergence, frozen frontend contracts, and live settlement/recovery verification across Privy, Arc, and The Graph are complete.
