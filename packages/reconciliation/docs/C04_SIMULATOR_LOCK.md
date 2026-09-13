# C04 Simulator Lock

C04 closes against deterministic, credential-free simulators. It does not claim
that Arc, Privy, Subgraph MCP, or an external model was called live.

## Frozen simulator identities

| Boundary                  | Simulator                            | Contract identity                    |
| ------------------------- | ------------------------------------ | ------------------------------------ |
| A local state             | `SimulatorLocalRecoveryStatePort`    | `local-recovery-snapshot-v1`         |
| B known-identity evidence | `SimulatorKnownIdentityEvidencePort` | `recovery-evidence-v1`               |
| The Graph                 | `SimulatorSubgraphMcpRecoveryPort`   | `c01-simulator-v1` / `index-view-v1` |
| Recovery agent            | `RecoveryAgentSimulator`             | `recovery-advisor-v1`                |
| Command seam              | `InMemoryRecoveryCommandStore`       | `recovery-command-pack-v1`           |

All simulator timestamps, request identities, block windows, and model outputs
are fixed fixtures. Replaying one event produces the same pack ID and append
command IDs. The command store admits one immutable pack per event ID.

## Safety boundary

- The service imports no A or B implementation path.
- It exposes no settlement port and records `externalSubmissionCount: 0`.
- The Graph and the model remain observations. The deterministic core owns the
  disposition.
- Raw provider bodies, authorization headers, credentials, and secrets are
  rejected before the append-only command seam.
- A contract mismatch returns `HELD` without emitting a command pack.

## Unlock condition

Replace a simulator only through
[`GATE_P4_RECOVERY_REPLACEMENT.md`](GATE_P4_RECOVERY_REPLACEMENT.md). C05 remains
blocked until the integrated Gate P4 proofs pass.
