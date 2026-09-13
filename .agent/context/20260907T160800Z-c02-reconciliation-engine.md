# Session Context: C02 LLM Recovery Agent and Deterministic Reconciliation

## Date/time

- UTC: 2026-09-07T16:08:00Z

## User goal

Implement Coder C Milestone C02: LLM Recovery Agent and Deterministic Reconciliation.
Build the RecoveryAdvisorPort contract, deterministic LLM recovery agent simulator, deterministic recovery safety core, safe reconciliation command vocabulary, provenance-labeled recovery view, and exhaustive idempotency/safety test matrix. Zero payment submission capability by construction.

## Key decisions

- Built bounded 4-action advisory contract (`WAIT`, `RECONCILE`, `ESCALATE`, `RETURN_EXISTING_RESULT`).
- Input to RecoveryAdvisorPort strictly labels candidate observations as untrusted data (`UNTRUSTED_DATA_NOTICE`) and strips secrets, keys, and credentials.
- Prompt injection defense, unknown actions, and fabricated evidence IDs fail closed to `WAIT`.
- Deterministic safety core requires verified final Arc on-chain proof before any intent can transition to `COMMITTED`. Advisory `RETURN_EXISTING_RESULT` without independent Arc proof is safely overridden to `HOLD_UNKNOWN`.
- Settlement permission is `'NEVER'` across all outputs; package imports no private A/B modules and makes no `SettlementPort` calls.

## Files touched/created

- `packages/reconciliation/src/types.ts`
- `packages/reconciliation/src/evidence-model.ts`
- `packages/reconciliation/src/agent-contract.ts`
- `packages/reconciliation/src/safety-core.ts`
- `packages/reconciliation/src/agent-simulator.ts`
- `packages/reconciliation/src/index.ts`
- `packages/reconciliation/schemas/recovery-advisor-v1.schema.json`
- `packages/reconciliation/schemas/reconciliation-command-v1.schema.json`
- `packages/reconciliation/schemas/recovery-view-v1.schema.json`
- `packages/reconciliation/fixtures/v1/agent/*`
- `packages/reconciliation/docs/recovery-action-matrix.md`
- `packages/reconciliation/README.md`
- `packages/reconciliation/test/reconciliation-engine.test.ts`
- `.agent/context/20260907T160800Z-c02-reconciliation-engine.md`

## Review gates

- Gate A: PASS (free-pi-cli / glm 5.3, candidate tree 8105a511787fd9d31c1c3f3a1935729556d5ac74)
- CI: PASS (ESLint & TypeScript, Markdown & Mermaid, repository-policy)
- Gate B: PASS (free-pi-cli / glm 5.3, head 6dd2e37ff076af6b115a589664f5a999fd480658, tree 8105a511787fd9d31c1c3f3a1935729556d5ac74)
- PR: [#20](https://github.com/SWOFART/OneShot/pull/20) - Ready for review
