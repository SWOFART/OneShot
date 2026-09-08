# C06 qualification bundle

## Current evidence index

| Artifact                       | Status                                  | Reference                                                       |
| ------------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| Recovery safety core           | Implemented and tested                  | `src/safety-core.ts`                                            |
| Subgraph MCP boundary          | Implemented against simulator fixtures  | `src/validation.ts`, `test/index-view.test.ts`                  |
| LLM advisory boundary          | Implemented against simulator fixtures  | `src/agent-contract.ts`, `test/reconciliation-engine.test.ts`   |
| Degraded-state matrix          | Offline PASS; zero submissions          | `../C04_RECOVERY_MATRIX_REPORT.md`, `../CHAOS_MATRIX_REPORT.md` |
| Restart/replay                 | Offline PASS                            | `test/chaos-harness.test.ts`                                    |
| Public recovery viewer         | Deployable synthetic demo               | `packages/recovery-ui`                                          |
| Production Graph/model default | Fails closed when live ports are absent | `src/disabled-ports.ts`, `apps/worker/src/composition.ts`       |
| Privy live authorization proof | Missing                                 | `docs/settlement/LIVE_EVIDENCE.md`                              |
| Arc Testnet real USDC proof    | Missing                                 | `docs/settlement/LIVE_EVIDENCE.md`                              |
| Live pinned Subgraph MCP trace | Missing                                 | `../live-value-gate.md`                                         |
| Live model-to-core trace       | Missing                                 | `../live-value-gate.md`                                         |

This directory is the C06 handoff index. It deliberately does not contain a
fabricated “live” MCP trace, transaction hash, policy ID, deployment ID, model
decision, or receipt. The live capture slots remain missing until a human
provisions the required accounts, policy, funding, deployment, and credentials.

## Included

- [`DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md): two-to-four-minute review flow and safe reset.
- [`LIVE_CAPTURE_CHECKLIST.md`](LIVE_CAPTURE_CHECKLIST.md): exact sanitized artifacts needed to close live C06.
- [`QUALIFICATION_REPORT.md`](QUALIFICATION_REPORT.md): current sponsor verdicts and limitations.
- `qualification.ts`: fail-closed evidence classifier; simulator/plan evidence cannot satisfy live checks.

## Repeatable offline checks

```bash
pnpm --filter @oneshot/reconciliation verify
pnpm --filter @oneshot/recovery-ui verify
pnpm --filter @oneshot/recovery-ui build:site
```

The offline lane proves safety behavior, not sponsor qualification.
