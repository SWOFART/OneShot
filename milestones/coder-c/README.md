# Coder C Lane — Reconciliation and Indexed Recovery

Mission: index Arc transfer observations, classify Graph health/freshness, reconcile ambiguous settlement evidence without submitting payments, build failure-injection proof, render recovery UI, and assemble qualification evidence.

Stay inside C-owned paths. The reconciliation package emits frozen commands; it never writes A’s tables directly and never calls SettlementPort.

## Technology focus

The Graph Subgraph stack, `graph-cli`, AssemblyScript mappings, GraphQL,
Matchstick, `viem` read paths, Vitest, deterministic failure injection, and
React/Vite recovery components.

## Sequence

1. [C01 — Subgraph and index health](C01-subgraph-index-health.md)
2. [C02 — Reconciliation engine](C02-reconciliation-engine.md)
3. [C03 — Failure injection](C03-failure-injection.md)
4. [C04 — Recovery matrix and integration](C04-recovery-matrix-integration.md)
5. [C05 — Frontend recovery](C05-frontend-recovery.md), held until project Gate P4
6. [C06 — Qualification demo](C06-qualification-demo.md)

C01–C04 close against frozen local/provider/Graph fixtures. A/B implementations and a deployed live Subgraph are project-gate evidence, not reasons to stop local progress.
