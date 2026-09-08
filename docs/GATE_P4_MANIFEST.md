# Gate P4 Manifest: Backend Convergence and Frozen Frontend Boundary

## Objective and Convergence Status

Gate P4 represents the backend convergence boundary across all three coders (A04 restart safety & worker composition, B04 settlement adapter & Privy authorization, C04 recovery matrix & Subgraph MCP) and establishes the frozen HTTP seam for frontend milestones (A05, B05, C05).

All checked simulators in production worker composition are replaced with real reviewed package entry points, and the OpenAPI v1 contract seam is frozen with additive sanitized fields, versioned mock server, and validated UI fixtures.

## Package Version Slots

| Slot | Planned Package | Owning Lane | Gate P4 State | Pinned Identifier / Digest |
| --- | --- | --- | --- | --- |
| Core Contracts | `@oneshot/contracts@0.1.0` | Shared / Frozen | Pinned & Regenerated | Schema Digest: `4e1fd12de4ee2cb268774437e6adf1b4939e16d2be44e50553b555e7945847e0`<br>OpenAPI Digest: `f639e2d2729cd061d606cd35eb83961c58067a3660ecc5437c0f4596c88edc2c`<br>Mock Server: `1.0.0` |
| Domain Models | `@oneshot/domain@0.1.0` | Lane A | Pinned | Contract v1 compliant |
| PostgreSQL Storage | `@oneshot/storage-postgres@0.1.0` | Lane A | Pinned | Schema Digest: `5d5888894ff0f4f44049579f1c8ffca2a24e0b61c3af65aabdbcd78f06020d65` |
| Settlement Worker | `@oneshot/worker@0.1.0` | Lane A | Converged | Production profile wired with Lane B and C adapters |
| Arc Settlement Adapter | `@oneshot/privy-adapter` (`ArcSettlementAdapter`) | Lane B | Integrated & Wired | Pinned Arc testnet `eip155:5042002` |
| Privy Authorization Adapter | `@oneshot/privy-adapter` (`PrivyAuthorizationAdapter`) | Lane B | Integrated & Wired | Policy authorization `1.0.0` |
| Subgraph MCP Recovery | `@oneshot/reconciliation` (`RecoveryService`) | Lane C | Integrated & Wired | Wired via `recovery-bridge` over durable `IntentLedger` |
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

## Testnet Evidence Mode Verification Status

Per `docs/plan.md` (procedure steps 8-12):

- Local offline verification, simulated external adapter composition, empty/upgrade migrations, and safe-disable checks have passed.
- Testnet evidence mode configuration is documented in `docs/settlement/SETTLEMENT_CONFIG_V1.md` and `docs/settlement/GATE_P4_LANE_B_READINESS.md`.
- Live testnet wallet funding and live transaction execution remain gated on explicit human authorization per repository safety rules. No live keys or secret seeds are stored in the repository.
