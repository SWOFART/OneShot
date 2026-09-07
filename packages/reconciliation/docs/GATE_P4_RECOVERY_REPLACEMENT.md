# Gate P4 Recovery Replacement Guide

Gate P4 replaces C04 simulators at their public ports. The recovery service and
deterministic safety core remain unchanged.

| C04 port                    | Simulator                            | Gate P4 replacement                                                                     | Required proof                                                               |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `LocalRecoveryStatePort`    | `SimulatorLocalRecoveryStatePort`    | Thin adapter over A's public `IntentLedger` reads                                       | Stable intent, state/version, attempt identity, persisted correlation window |
| `KnownIdentityEvidencePort` | `SimulatorKnownIdentityEvidencePort` | Reviewed bridge over `@oneshot/privy-adapter` `EvidencePort` and persisted Arc identity | Exact request binding and final Arc proof or revert                          |
| `SubgraphMcpRecoveryPort`   | `SimulatorSubgraphMcpRecoveryPort`   | Deployment-pinned Subgraph MCP client normalized by `normalizeSubgraphMcpTrace`         | Expected server, tool, deployment, manifest, query digest, `_meta`, and lag  |
| `RecoveryAdvisorPort`       | `RecoveryAgentSimulator`             | Structured-output recovery model adapter                                                | Four-action enum, model/prompt version, bounded references, rejection tests  |
| `RecoveryCommandStorePort`  | `InMemoryRecoveryCommandStore`       | A-owned append-only command consumer                                                    | Atomic event-ID dedupe and expected state-version check                      |

## Composition point

`apps/worker/src/worker.ts` currently leaves `reconcile_intent` empty. Gate P4
injects one `RecoveryService` and calls `handle` with the durable outbox event
identity. The handler returns append commands and a reconciliation command. The
A-owned consumer applies them atomically; C code never imports storage internals
or writes A tables.

## Compatibility checks

Before readiness may pass, verify:

1. `@oneshot/reconciliation` is `0.1.0` and all C04 schema constants match.
2. `@oneshot/privy-adapter` exposes `EvidencePort` with contract pack
   `frozen-v1` and adapter contract `settlement-adapter-contract-v1`.
3. The configured network is Arc Testnet `eip155:5042002`.
4. The Subgraph MCP checks in
   [`SUBGRAPH_MCP_CHECKLIST.md`](SUBGRAPH_MCP_CHECKLIST.md) pass.
5. The model returns only `WAIT`, `RECONCILE`, `ESCALATE`, or
   `RETURN_EXISTING_RESULT`.
6. The command consumer rejects a stale expected state version and deduplicates
   the same event under concurrent delivery.

## Known Gate P4 gap

The current B `EvidencePort.lookup` returns a terminal classification but not a
sanitized proof envelope containing the verified transaction, block, and log
identity required by `KnownIdentityEvidencePort`. Gate P4 must add a reviewed
public bridge or enrich that public result. C04 does not fabricate the missing
metadata.

## Credential boundary

Privy credentials, Graph API keys, model credentials, and wallet material stay
in the runtime secret store. Only sanitized observations and stable public
identities cross into `RecoveryCommandPack`. Provider request/response bodies
never cross the port.

## Safe disable and no-index baseline

When Subgraph MCP is disabled or unhealthy, known transaction hashes can still
be checked through direct Privy/Arc evidence. A hashless `UNKNOWN` intent stays
`UNKNOWN` and escalates; absence from an index never permits another payment.
Disable the recovery model independently by substituting deterministic `WAIT`.
