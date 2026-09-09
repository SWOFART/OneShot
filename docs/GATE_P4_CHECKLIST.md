# Gate P4 Backend Convergence and Replacement Checklist

## Objective

Gate P4 is the project convergence point where backend milestones across all three coders converge:

- **Coder A**: A04 (Restart safety, operations, simulator composition)
- **Coder B**: B04 (Settlement adapter, Privy authorization, error taxonomy)
- **Coder C**: C04 (Recovery matrix integration, Subgraph MCP engine)

At Gate P4, checked simulators are replaced with real reviewed package versions,
the frontend contract is frozen, and the integrated live proofs required by the
plan are executed. Composition, contract freeze, and live settlement/recovery
proofs across Privy, Arc, and The Graph are complete. Gate P4 is PASS.

## Package Version Slots

| Slot | Planned Package | Owning Lane | Current State in Gate P4 |
| --- | --- | --- | --- |
| Core Contracts | `@oneshot/contracts@0.1.0` | Shared / Frozen | Pinned |
| Domain Models | `@oneshot/domain@0.1.0` | Lane A | Pinned |
| PostgreSQL Storage | `@oneshot/storage-postgres@0.1.0` | Lane A | Pinned (Schema Digest: `5d5888894ff0f4f44049579f1c8ffca2a24e0b61c3af65aabdbcd78f06020d65`) |
| Settlement Worker | `@oneshot/worker@0.1.0` | Lane A | Composed & Converged |
| Arc Settlement Adapter | `@oneshot/privy-adapter` (`ArcSettlementAdapter`) | Lane B | Integrated & Wired in Production Profile |
| Privy Authorization Adapter | `@oneshot/privy-adapter` (`PrivyAuthorizationAdapter`) | Lane B | Integrated & Wired in Production Profile |
| Subgraph MCP Recovery | `@oneshot/reconciliation` | Lane C | Integrated & Live-Verified |

Both lane-B adapters ship from `@oneshot/privy-adapter` rather than from
separate packages: settlement is a Privy wallet action carrying an Arc
transfer, so splitting them would put half of one call path in each package.
`@oneshot/arc-adapter` holds the Arc profiles, money, receipt verification, and
readiness probing they build on. See
`docs/settlement/GATE_P4_LANE_B_READINESS.md` for the injection recipe.

## Replacement Instructions for Gate P4

1. **Replace Settlement Port**: [COMPLETED]
   - In `apps/worker/src/composition.ts`, updated `composeWorker`:
   - Set `profile: 'production'`.
   - Conformance-verified and wired injection support for real `ArcSettlementAdapter` conforming to `SettlementPort`.
   - Verified contract version `1.0.0` and network `eip155:5042002`.

2. **Replace Authorization Port**: [COMPLETED]
   - Conformance-verified and wired injection support for real `PrivyAuthorizationAdapter` conforming to `AuthorizationPort`.
   - Verified contract version `1.0.0`.

3. **Replace Recovery Engine**: [COMPLETED]
   - Followed `packages/reconciliation/docs/GATE_P4_RECOVERY_REPLACEMENT.md`.
   - Injected `RecoveryService` into the `reconcile_intent` task in `createTaskList`.
   - Bridged `LocalRecoveryStatePort`, `RecoveryCommandStorePort` over `IntentLedger` (with durable `outbox_jobs` deduplication and real `UNKNOWN` CAS transitions), and `KnownIdentityEvidencePort` via `PrivyArcEvidenceBridge` in `apps/worker/src/recovery-bridge.ts`.
   - Provided `createProductionRecoveryService` in `apps/worker/src/composition.ts` for full production worker recovery composition.
   - Kept A-owned persistence behind `RecoveryCommandStorePort`; the recovery package does not write A tables.

4. **Freeze the frontend boundary**: [COMPLETED]
   - Revalidated the A01 OpenAPI v1 artifact against the composed backend with additive sanitized fields (`policy` summary, attempt `authorization_status`, settlement `token_contract`, and `explorer_url`).
   - Froze recovery-view semantics and published sanitized UI fixtures in `packages/contracts/fixtures/ui/v1/`.
   - Published versioned OpenAPI mock server (`OPENAPI_MOCK_SERVER_VERSION = '1.0.0'`) in `@oneshot/contracts`.
   - Published sanitized Gate P4 manifest in `docs/GATE_P4_MANIFEST.md`.
   - Frontend milestones (A05, B05, C05) unblocked to build on frozen contracts and mock server.

5. **Prove live hashless recovery**: [COMPLETED]
   - Pinned canonical immutable OneShot/Arc Subgraph deployment `Qma8SKdatVjuwYzrZsHK4ZqVR2MGX8m4BxQFu6PqzXwHLi` (`0xaf2b444e...`) in Subgraph Studio.
   - Queried it through live Subgraph Studio endpoint via Subgraph MCP (`execute_query_by_deployment_id`).
   - Passed sanitized candidate view to Vertex AI Gemini 2.5 Flash structured-output model adapter.
   - Recorded bounded model action (`RECONCILE`), referenced evidence (`thegraph:0x72ab1e...`), deterministic-core disposition (`MARK_COMMITTED`), Arc verification on block `61116056`, and zero external replacement submissions (`settlementPermission: NEVER`).
   - Recorded live proof in `evidence/c06/sanitized-proof.json`, updated The Graph to `QUALIFIED`, and marked Gate P4 `PASS`.

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
