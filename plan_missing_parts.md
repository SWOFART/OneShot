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

## In Progress

### Live The Graph hashless recovery

The boundary, schemas, simulator, deterministic safety core, and fail-closed
fallback exist. The Arc Testnet Subgraph source is built, deployed to Studio,
and published with an immutable deployment, but the live production path is
intentionally unavailable because Explorer shows no active Indexer allocation.

Verified public deployment metadata:

- Explorer target: `69FEby7GetXpJVWJShPL6XjMsWWDowLuqf6cE5MvTHdy`.
- Duplicate registration observed: `FnXJmkEuxCDeqr4tTejszcLgpodazPoy2ifeNrA5VnBw`.
- Deployment/manifest CID: `Qma8SKdatVjuwYzrZsHK4ZqVR2MGX8m4BxQFu6PqzXwHLi`.
- Explorer state: `NOT INDEXED` / `SUBGRAPH NOT INDEXED`; no indexers or
  allocations. Studio query success is development evidence only.

Remaining work:

- Obtain an active Indexer allocation and synchronized decentralized query path
  for the identified deployment; decide whether the duplicate registration
  should be retained or cleaned up.
- Configure a live Subgraph MCP transport and query the pinned deployment for
  a lost-hash recovery case.
- Configure the structured-output recovery-model adapter and capture its
  recommendation, evidence references, and deterministic-core disposition.
- Verify every returned candidate with Arc receipt and exact Transfer evidence,
  while proving zero new settlement submissions.
- Capture the sanitized trace, including `_meta` freshness/health, MCP tool and
  query identity, candidate count, model action, and core decision.

Until then, automatic hashless recovery remains unavailable and The Graph is
`NOT VERIFIED`; this blocks the live lost-hash requirement in Gate P4 and the
Graph portion of C06/P6.

### Gate P4 integrated proof

Most composition pieces and the live Privy/Arc allowed, denied, and
lost-response drills are present. Gate P4 remains incomplete because its live
lost-hash The Graph MCP/model flow has not been proven. The final integrated
matrix should also record every applicable `.agent/TEST_MATRIX.md` scenario
with durable state and external-settlement count.

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
Privy/Arc testnet evidence exist. P6 remains open until P4/P5 complete, the
repeatable end-to-end demo is captured, selected sponsor claims are supported,
and the exact release candidate completes CI plus Gate A and Gate B review.

## Potential Dependencies and Blockers

| Item | Dependency or blocker | Safe response while blocked |
| --- | --- | --- |
| Live Graph recovery | Indexer allocation, Gateway/MCP access, model credentials, and duplicate-registration decision supplied by a human; immutable deployment is now identified | Keep `FALLBACK_DIRECT_RECOVERY`; retain `UNKNOWN`; do not retry payment. |
| P4 live lost-hash proof | The live Graph recovery trace and Arc verification evidence | Do not claim Gate P4 or Graph qualification. |
| P5 live UI acceptance | Reachable configured API, safe test data, and browser-test environment | Continue fixture/mock coverage; do not add a payment bypass. |
| P6 release | P4/P5 completion, CI, exact-tree reviews, and human demo/submission decisions | Keep release candidate and sponsor claims incomplete. |
| Arc Mainnet | Official published network values and explicit human authorization | Preserve the disabled, fail-closed profile. |

## Immediate Priorities

1. Close the live The Graph MCP/model recovery evidence gap. It is the only
   sponsor-critical product dependency still intentionally disabled and blocks
   final P4/P6 qualification.
2. Run the complete integrated P4 matrix against the real composed services,
   recording durable outcomes and settlement counts for every required case.
3. Wire the operator UI to the configured API and add the P5 browser acceptance
   suite, especially `UNKNOWN` and Graph-degraded recovery views.
4. After P4/P5 pass, capture the demo/submission artifacts and perform the P6
   release-candidate CI and review sequence.
