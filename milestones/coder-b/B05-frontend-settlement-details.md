# B05 — Frontend Authorization and Settlement Details

Owner: Coder B
Forecast: 2 working days
Branch: `milestone/b05-frontend-settlement-details`
Depends on: B04 and project Gate P4
Next: B06 immediately after closure

## Start gate

Do not write production UI before P4 freezes OpenAPI. Use the frozen mock server and sanitized UI fixtures.

## Outcome

An independently composable frontend slice explains policy, authorization, submission, and final transaction evidence without exposing secrets or offering bypass actions.

## Small tasks

### B05.1 — Policy summary

- Render network, asset, allowed recipient, cap, and policy status from sanitized API fields.
- Never display authorization keys, signatures, owner secrets, or raw policy responses.

### B05.2 — Authorization states

- Distinguish checking, authorized, denied, unavailable, and configuration mismatch.
- Explain denials without suggesting a bypass.

### B05.3 — Settlement states

- Render ready, submitting, pending/unknown, committed, final revert/failed-safe, and unavailable evidence.
- `UNKNOWN` disables any new settlement action.
- Do not show confirmation counts; Arc is pending or final.

### B05.4 — Verified transaction details

- Display sanitized transaction hash, block, token, recipient, exact amount, Transfer identity, and Arc explorer link only when verified.
- Validate outbound explorer URL and prevent unsafe interpolation.

### B05.5 — Component tests

- Cover all fixtures, redaction, malicious strings/URLs, unavailable evidence, and exact amount formatting.
- Run accessibility, keyboard, responsive, lint, type, and build checks package-locally.

## Acceptance evidence

- Slice passes independently in Storybook/test host or equivalent using frozen fixtures.
- No force-pay, policy-bypass, resend, or direct adapter action exists.
- Secrets/raw provider payloads have no component prop or rendered path.
- Unknown states remain visibly non-terminal and non-retryable.

## Handoff artifact

Publish component entry point, route slot, fixture stories/tests, mock-server version, and composition note.

## No-wait continuation

Start B06. Project Gate P5 composes A/B/C slices later.

## Non-goals

No app shell, create form, recovery timeline, or final visual polish.
