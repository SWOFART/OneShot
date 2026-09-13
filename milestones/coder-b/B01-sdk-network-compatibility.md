# B01 — SDK and Arc Network Compatibility

Owner: Coder B
Branch: `milestone/b01-sdk-network-compatibility`
Depends on: frozen `milestones/CONTRACTS.md` only
Next: B02 immediately after closure

## Outcome

A package-local spike pins compatible Privy and Ethereum tooling, validates Arc identity, and exposes a fail-closed configuration/readiness contract without requiring the domain service.

## Small tasks

### B01.1 — Version compatibility matrix

- Test current supported Node LTS, Privy Node SDK, Ethereum client, TypeScript, module format, and test runner together.
- Pin exact versions only after request-signing and Arc chain support compile/run in an isolated spike.
- Record rejected combinations and upgrade constraints.

### B01.2 — Arc deployment profiles

- Encode the enabled Arc Testnet chain ID `5042002`, CAIP-2 `eip155:5042002`, RPC/explorer configuration, official USDC interface, and precision.
- Define the same typed profile for Arc Mainnet with no guessed defaults; keep it disabled until official values are published, pinned, probed, and human-approved.
- Separate settlement amounts from native USDC gas accounting and reject silent network/token/precision overrides.

### B01.3 — Memo and policy compatibility spike

- Probe the official Arc Memo contract identity and ABI without assuming it is
  safe for the settlement path.
- Test whether Privy policy decoding can constrain the Memo function, forwarded
  USDC target, recipient/amount-bearing calldata, chain, and zero native value.
- Record `SUPPORTED` only with deny fixtures for every wrong dimension. If the
  nested call cannot be constrained, retain direct transfer and tuple/window
  discovery or propose a narrow typed settlement contract.

### B01.4 — Configuration schema

- Classify each variable as public, secret, optional, or human-only.
- Validate wallet, policy, network, token, recipient allowlist, cap, RPC, timeout, and feature switches.
- Produce safe `.env.example` entries with placeholders only.

### B01.5 — Readiness probe library

- Assert RPC chain ID and bytecode at the configured token contract.
- Validate expected wallet/policy identity format without printing credentials.
- Classify unavailable versus identity mismatch; mismatch fails closed.

### B01.6 — Fixture capture boundary

- Define sanitized official-response fixture wrappers and redaction tests.
- Prohibit headers, tokens, signatures, key material, and raw authorization responses from fixtures/logs.

## Acceptance evidence

- Package install, lint, type, unit, and build pass independently.
- Wrong chain, missing bytecode, wrong token, invalid recipient/cap, policy mismatch, incomplete mainnet profile, or unapproved activation fails readiness.
- No credential is needed for offline checks; network probes are explicitly separate.
- Version decision and upgrade risks are documented.

## Handoff artifact

Publish `settlement-config-v1`, pinned dependency rationale, Arc testnet/mainnet profile schema, readiness simulator/fixtures, redaction test, and package-local commands.

## No-wait continuation

Start B02 using frozen request fixtures. A’s workspace composition is not required.

## Non-goals

No wallet provisioning, policy mutation, transaction submission, durable state transition, or UI.
