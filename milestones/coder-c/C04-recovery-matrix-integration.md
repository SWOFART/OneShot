# C04 — Recovery Matrix and Simulator Integration

Owner: Coder C
Branch: `milestone/c04-recovery-matrix-integration`
Depends on: C03 only
Next: hold C05 until project Gate P4

## Outcome

The recovery service composes frozen local-state, provider/Arc, Subgraph MCP,
and LLM simulators, persists sanitized evidence/decisions through its command
seam, and produces the complete pre-live safety matrix.

## Small tasks

### C04.1 — Service boundary

- Implement the reconciliation job/command handler around RecoveryAdvisorPort and the deterministic safety core.
- Consume state snapshots and emit versioned commands; never write A tables or call settlement.
- Add retry-safe reads and duplicate event handling.

### C04.2 — Evidence persistence contract

- Emit append-only observation/decision records with MCP/model provenance,
  retrieval time, block/freshness, authority, reason, evidence references, and digest.
- Redact provider bodies and secrets before crossing the boundary.

### C04.3 — MCP and agent simulator composition

- Host A local-state, B evidence, Subgraph MCP, and recovery-agent simulators behind frozen ports.
- Verify contract version mismatch and unknown result fail closed.
- Run all combinations without importing internal implementation paths.

### C04.4 — Matrix report

- Generate a sanitized table containing scenario, stable intent, starting/final state, evidence sources, decision, and external-submission count.
- Cover normal, all four recommendations, invalid model output, duplicate,
  concurrency, crash, lost response, Graph/MCP delay/error/malformed/injection,
  denial, restart, downstream failure, and two-agent cases at the recovery seam.

### C04.5 — Gate P4 replacement guide

- Document exact simulator-to-reviewed-package replacement points.
- Define deployment/MCP target checks, lag thresholds, model configuration,
  expected package versions, credential boundaries, and safe-disable behavior;
  keep the no-index baseline runnable.

## Acceptance evidence

- Package-local lint/type/test/build and full fixture matrix pass.
- Reconciliation retries are idempotent and zero-submit by construction.
- Recovery view always distinguishes authority and observation freshness.
- Contract mismatch, missing freshness metadata, wrong MCP deployment/tool, raw
  provider payload, prompt injection, and unknown agent enum fail closed.
- Packet closes with simulators; live gaps are explicit Gate P4 items.

## Handoff artifact

Publish recovery service package, MCP/agent evidence-command pack, matrix report,
simulator lock, live replacement guide, and Graph deployment/MCP checklist.

## No-wait continuation

C04 is `DONE` on simulator proof. Do not start production frontend until P4. While held, expand chaos coverage, auditability, docs, or performance baselines.

## Non-goals

No production frontend, direct settlement, index-based authorization, or sponsor qualification from offline data.
