# A05 — Frontend Intent and Authoritative Status

Owner: Coder A
Branch: `milestone/a05-frontend-intent-status`
Depends on: A04 and project Gate P4
Next: A06 immediately after closure

## Start gate

Do not start until P4 freezes OpenAPI and recovery semantics. Before P4, fixtures and mock-server examples may be refined, but no production UI code is allowed.

## Outcome

A minimal accessible application shell creates/replays intents and displays authoritative local status without inventing settlement actions.

## Small tasks

### A05.1 — Application shell

- Add routing, API client generation, demo-appropriate service-auth handoff, error boundary, and test harness.
- Pin UI dependencies and keep source maps/secret behavior safe for the target environment.

### A05.2 — Intent form

- Validate stable ID, recipient, purpose, and atomic amount at the boundary.
- Format six-decimal USDC for humans without converting monetary values through floating point.
- Display Arc Testnet/USDC explicitly and separate native gas information.

### A05.3 — Replay/conflict behavior

- Preserve the same Business Intent ID on retry.
- Explain identical replay and same-ID payload conflict distinctly.
- Generate a new ID only for an explicitly new obligation.

### A05.4 — Status polling

- Render authoritative states and version, attempts summary, loading/error/offline behavior, and bounded polling/backoff.
- Treat `UNKNOWN` as blocked/reconciling, never as failed-safe.

### A05.5 — Browser/accessibility tests

- Cover create, replay, conflict, rate limit, unauthorized, unavailable, and all authoritative status families.
- Run keyboard, label, focus, contrast smoke, responsive viewport, lint, type, and build checks.

## Acceptance evidence

- Tests run against frozen mock server; no B/C UI code is needed.
- The UI cannot call a settlement port or create an unguarded retry.
- All displayed monetary values round-trip exact atomic units.
- Unknown API fields fail safely or remain non-authoritative.

## Handoff artifact

Publish shell/component entry points, browser fixtures, screenshots if useful, mock-server version, and composition note.

## No-wait continuation

Start A06. Final assembly of B05/C05 is project Gate P5, not A05 closure.

## Non-goals

No settlement details, optional history timeline, visual polish campaign, or force-pay action.
