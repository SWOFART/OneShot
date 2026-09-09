# Gate P5 Frontend Acceptance Checklist

## Objective

Compose the A05 intent/status shell, B05 authorization and settlement details,
and C05 recovery/evidence route into one operator-facing web application while
preserving the rule that the UI never grants settlement permission.

## Composition

| Surface              | Entry point                                            | Runtime boundary                                                                                              |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Create or replay     | `apps/web` A05 shell                                   | `OneShotApiClient` and frozen OpenAPI v1                                                                      |
| Authoritative status | `apps/web` A05 shell                                   | Durable OneShot intent state and read-only reconciliation                                                     |
| Settlement evidence  | `SettlementDetailsRoute` from `@oneshot/settlement-ui` | Read-only `createSettlementClient` using the same API/token seam                                              |
| Recovery evidence    | `RecoveryRoute` from `@oneshot/recovery-ui`            | Explicit synthetic C05 fixture review; the frozen API exposes `recovery-view`, not the richer timeline schema |

The composed shell exposes no payment, resend, force-pay, policy-bypass, or
generic retry action. UNKNOWN remains reconciliation-only, and C05 keeps
`settlementPermission: NEVER` visible in its recovery surface.

## Acceptance evidence

- [x] Stable create/replay/conflict behavior remains covered by A05 tests.
- [x] All authoritative intent state families remain covered by A05 tests.
- [x] B05 package tests cover denial, cap, committed, UNKNOWN, unavailable,
      malicious URL, redaction, keyboard, and contrast behavior.
- [x] C05 package tests cover fresh, empty, lagging, unhealthy, unavailable,
      multiple/contradictory, invalid-agent-output, committed, failed-safe, and
      aged-UNKNOWN recovery scenarios.
- [x] The composed web test covers all four tabs, keyboard tab navigation, and
      both empty and loaded settlement states; it asserts that settlement and
      recovery surfaces expose no payment action.
- [x] Clean-run `pnpm --filter @oneshot/web test`: 31 tests passed with the
      web Vitest config resolving both workspace UI packages from source.
- [x] `pnpm --filter @oneshot/web lint`: passed.
- [x] `pnpm --filter @oneshot/web typecheck`: passed.
- [x] `pnpm --filter @oneshot/web build`: passed.
- [x] `pnpm build:frontend`: passed.
- [x] `pnpm lint`: passed.
- [x] `pnpm typecheck`: passed.
- [x] Clean-run `pnpm test`: 59 files and 916 tests passed after the root
      Vitest aliases source the workspace UI packages directly (browser specs
      excluded from Vitest and run by `pnpm test:browser`).
- [x] `pnpm --filter @oneshot/web typecheck:browser`: passed.
- [x] `pnpm format:check`: passed after `pnpm test:browser`; Playwright output
      is ignored under `apps/web/test-results/` and `apps/web/playwright-report/`.
- [x] `pnpm check:generated`: passed.
- [x] `pnpm validate:fixtures`: passed.
- [x] Reproducible Playwright browser acceptance covers create, replay,
      conflict, denial, service-unavailable, committed, `UNKNOWN`, loaded
      settlement evidence, Graph discovery, lag/error/unavailable/multiple-
      candidate states, keyboard tab navigation, and 390/1280-pixel layout.
- [ ] Interactive browser smoke in this agent host: unavailable because no
      browser provider is exposed to the agent session. CI runs the Playwright
      suite with Chromium; the local host has not claimed a manual click-through.

## Security and scope notes

- The runtime service token remains memory-only in the browser.
- B05 receives sanitized API contract fields through its public read-only
  client; it has no settlement adapter or submission method.
- C05 fixture review is visibly labelled synthetic and cannot authorize a
  payment. Live hashless recovery evidence remains a backend/release concern,
  not a frontend shortcut.
- No credentials, keys, wallet material, or ignored runtime files are part of
  this change.

## Gate state

Implementation and automated acceptance evidence are complete. The gate is
not claimed as fully closed until a human or an available browser provider
performs the desktop/mobile smoke check and the required independent FreePi
reviews bind to the final candidate tree.
