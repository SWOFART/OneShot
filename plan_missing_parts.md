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

- Prepare submission text that explicitly names the claimed Arc tracks and
  links the public repository and evidence.
- Use [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the judge-facing walkthrough;
  no recorded video artifact is included in this candidate.
- Do not include a The Graph qualification claim unless its live MCP and model
  evidence is complete.

The repository contains demo runbooks, evidence, and a repeatable offline demo;
the recorded submission artifact remains intentionally absent.

### Circle Agent Stack (out of scope)

Circle Agent Stack is intentionally excluded from the Gate P6 release candidate.
No Circle wallet, CLI, Skills, or agent-payment claim is supported by this bundle.
Privy remains the canonical authorization rail; a future Circle lane must preserve
the OneShot policy/idempotency core and acquire its own evidence.

Any future Circle implementation must add bounded spend controls, a live Arc
payment, and its own sanitized evidence before a Circle track can be claimed.

Circle must not bypass the OneShot policy/idempotency core or gain authority over
hashless recovery. Hedera HTS and Hedera x402 remain out of scope.

## Completed in Gate P4

### Live The Graph Studio recovery

The real Subgraph Studio deployment
(`1758917/oneshot-arc-testnet/version/latest`) is synchronized and queryable.
The production fix uses its direct GraphQL endpoint because the Network Gateway
does not serve this Arc deployment.

- Pinned immutable deployment CID: `QmPEUSL6aXY7RVjGFFMbs5L4Q4pxG4TB73cHQ7nechGQY7` (`0x0d469664a45efc2483abb0e4d35e8ed02db0064c2c50dc0cdf855ff6ad6690c0`).
- Canonical Explorer target: `69FEby7GetXpJVWJShPL6XjMsWWDowLuqf6cE5MvTHdy`.
- Duplicate registration observed: `FnXJmkEuxCDeqr4tTejszcLgpodazPoy2ifeNrA5VnBw` (identical deployment hash).
- Direct Studio GraphQL returns `_meta` health and real transfer candidates.
- Vertex AI Gemini 2.5 Flash advised `RECONCILE` referencing candidate transaction `0x72ab1e93...`.
- Deterministic OneShot safety core validated Arc receipt in block `61116056` (log index 23) and committed the settlement with 0 duplicate broadcasts.
- Existing evidence remains useful for recovery behavior, but official Subgraph
  MCP qualification is `NOT VERIFIED` until a genuine MCP tool call can query
  this Arc deployment.

### Gate P4 integrated proof

All backend composition pieces and the live Privy/Arc allowed, denied, and
lost-response drills are complete. Studio candidate discovery plus Vertex AI
and deterministic Arc verification are implemented; official MCP qualification
is tracked separately and does not authorize settlement. Gate P4 remains PASS.

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
Privy/Arc/The Graph testnet evidence exist. `pnpm demo:e2e` and
`docs/DEMO_SCRIPT.md` provide the repeatable demo; video is intentionally absent.
P6 remains subject to CI, Gate A, Gate B, and human release review.

## Potential Dependencies and Blockers

| Item                        | Dependency or blocker                                                                                              | Safe response while blocked                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Live Graph recovery         | IN PROGRESS: Studio queries work; Network Gateway cannot serve the Arc deployment and official MCP is not verified | Use direct Studio GraphQL read-only; preserve `settlementPermission: NEVER`. |
| P4 live lost-hash proof     | RESOLVED: Full live lost-hash recovery trace verified and recorded                                                 | Gate P4 is PASS.                                                             |
| P5 live UI acceptance       | RESOLVED in candidate: configured Cloud Run is reachable and frozen-API Playwright coverage exists                 | Await exact-tree review, CI, and human merge.                                |
| P6 release                  | P5 completion, CI, exact-tree reviews, and human demo/submission decisions                                         | Keep release candidate and sponsor claims incomplete.                        |
| Arc Mainnet                 | Official published network values and explicit human authorization                                                 | Preserve the disabled, fail-closed profile.                                  |
| Circle Agent Stack Arc lane | Agent Stack/Agent Wallet implementation, supported-chain confirmation, spend controls, live payment, and evidence  | Intentionally out of scope; do not claim the Circle track.                   |

## Immediate Priorities

1. Complete Gate A, CI, Gate B, and human review for the Gate P5 candidate.
2. Prepare final submission text using checked-in evidence; keep Circle out of
   the claimed scope.
3. Perform the P6 release-candidate CI and review sequence.
