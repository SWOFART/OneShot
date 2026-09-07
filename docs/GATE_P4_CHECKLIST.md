# Gate P4 Backend Convergence and Replacement Checklist

## Objective

Gate P4 is the project convergence point where backend milestones across all three coders converge:

- **Coder A**: A04 (Restart safety, operations, simulator composition)
- **Coder B**: B04 (Settlement adapter, Privy authorization, error taxonomy)
- **Coder C**: C04 (Recovery matrix integration, Subgraph MCP engine)

At Gate P4, checked simulators are replaced with real reviewed package versions, and integrated end-to-end proofs are executed before frontend milestones (A05/B05/C05) commence.

## Package Version Slots

| Slot | Planned Package | Owning Lane | Current State in A04 |
| --- | --- | --- | --- |
| Core Contracts | `@oneshot/contracts@0.1.0` | Shared / Frozen | Pinned |
| Domain Models | `@oneshot/domain@0.1.0` | Lane A | Pinned |
| PostgreSQL Storage | `@oneshot/storage-postgres@0.1.0` | Lane A | Pinned (Schema Digest: `5d5888894ff0f4f44049579f1c8ffca2a24e0b61c3af65aabdbcd78f06020d65`) |
| Settlement Worker | `@oneshot/worker@0.1.0` | Lane A | Composed |
| Arc Settlement Adapter | `@oneshot/adapter-arc` | Lane B | Simulated via `SimulatorSettlementPort` |
| Privy Authorization Adapter | `@oneshot/adapter-privy` | Lane B | Simulated via `SimulatorAuthorizationPort` |
| Subgraph MCP Recovery | `@oneshot/reconciliation` | Lane C | Simulated via `c01-simulator-v1` scenarios |

## Replacement Instructions for Gate P4

1. **Replace Settlement Port**:
   - In `apps/worker/src/composition.ts`, update `composeWorker`:
   - Set `profile: 'production'`.
   - Inject instance of `ArcSettlementAdapter` conforming to `SettlementPort`.
   - Verify contract version `1.0.0` and network `eip155:5042002`.

2. **Replace Authorization Port**:
   - Inject instance of `PrivyAuthorizationAdapter` conforming to `AuthorizationPort`.
   - Verify contract version `1.0.0`.

3. **Replace Recovery Engine**:
   - Wire `SubgraphMcpRecoveryEngine` into `reconcile_intent` task in `createTaskList`.

## Verification Commands

Run the full verification matrix to validate integrated convergence:

```bash
# 1. Workspace dependencies and hygiene
pnpm install --frozen-lockfile
pnpm check:generated
pnpm validate:fixtures

# 2. Code standards and type safety
pnpm format:check
pnpm lint
pnpm typecheck

# 3. Unit, contract, and offline integration suites
pnpm test

# 4. Containerized PostgreSQL integration suite
TEST_POSTGRES=1 pnpm test:integration

# 5. Markdown documentation linting
npx markdownlint-cli2 "**/*.md" "#node_modules"
```
