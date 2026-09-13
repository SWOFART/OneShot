# Session Context: C03 Cross-Source Failure Injection

## Date/time

- UTC: 2026-09-07T16:20:00Z

## User goal

Implement Coder C Milestone C03: Cross-Source Failure Injection.
Build a deterministic chaos harness and timeline DSL proving that crashes, lost responses, duplicate/out-of-order evidence, Subgraph MCP degradation, hostile tool content, invalid LLM output, and provider/RPC contradictions cannot turn uncertainty into settlement permission.

## Invariants and boundaries

- 1 business intent -> at most 1 committed settlement.
- UNKNOWN state reconciles without blind retries.
- Zero payment submission permission (`settlementPermission: 'NEVER'`) across all degraded, contradictory, or crashed scenarios.
- Deterministic and seed-recorded.
- Package isolation: no private A/B modules, no direct database mutation, no live credentials.

## Small tasks

- C03.1 — Failure timeline DSL (injection points: BEFORE_SUBMISSION, POSSIBLY_SUBMITTED, CONFIRMED; deterministic seed recording).
- C03.2 — Graph & Subgraph MCP degradation suite (delay, empty, lag, health errors, omit freshness, wrong tool/deployment, truncated/oversized, injection).
- C03.3 — Provider / RPC contradiction suite (Privy vs Arc combinations, binding mismatches).
- C03.4 — Restart & evidence replay (feed persistence, replay, reordering, chronology stability).
- C03.5 — Agent failure, UNKNOWN aging, and escalation (timeout, malformed output, prompt injection, age buckets, alerts, runbook).

## Git and PR state

- Branch: `milestone/c03-failure-injection`
- Base: `milestone/c02-reconciliation-engine` (6dd2e37ff076af6b115a589664f5a999fd480658)
- Review tooling: `free-pi-cli` / `glm 5.3`
- Status: ACTIVE
