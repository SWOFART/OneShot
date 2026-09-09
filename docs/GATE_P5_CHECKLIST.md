# Gate P5 Frontend Acceptance

Status: `CANDIDATE_READY_FOR_REVIEW`

Gate P5 composes the reviewed A05, B05, and C05 slices in one operator shell.
The shell talks only to the frozen OneShot API and exposes no settlement,
resubmission, force-pay, or policy-bypass control.

## Composition

| Slice | Composed behavior                                                                                |
| ----- | ------------------------------------------------------------------------------------------------ |
| A05   | Create/replay, conflict handling, authoritative status, and read-only reconciliation             |
| B05   | Privy policy and authorization plus verified Arc settlement details                              |
| C05   | Recovery evidence, Subgraph MCP state, Recovery Agent advice, and deterministic-core disposition |

The selected Business Intent ID and in-memory service token are shared across
all four tabs. Package CSS is scoped to its slice so B05/C05 styles cannot
override the application shell or each other.

## Frozen recovery API

`GET /v1/intents/{id}/recovery-view` remains backward compatible and adds
optional sanitized fields for:

- whether the recommendation is a persisted Recovery Agent result or a safe
  fallback;
- the accepted model decision and model/prompt identity;
- the deterministic-core disposition and authoritative-proof flag; and
- Subgraph MCP identity, health, diagnostics, and bounded candidates.

The ledger reads these values from the latest durable recovery command pack.
Legacy or absent data renders a labelled fail-closed fallback. Graph/model data
never grants settlement permission; the response fixes it to `NEVER`.

## Browser acceptance

The Chromium Playwright suite covers:

- create, identical replay, and same-ID payload conflict;
- Privy denial and verified committed Arc settlement;
- `UNKNOWN`, Graph discovery, lag, unavailable, and multiple-candidate states;
- backend unavailable, keyboard focus, 390-pixel responsive layout, and
  memory-only token behavior; and
- absence of force-pay, retry-payment, or submit-settlement controls.

Component accessibility checks remain in A05/B05/C05. CI installs pinned
Chromium and runs the P5 browser suite on every pull request.

## Verification

```text
pnpm lint                                      PASS
pnpm typecheck                                 PASS
pnpm --filter @oneshot/web test                PASS (31 tests)
pnpm --filter @oneshot/reconciliation test     PASS (84 tests)
pnpm --filter @oneshot/storage-postgres test   PASS (8 tests)
pnpm --filter @oneshot/web test:browser        PASS (4 Chromium flows)
pnpm check:generated                           PASS
pnpm validate:fixtures                         PASS (9 + 7 fixtures)
GET Cloud Run /health/ready                    PASS (200, status ok)
```

The PostgreSQL decision-projection integration test is included for CI; local
execution requires Docker, which is unavailable in this workspace.

## Deliberate boundary

The production API has no durable operator-escalation endpoint. The composed
client therefore hides that unsupported action instead of pretending it
succeeded. Status refresh remains read-only. Add escalation only with a frozen,
audited, durable API contract.
