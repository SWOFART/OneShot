# Coder C Lane — Reconciliation and Recovery Evidence

Mission: implement the live OneShot/Arc Subgraph through Studio GraphQL (with
optional Subgraph MCP) as the
hashless candidate-discovery path, let an LLM Recovery Agent emit a bounded
four-action recommendation, enforce it through deterministic zero-submit
reconciliation, build failure-injection proof, render recovery UI, and assemble
qualification evidence.

Stay inside C-owned paths. The reconciliation package emits frozen commands; it
never writes A’s tables directly and never calls SettlementPort.

## Technology focus

Provider-neutral evidence contracts, Subgraph MCP, structured LLM output,
`viem` read models, Vitest, deterministic failure injection, React/Vite recovery
components, and a Subgraph adapter admitted only after C01 proves live discovery
and safe degradation.

## Sequence

1. [C01 — Recovery evidence strategy](C01-recovery-evidence-strategy.md)
2. [C02 — Reconciliation engine](C02-reconciliation-engine.md)
3. [C03 — Failure injection](C03-failure-injection.md)
4. [C04 — Recovery matrix and integration](C04-recovery-matrix-integration.md)
5. [C05 — Frontend recovery](C05-frontend-recovery.md), held until project Gate P4
6. [C06 — Qualification demo](C06-qualification-demo.md)

C01–C04 close against frozen local, Privy, Arc, Graph/MCP, and agent fixtures.
A/B implementations, live Graph evidence, and external model access are
project-gate inputs, not reasons to stop local progress.
