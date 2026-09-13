# Gate P5 Frontend Acceptance Checklist

## Objective

Compose the A05 intent/status shell, B05 authorization and settlement evidence,
and C05 recovery evidence into one operator-facing web application while
preserving the rule that the UI never grants settlement permission.

## Composition

| Surface              | Entry point                                            | Runtime boundary                                                                            |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Create or replay     | `apps/web` A05 shell                                   | `OneShotApiClient` and frozen OpenAPI v1                                                    |
| Authoritative status | `apps/web` A05 shell                                   | Durable OneShot intent state and read-only reconciliation                                   |
| Settlement evidence  | `SettlementDetailsRoute` from `@oneshot/settlement-ui` | Read-only settlement client with the shared API/token seam                                  |
| Recovery evidence    | `RecoveryRoute` from `@oneshot/recovery-ui`            | `createApiRecoveryClient` projects the frozen recovery-view API into the C05 timeline model |

The selected Business Intent ID and memory-only service token are shared across
all four tabs. The shell uses APG tab semantics with roving focus and
Arrow/Home/End navigation. No surface exposes payment, resend, force-pay,
policy-bypass, or generic retry controls. UNKNOWN remains reconciliation-only,
and recovery evidence always renders `settlementPermission: NEVER`.

## Frozen recovery API boundary

`GET /v1/intents/{id}/recovery-view` remains backward compatible and may expose
sanitized Recovery Agent, deterministic-core, Subgraph MCP, and bounded
candidate metadata. The web recovery client maps those fields into the C05
timeline schema and uses labelled fail-closed fallbacks for legacy or absent
data. Graph and model observations never grant settlement permission.

## Acceptance evidence

- [x] A05 stable create/replay/conflict and authoritative state families remain covered.
- [x] B05 denial, cap, committed, UNKNOWN, unavailable, malicious URL,
      redaction, keyboard, and contrast behavior remain covered.
- [x] C05 fresh, empty, lagging, unhealthy, unavailable, multiple/contradictory,
      invalid-agent-output, committed, failed-safe, and aged-UNKNOWN scenarios remain covered.
- [x] The composed shell covers all four tabs, loaded and empty settlement
      states, live frozen-API recovery projection, and no settlement action.
- [x] `pnpm --filter @oneshot/web test`: 35 tests passed on a clean UI-dist state.
- [x] `pnpm --filter @oneshot/web lint`: passed.
- [x] `pnpm --filter @oneshot/web typecheck`: passed.
- [x] `pnpm --filter @oneshot/web build`: passed.
- [x] `pnpm build:frontend`: passed.
- [x] `pnpm lint`: passed.
- [x] `pnpm typecheck`: passed.
- [x] `pnpm test`: 66 files and 977 tests passed after clean UI-dist removal;
      browser suites are excluded from Vitest.
- [x] `pnpm --filter @oneshot/web typecheck:browser`: passed.
- [x] `pnpm test:browser`: 7 Chromium tests passed, including create/replay,
      conflict, denial, unavailable, committed, UNKNOWN, recovery degradation,
      read-only settlement, token-memory, keyboard, and 390/1280-pixel checks.
- [x] `pnpm format:check` passes after browser execution; Playwright output is
      ignored under `apps/web/test-results/` and `apps/web/playwright-report/`.
- [x] `pnpm check:generated`: passed.
- [x] `pnpm validate:fixtures`: passed (9 contract and 7 UI fixtures).
- [ ] Interactive human desktop/mobile click-through remains open in this agent
      host; automated Chromium smoke and CI are the recorded evidence.

## Security and scope notes

- The runtime service token remains memory-only in the browser and is sent only
  as a Bearer header through the injected API seams.
- B05 receives sanitized contract fields through a public read-only client; it
  has no settlement adapter or submission method.
- C05 recovery projection is read-only and fail-closed. The frozen API has no
  durable operator-escalation endpoint, so the UI does not invent one.
- No credentials, keys, wallet material, generated build output, or ignored
  runtime files are part of this change.

## Gate state

This comparison branch records implementation and local automated evidence only.
It does not claim Gate A or Gate B. A fresh Gate A is required for the final
candidate tree after this merge is committed or otherwise submitted for review.
