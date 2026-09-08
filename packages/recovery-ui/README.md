# OneShot Recovery UI

`@oneshot/recovery-ui` is the independently composable C05 recovery timeline
and evidence-history slice. It renders only sanitized recovery data and has no
settlement submission capability.

## Entry points

- `RecoveryRoute`: fetches and paginates a recovery view through an injected
  `RecoveryClient`.
- `RecoveryTimeline`: renders already-validated pages for later Gate P5 shell
  composition.
- `createRecoveryClient`: browser client for the frozen mock/API boundary.
- `createInMemoryRecoveryClient`: deterministic component-test client.
- `handleRecoveryMockRequest`: request handler used by the Vite development
  server.

Run the standalone fixture viewer:

```bash
pnpm --filter @oneshot/recovery-ui dev
```

Open `/?scenario=aged-unknown`. Any scenario exported by
`RECOVERY_SCENARIOS` may be selected.

## Frozen mock boundary

- Mock server version: `c05-mock-v1`.
- Response schema version: `recovery-timeline-v1`.
- Read endpoint:
  `GET /mock/v1/intents/{businessIntentId}/recovery?scenario={scenario}&cursor={cursor}`.
- Safe action endpoints: `POST .../refresh` and `POST .../escalations`.
- No retry, payment, force-pay, signing, submission, or ownership endpoint
  exists.

The runtime parser rejects secret-shaped strings and forbidden raw-provider
fields before data reaches a component. Fixture values are synthetic and
contain no credentials or raw request/response bodies.

## Fixture stories

Fixtures cover all four advisor recommendations plus invalid output, fresh,
empty, lagging, unhealthy, unavailable, Graph-disabled fallback,
contradictory, pending, committed, failed-safe, and aged-`UNKNOWN` states.
Every fixture has two pages with one repeated observation to prove pagination
and duplicate collapse. Equal-clock events without a durable sequence are
visibly marked as order-ambiguous.

## Copy glossary

- **Authoritative OneShot state**: durable OneShot state. It controls whether a
  terminal transition is allowed.
- **Authoritative Arc chain evidence**: independently verified receipt and
  transfer-log proof bound to the intent.
- **Provider observation**: sanitized Privy status. It is evidence, not final
  authority.
- **Candidate discovery**: The Graph result retrieved through Subgraph MCP. It
  can find candidates but cannot authorize settlement.
- **LLM recommendation**: one of `WAIT`, `RECONCILE`, `ESCALATE`, or
  `RETURN_EXISTING_RESULT`. It remains advisory.
- **Deterministic core disposition**: bounded command enforced by OneShot.
- **Not observed through block N**: no candidate appeared within the indexed
  horizon. It never means a settlement did not occur.

## Gate P5 composition

Gate P5 should import `RecoveryRoute` or `RecoveryTimeline`, provide the real
frozen recovery API client, and import `@oneshot/recovery-ui/styles.css` inside
the A05-owned shell.
The shell must retain authority labels, the separate advisor/core panels, and
the two safe actions. Composition must not introduce a generic retry or payment
button.

## Verification

```bash
pnpm --filter @oneshot/recovery-ui verify
```

Tests cover contract redaction, every fixture story, Graph degradation,
pagination, duplicate observations, clock ambiguity, keyboard activation,
responsive breakpoints, React escaping of malicious evidence strings, and
automated accessibility checks.
