# OneShot Backend Composition Manifest

## Purpose

This manifest defines the dependency injection wiring, port interfaces, and composition profiles for the OneShot backend (Milestone A04). It establishes the frozen interfaces behind which real partner adapters (Arc, Privy, The Graph) compose at Gate P4.

## Frozen Port Interfaces

All ports conform to frozen definitions in `@oneshot/contracts`:

1. **Settlement Port (`SettlementPort`)**:
   - Method: `submit(request: CreateIntentRequest, context: SettlementContext): Promise<SettlementResult>`
   - Contract Version: `1.0.0`
   - Supported Network: `eip155:5042002` (Arc Testnet)
   - Invariant: Called exclusively outside database transactions after atomic compare-and-set claim.

2. **Authorization Port (`AuthorizationPort`)**:
   - Method: `authorize(request: CreateIntentRequest): Promise<AuthorizationResult>`
   - Contract Version: `1.0.0`
   - Invariant: Enforces corporate spending limits and recipient policies before advancing intent to `READY`.

3. **Reconciliation / Recovery Port (`RecoveryPort`)**:
   - Contract Version: `c01-simulator-v1`
   - Discovers candidate settlements through the configured Graph provider
     (Studio GraphQL for Arc Testnet; optional Subgraph MCP) without granting
     autonomous settlement permission to AI models.

## Composition Profiles

### 1. `simulator` Profile (Test and fixture profile)

- **Settlement**: `SimulatorSettlementPort` (`@oneshot/worker/composition`)
- **Authorization**: `SimulatorAuthorizationPort` (`@oneshot/worker/composition`)
- **Domain Core**: `DeterministicDomainSimulator` (`@oneshot/testkit-domain`)
- **Reconciliation**: Deterministic scenario harness (`@oneshot/reconciliation`)

The simulator profile is used by tests and invariant scenarios. The executable
worker runtime composes the `production` profile after validating external
configuration; it does not select the simulator through an environment default.

### 2. `production` Profile (Active executable runtime)

- **Settlement**: `ArcSettlementAdapter` (`@oneshot/privy-adapter`, owned by Coder B)
- **Authorization**: `PrivyAuthorizationAdapter` (`@oneshot/privy-adapter`, owned by Coder B)
- **Reconciliation**: `RecoveryService` with the provider-neutral Graph adapter
  (`@oneshot/reconciliation`, Studio GraphQL active for Arc Testnet; MCP optional)

## Environment Configuration

| Variable                       | Default          | Purpose                                                    |
| ------------------------------ | ---------------- | ---------------------------------------------------------- |
| `ONESHOT_ARC_PROFILE`          | required         | Enabled, pinned Arc profile; `arc-testnet` is the current supported profile |
| `ONESHOT_ARC_RPC_URL`          | required         | HTTPS JSON-RPC endpoint for the selected Arc profile       |
| `ONESHOT_SUBMISSIONS_DISABLED` | `false`          | Safe disable switch pausing new submission ownership       |
| `ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST` | `false` | R4 testnet-only one-shot post-broadcast response-loss hook |
| `ONESHOT_DEMO_CONFIRM_TESTNET` | required for hook | Explicit confirmation for the reviewed testnet drill |
| `ONESHOT_SUBMISSION_LEASE_MS`  | `30000`          | Lease duration before orphaned `SUBMITTING` intents expire |
| `ONESHOT_SUBGRAPH_SOURCE`      | source-dependent | `STUDIO_GRAPHQL` or `SUBGRAPH_MCP` recovery source         |
| `ONESHOT_SUBGRAPH_QUERY_URL` / `ONESHOT_SUBGRAPH_MCP_ENDPOINT` | source-dependent | Required endpoint for the selected source |

The complete worker runtime contract, including Privy, recipient, recovery, and
Vertex settings, is maintained in [`.env.example`](../.env.example) and
`apps/worker/src/runtime-config.ts`. The executable API runtime and its
PostgreSQL/Cloud SQL configuration are documented in
[`SERVER_RUNTIME.md`](SERVER_RUNTIME.md).

## Readiness Verification

The readiness probe (`GET /health/ready`) verifies:

1. PostgreSQL database connection liveness (`IntentLedger.ping()`).
2. Configured network identity matches `eip155:5042002`.
3. Injected port adapter contract versions strictly equal `1.0.0`.
4. Injected port adapter network matches `eip155:5042002`.
