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
| Arc Settlement Adapter | `@oneshot/privy-adapter` (`ArcSettlementAdapter`) | Lane B | Simulated via `SimulatorSettlementPort` |
| Privy Authorization Adapter | `@oneshot/privy-adapter` (`PrivyAuthorizationAdapter`) | Lane B | Simulated via `SimulatorAuthorizationPort` |
| Subgraph MCP Recovery | `@oneshot/reconciliation` | Lane C | Simulated via `c01-simulator-v1` scenarios |

Both lane-B adapters ship from `@oneshot/privy-adapter` rather than from
separate packages: settlement is a Privy wallet action carrying an Arc
transfer, so splitting them would put half of one call path in each package.
`@oneshot/arc-adapter` holds the Arc profiles, money, receipt verification, and
readiness probing they build on. See
`docs/settlement/GATE_P4_LANE_B_READINESS.md` for the injection recipe.

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

4. **Freeze the frontend boundary**:
   - Revalidate the A01 OpenAPI v1 artifact against the composed backend.
   - Freeze recovery-view semantics and sanitized UI fixtures.
   - Publish a versioned mock server that serves the frozen OpenAPI behavior.
   - Keep A05, B05, and C05 blocked until this step and the integrated proofs pass.

## Verification Commands

The Arc, Privy, and settlement testkit packages are full members of the root
pnpm workspace and are covered by the root `lint`, `typecheck`, `build`, and
`vitest` runs. The separate `settlement-packages` CI job and their package-local
npm toolchains were removed when they were consolidated, ahead of P4 rather than
during it, because their npm lockfiles broke `pnpm install --frozen-lockfile` on
`develop`.

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
