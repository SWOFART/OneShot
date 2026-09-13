# OneShot Simulator Lock

## Overview

This lock document pins the deterministic simulators used by Coder A to close backend milestones A01 through A04 independently of partner adapter development (Coder B and Coder C lanes).

## Pinned Simulator Packages

### 1. `@oneshot/testkit-domain`

- **Purpose**: In-memory deterministic domain simulation of Business Intent state transitions and settlement verification.
- **Key Exports**:
  - `DeterministicDomainSimulator`
  - Synthetic settlement generator
- **Determinism Guarantee**: Identical intent creation requests yield identical fingerprints and identical state transition graphs across runs.

### 2. `@oneshot/reconciliation`

- **Purpose**: Subgraph MCP query simulation, mock response fixtures, and candidate validation.
- **Key Exports**:
  - `SCENARIO_NAMES` (13 canonical scenarios including `fresh`, `lagging`, `unhealthy`, `duplicate`, `contradictory`)
  - Schema validators for index view, MCP results, and recovery evidence.
- **Fixture Version**: `c01-simulator-v1`

### 3. `@oneshot/worker/composition`

- **Purpose**: Mock settlement and authorization ports providing instant in-memory responses for fast test cycles and offline CI runs.
- **Simulators**:
  - `SimulatorSettlementPort`: Emits deterministic transaction hashes; rejects zero address `0x0000000000000000000000000000000000000000`.
  - `SimulatorAuthorizationPort`: Authorizes valid intents; denies zero address.

## Exact Schema Digests

- `STORAGE_V1_SCHEMA_DIGEST`: `5d5888894ff0f4f44049579f1c8ffca2a24e0b61c3af65aabdbcd78f06020d65`
- Contract Schema Version: `v1`
