# A04 — Restart Safety, Operations, and Simulator Composition

Owner: Coder A
Branch: `milestone/a04-restart-operations-composition`
Depends on: A03 only
Next: hold A05 until project Gate P4; improve backend evidence while waiting

## Outcome

The backend survives restarts, exposes safe operations, and composes every production port behind frozen interfaces. This packet closes with simulators; real adapter convergence is Gate P4.

## Small tasks

### A04.1 — Startup recovery

- Detect orphaned `SUBMITTING` records and route them to reconciliation-required `UNKNOWN` handling.
- Resume safe jobs after API/worker/database restarts.
- Prove lease expiry never grants a new settlement submission.

### A04.2 — Safe disable

- Add an audited configuration switch that stops new submission ownership.
- Keep liveness, status, evidence ingestion, and reconciliation reads available.
- Fail readiness when chain/policy/config identity is invalid without exposing secrets.

### A04.3 — Structured telemetry

- Emit correlation-safe state-transition logs with explicit redaction.
- Add metrics for states, oldest/count `UNKNOWN`, CAS conflicts, queue lag, duplicates, policy denials, provider errors, and reconciliation outcomes.
- Add alert threshold configuration with safe defaults.

### A04.4 — Port composition

- Wire dependency injection for production B/C entry points without importing internal modules.
- Create a composition profile using settlement and recovery simulators.
- Add contract-version/readiness mismatch failures.

### A04.5 — Root verification

- Run empty/upgrade migrations, lint, type, unit, integration, contract, build, concurrency, restart, and secret checks.
- Produce the Gate P4 composition checklist and exact package-version slots.

## Acceptance evidence

- Restart after intent creation, job claim, `SUBMITTING`, adapter result, and settlement commit preserves the invariant.
- Simulator-composed backend passes the complete applicable matrix with recorded settlement counts.
- Safe disable prevents new external calls while read/recovery paths remain healthy.
- Logs and metrics contain no raw provider body, credentials, authorization signatures, or private wallet material.
- Unknown or incompatible adapter contract versions fail readiness.

## Handoff artifact

Publish backend composition manifest, simulator lock, restart runner, dashboards/alert definitions, safe-disable runbook, and Gate P4 command list.

## No-wait continuation

A04 is `DONE` on simulator evidence. Do not start production frontend. While P4 awaits real artifacts, add backend tests, migration evidence, docs, or performance baselines as separately scoped tasks.

## Non-goals

No claim that live sponsor integration is qualified and no frontend implementation.
