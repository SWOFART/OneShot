# Coder A Lane — Domain and Orchestration

Mission: build the authoritative intent ledger, API, worker, concurrency guarantees, root composition, intent/status frontend slice, and operational release proof.

Exclusive paths are listed in `plan.md`. Do not implement provider-specific logic; consume `AuthorizationPort`, `SettlementPort`, `EvidencePort`, and `IndexViewPort` through contracts and simulators.

## Sequence

1. [A01 — Foundation and contracts](A01-foundation-contracts.md)
2. [A02 — Durable intents](A02-durable-intents.md)
3. [A03 — Atomic worker](A03-atomic-worker.md)
4. [A04 — Restart, operations, and composition](A04-restart-operations-composition.md)
5. [A05 — Frontend intent and status](A05-frontend-intent-status.md), held until project Gate P4
6. [A06 — Release operations](A06-release-operations.md)

A01–A04 depend only on this lane’s previous packet and frozen simulators. Close A04 against simulator packages even if B04/C04 are not ready. Real adapter replacement belongs to project Gate P4.
