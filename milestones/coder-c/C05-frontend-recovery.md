# C05 — Frontend Recovery Timeline and Evidence History

Owner: Coder C
Branch: `milestone/c05-frontend-recovery`
Depends on: C04 and project Gate P4
Next: C06 immediately after closure

## Start gate

Do not write production UI before P4 freezes recovery-view semantics. Build against the frozen mock server and sanitized fixtures.

## Outcome

An independently composable recovery slice shows authoritative state, attempts, reconciliation, provider/Arc evidence, and Graph observations with clear provenance and no retry shortcut.

## Small tasks

### C05.1 — Attempt/reconciliation timeline

- Render ordered attempts, durable transitions, evidence retrieval, reconciliation decisions, and current authoritative state.
- Handle pagination, duplicate observations, and clock/order ambiguity safely.

### C05.2 — Evidence provenance

- Label local, Privy, Arc, and The Graph source plus authority class.
- Show verified transaction binding and contradiction warnings without raw sensitive payloads.

### C05.3 — Graph freshness and candidate state

- When enabled, display provider/deployment identity, observed-through block/time, chain-head lag, health errors, and unavailable state; hide the section cleanly when the C01 fallback disables Graph.
- Empty result reads “not observed through block N,” never “not paid.”

### C05.4 — UNKNOWN experience

- Explain why new settlement is blocked and what reconciliation/operator action is safe.
- Provide escalation/status refresh only; no generic retry or force-pay button.

### C05.5 — Component tests

- Cover fresh, empty, lagging, unhealthy, unavailable, contradictory, pending, committed, failed-safe, and aged-UNKNOWN fixtures.
- Test malicious evidence strings, accessibility, keyboard, responsive layout, lint, type, and build.

## Acceptance evidence

- Slice passes independently against frozen fixtures and mock server.
- Authority and observation are never visually conflated.
- Empty/lagging/error Graph states cannot imply non-payment or enable retry.
- No secret/raw provider body has a component input or render path.

## Handoff artifact

Publish component/route entry point, fixture stories/tests, mock-server version, copy glossary, and composition note.

## No-wait continuation

Start C06. Project Gate P5 composes A/B/C slices later.

## Non-goals

No app shell, create form, policy controls, settlement action, or broad visual redesign.
