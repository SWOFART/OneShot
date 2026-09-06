# C04 — Recovery Matrix and Simulator Integration

Owner: Coder C
Forecast: 4 working days
Branch: `milestone/c04-recovery-matrix-integration`
Depends on: C03 only
Next: hold C05 until project Gate P4

## Outcome

The recovery service composes frozen local-state, provider/Arc, and Graph simulators, persists sanitized evidence through its command seam, and produces the complete pre-live safety matrix.

## Small tasks

### C04.1 — Service boundary

- Implement reconciliation job/command handler around the pure engine.
- Consume state snapshots and emit versioned commands; never write A tables or call settlement.
- Add retry-safe reads and duplicate event handling.

### C04.2 — Evidence persistence contract

- Emit append-only observation records with provenance, retrieval time, block/freshness, authority, reason, and digest.
- Redact provider bodies and secrets before crossing the boundary.

### C04.3 — Simulator composition

- Host A local-state and B evidence simulators behind frozen ports.
- Verify contract version mismatch and unknown result fail closed.
- Run all combinations without importing internal implementation paths.

### C04.4 — Matrix report

- Generate a sanitized table containing scenario, stable intent, starting/final state, evidence sources, decision, and external-submission count.
- Cover normal, duplicate, concurrency, crash, lost response, Graph delay/error, denial, restart, downstream failure, and two-agent cases at the recovery seam.

### C04.5 — Gate P4 replacement guide

- Document exact simulator-to-reviewed-package replacement points.
- Define live Graph deployment checks, lag thresholds, expected package versions, and rollback to safe simulator/read-only mode.

## Acceptance evidence

- Package-local lint/type/test/build and full fixture matrix pass.
- Reconciliation retries are idempotent and zero-submit by construction.
- Recovery view always distinguishes authority and observation freshness.
- Contract mismatch, missing `_meta`, raw provider payload, and unknown enum fail closed.
- Packet closes with simulators; live gaps are explicit Gate P4 items.

## Handoff artifact

Publish recovery service package, evidence command pack, matrix report, simulator lock, live replacement guide, and Graph deployment checklist.

## No-wait continuation

C04 is `DONE` on simulator proof. Do not start production frontend until P4. While held, expand chaos coverage, auditability, docs, or performance baselines.

## Non-goals

No production frontend, direct settlement, Graph-based authorization, or sponsor qualification from offline data.
