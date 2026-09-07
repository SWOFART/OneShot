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
   - Discovers candidate settlements via Subgraph MCP queries without granting autonomous settlement permission to AI models.

## Composition Profiles

### 1. `simulator` Profile (Default for A01–A04)

- **Settlement**: `SimulatorSettlementPort` (`@oneshot/worker/composition`)
- **Authorization**: `SimulatorAuthorizationPort` (`@oneshot/worker/composition`)
- **Domain Core**: `DeterministicDomainSimulator` (`@oneshot/testkit-domain`)
- **Reconciliation**: Deterministic scenario harness (`@oneshot/reconciliation`)

### 2. `production` Profile (Targeted for Gate P4 Convergence)

- **Settlement**: Arc Settlement Adapter (`@oneshot/adapter-arc`, owned by Coder B)
- **Authorization**: Privy Authorization Adapter (`@oneshot/adapter-privy`, owned by Coder B)
- **Reconciliation**: Subgraph MCP Recovery Engine (`@oneshot/reconciliation-subgraph`, owned by Coder C)

## Environment Configuration

| Variable                       | Default          | Purpose                                                    |
| ------------------------------ | ---------------- | ---------------------------------------------------------- |
| `ONESHOT_PROFILE`              | `simulator`      | Active composition profile (`simulator` or `production`)   |
| `ONESHOT_NETWORK`              | `eip155:5042002` | Expected CAIP-2 blockchain network identifier              |
| `ONESHOT_CONTRACT_VERSION`     | `1.0.0`          | Frozen contract interface version                          |
| `ONESHOT_SUBMISSIONS_DISABLED` | `false`          | Safe disable switch pausing new submission ownership       |
| `ONESHOT_SUBMISSION_LEASE_MS`  | `30000`          | Lease duration before orphaned `SUBMITTING` intents expire |

The executable API runtime and its PostgreSQL/Cloud SQL configuration are documented
in [`SERVER_RUNTIME.md`](SERVER_RUNTIME.md). Runtime hosting does not freeze the
frontend contract or release the P4 frontend gate.

## Readiness Verification

The readiness probe (`GET /health/ready`) verifies:

1. PostgreSQL database connection liveness (`IntentLedger.ping()`).
2. Configured network identity matches `eip155:5042002`.
3. Injected port adapter contract versions strictly equal `1.0.0`.
4. Injected port adapter network matches `eip155:5042002`.
