# Missing Plan Implementation

Audit basis: `plan.md`, current source, tests, checked-in evidence, and the
2026-09-09 Graph Explorer status. This is a delivery-gap report, not a change
to the approved product plan. Completed offline milestones are not listed as
missing merely because their final project gate is still open.

## Not Started

### Arc Mainnet activation

- Pin official Arc Mainnet chain, RPC, explorer, and USDC identities when Arc
  publishes them.
- Enable and probe the Mainnet profile only after explicit human authorization.
- Run the required review and deployment procedure; no real-value transaction
  is authorized by this report.

This is deliberately absent today: `docs/MAINNET_READINESS.md` reports
`DEPLOYMENT-READY`, and the code is designed to fail closed until those inputs
exist.

### Sponsor-submission deliverables

- Record the required two-to-four-minute demo video/presentation.
- Prepare submission text that explicitly names the claimed Arc tracks and
  links the public repository and evidence.
- Do not include a The Graph qualification claim unless its live MCP and model
  evidence is complete.

The repository contains demo runbooks and evidence templates, but not a
recorded submission artifact.

### Arc/Circle Agent Stack qualification

The current base has a real Arc/Privy settlement and a qualified live Graph
recovery path, but it does not yet contain a Circle Agent Stack integration.
The remaining Arc sponsor work is therefore an implementation and evidence
slice, not a documentation-only claim:

- add a provider-neutral agent-service payment port backed by Circle Agent
  Stack/Agent Wallet and Circle CLI/Skills;
- configure explicit per-transaction and daily spending controls without
  committing credentials or relying on an unbounded agent wallet;
- execute one real Arc Testnet USDC service payment or paid request, bind it to
  a durable OneShot Business Intent, and verify the Arc receipt/response;
- prove over-cap/denied and lost-response behavior preserves zero duplicate
  settlement and `UNKNOWN` reconciliation; and
- capture sanitized code, test, live transaction, architecture, and 2-4 minute
  demo evidence before claiming the Arc Agentic Economy track.

Privy remains the canonical corporate authorization rail. Circle must not bypass
the OneShot policy/idempotency core or gain authority over hashless recovery.
Hedera HTS and Hedera x402 work are intentionally not part of this submission
window.

## Completed in Gate P4

### Live The Graph hashless recovery

Completed and verified with real Subgraph Studio deployment (`1758917/oneshot-arc-testnet/version/latest`), Subgraph MCP client (`execute_query_by_deployment_id`), and Google Cloud Vertex AI Gemini 2.5 Flash:

- Pinned immutable deployment CID: `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7` (`0x0d469664a45efc2483abb0e4d35e8ed02db0064c2c50dc0cdf855ff6ad6690c0`).
- Canonical Explorer target: `69FEby7GetXpJVWJShPL6XjMsWWDowLuqf6cE5MvTHdy`.
- Duplicate registration observed: `FnXJmkEuxCDeqr4tTejszcLgpodazPoy2ifeNrA5VnBw` (identical deployment hash).
- Subgraph MCP trace normalized with health `FRESH` (block `61153492`).
- Vertex AI Gemini 2.5 Flash advised `RECONCILE` referencing candidate transaction `0x72ab1e93...`.
- Deterministic OneShot safety core validated Arc receipt in block `61116056` (log index 23) and committed the settlement with 0 duplicate broadcasts.
- Sanitized evidence captured in `evidence/c06/graph-proof.json` and `evidence/c06/sanitized-proof.json`; The Graph qualification updated to `QUALIFIED`.

### Gate P4 integrated proof

All backend composition pieces, the live Privy/Arc allowed, denied, and lost-response drills, and the live The Graph Subgraph MCP + Vertex AI Gemini recovery flow are complete. Gate P4 is PASS.

## In Progress

### Gate P5 frontend acceptance

The Gate P5 candidate composes A05/B05/C05 against the frozen API and adds
Playwright coverage for create, replay, conflict, denial, committed, `UNKNOWN`,
Graph discovery/degradation, service-unavailable, keyboard, responsive,
memory-only token, and no-force-pay behavior. The recovery API now returns the
persisted Recovery Agent and deterministic-core decision instead of a hard-coded
action. Exact-tree review, CI, and human merge remain before the project gate is
closed.

### Gate P6 release candidate

Release runbooks, safe-disable behavior, a disabled Mainnet profile, and
Privy/Arc/The Graph testnet evidence exist. P6 remains open until P5 completes, the
repeatable end-to-end demo is captured, selected sponsor claims are supported,
and the exact release candidate completes CI plus Gate A and Gate B review.

## Potential Dependencies and Blockers

| Item | Dependency or blocker | Safe response while blocked |
| --- | --- | --- |
| Live Graph recovery | RESOLVED: Live Subgraph Studio deployment, MCP client, and Vertex AI Gemini adapter operational (`QUALIFIED`) | Preserved `settlementPermission: NEVER`. |
| P4 live lost-hash proof | RESOLVED: Full live lost-hash recovery trace verified and recorded | Gate P4 is PASS. |
| P5 live UI acceptance | RESOLVED in candidate: configured Cloud Run is reachable and frozen-API Playwright coverage exists | Await exact-tree review, CI, and human merge. |
| P6 release | P5 completion, CI, exact-tree reviews, and human demo/submission decisions | Keep release candidate and sponsor claims incomplete. |
| Arc Mainnet | Official published network values and explicit human authorization | Preserve the disabled, fail-closed profile. |
| Circle Agent Stack Arc lane | Agent Stack/Agent Wallet implementation, supported-chain confirmation, spend controls, live payment, and evidence | Keep the Circle Arc claim `NOT VERIFIED`; continue the proven Privy/Arc path until the complete acceptance checklist passes. |

## Immediate Priorities

1. Complete Gate A, CI, Gate B, and human review for the Gate P5 candidate.
2. Implement and test the bounded Circle Agent Stack Arc service-payment lane;
   keep Privy as the canonical OneShot settlement authority.
3. After P5 and the Circle evidence pass, capture the demo/submission artifacts
   and perform the P6 release-candidate CI and review sequence.
