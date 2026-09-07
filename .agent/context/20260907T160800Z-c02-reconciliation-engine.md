# Session Context: C02 LLM Recovery Agent and Deterministic Reconciliation

## Date/time

- UTC: 2026-09-07T16:08:00Z

## User goal

Implement Coder C Milestone C02: LLM Recovery Agent and Deterministic Reconciliation.
Build the RecoveryAdvisorPort contract, deterministic LLM recovery agent simulator, deterministic recovery safety core, safe reconciliation command vocabulary, provenance-labeled recovery view, and exhaustive idempotency/safety test matrix. Zero payment submission capability by construction.

## Invariants and boundaries

- 1 business intent -> at most 1 committed settlement.
- UNKNOWN state reconciles without blind retries.
- Authoritative proof: local OneShot COMMITTED record and exact verified Arc receipt + Transfer.
- Advisory inputs: Subgraph MCP observations and LLM Recovery Agent recommendations are strictly NON-AUTHORITATIVE and ADVISORY. They can NEVER grant settlement rights or submit payments.
- RETURN_EXISTING_RESULT converts to MARK_COMMITTED / terminal state ONLY if independently verified by authoritative Arc/durable evidence; otherwise fails safe to HOLD_UNKNOWN or ESCALATE_UNKNOWN.
- Package-isolated: imports NO private A/B implementation modules, NO SettlementPort calls, NO direct database mutations.

## Small tasks

- C02.1 — Evidence model & binding validation (source, authorityClass, request binding, retrieval time, block/finality/freshness, sanitized reason, digest).
- C02.2 — Evidence precedence & bounded sanitized agent input (labels untrusted data, strips secrets/raw provider bodies, encodes contradictory/stale/missing/unavailable).
- C02.3 — RecoveryAdvisorPort contract & deterministic agent simulator (WAIT, RECONCILE, ESCALATE, RETURN_EXISTING_RESULT; rejects unknown actions, prompt injection, extra tools).
- C02.4 — Deterministic safety core & provenance-labeled recovery view (maps recommendations to safe read-only/hold/escalate/commit commands; zero submit by construction).
- C02.5 — Idempotency, replay, reordering, and matrix tests.

## Git and PR state

- Branch: `milestone/c02-reconciliation-engine`
- Base: `develop` (64d0a6fb65c3bedce169cc95867595e3f79b90c7)
- Review tooling: `free-pi-cli` / `glm 5.3`
- Status: ACTIVE
