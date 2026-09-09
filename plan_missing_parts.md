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

## Completed in Gate P4

### Live The Graph hashless recovery

Completed and verified with real Subgraph Studio deployment (`1758917/oneshot-arc-testnet/version/latest`), Subgraph MCP client (`execute_query_by_deployment_id`), and Google Cloud Vertex AI Gemini 2.5 Flash:

- Pinned immutable deployment CID: `Qma8SKdatVjuwYzrZsHK4ZqVR2MGX8m4BxQFu6PqzXwHLi` (`0xaf2b444e00f8d11eb5db6bf1bd33e9f6ff0a211c4539d899ec8c9615afb893a7`).
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

The intent/status UI and a synthetic recovery viewer are implemented, but the
repository status still marks live API wiring as pending. Complete the frozen
API composition and browser-level acceptance coverage for:

- create, replay, and conflicting intent payloads;
- policy denial, committed settlement, and `UNKNOWN` recovery states;
- Graph discovery, lag/error, and multiple-candidate states; and
- accessibility, responsive layout, no-secret, and no-force-pay checks.

The plan calls for Playwright browser flows; the current workspace evidence is
primarily Vitest component/client tests and fixture-backed recovery UI tests.

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
| P5 live UI acceptance | Reachable configured API, safe test data, and browser-test environment | Continue fixture/mock coverage; do not add a payment bypass. |
| P6 release | P5 completion, CI, exact-tree reviews, and human demo/submission decisions | Keep release candidate and sponsor claims incomplete. |
| Arc Mainnet | Official published network values and explicit human authorization | Preserve the disabled, fail-closed profile. |

## Immediate Priorities

1. Wire the operator UI to the configured API and add the P5 browser acceptance
   suite, especially `UNKNOWN` and Graph-degraded recovery views.
2. After P5 passes, capture the demo/submission artifacts and perform the P6
   release-candidate CI and review sequence.
