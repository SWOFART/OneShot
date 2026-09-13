# Session Context: activity refresh empty body

## Date/time

- UTC: 2026-09-12T17:08:00Z

## User goal

Make the payment activity refresh usable in the live OneShot console. The UI
currently reports that activity is unavailable because the backend returns 400
for the read-only refresh request.

## Original prompt/request

User reported: `Payment activity is unavailable right now. Existing payment records are unchanged.`

## Assumptions

- The browser request is authorized and intentionally bodyless; its JSON content
  type is the compatibility trigger.
- This endpoint only reads Graph activity and records an observation; it must not
  submit or alter a payment settlement.
- Preserve required JSON validation on all other API routes.

## Plan

1. Confirm the live 400 cause from API code and Cloud Run logs.
2. Add a route-scoped backend compatibility fix and regression test.
3. Run API checks, capture Gate A evidence, then review/push/deploy per policy.

## Key decisions

- Handle the empty JSON header in the API onRequest hook for
  `/v1/activity/refresh` only. The existing browser client cannot be assumed to
  change in this backend-only fix.
- Keep the request body parser and validation unchanged for routes that require
  JSON payloads.

## Files/components touched

- `apps/api/src/app.ts`: accept bodyless JSON POST for activity refresh.
- `apps/api/test/app.test.ts`: regression coverage with JSON content type.

## Commands/checks

- Cloud Run request logs show repeated `POST /v1/activity/refresh` HTTP 400.
- Cloud Run service config has no Graph activity variables, so runtime uses the
  unavailable read-only activity port; this should still return a stored snapshot.
- API and Fastify source inspection identified `FST_ERR_CTP_EMPTY_JSON_BODY`.
- `pnpm --filter @oneshot/api... build` - PASS.
- `pnpm --filter @oneshot/api test -- --run test/app.test.ts` - PASS (20 tests).
- `pnpm --filter @oneshot/api test -- --run test/wallet-activity.test.ts` - PASS (2 tests).
- `pnpm --filter @oneshot/api typecheck` - PASS.
- `pnpm --filter @oneshot/api lint` - PASS.
- `pnpm format:check` - PASS.
- `pnpm typecheck` - PASS.
- `pnpm lint` - PASS.
- `pnpm check:generated` - PASS.
- `pnpm test` - PASS (82 files / 1078 tests).

## External-doc findings

- None required; diagnosis uses the repository Fastify route and live Cloud Run
  status/log evidence.

## Unresolved questions

- Whether to deploy immediately after Gate A/CI; prior user authorization covers
  updating the live Cloud Run API, but human merge remains required by policy.
- Gate A could not be completed: three fresh FreePi attempts either hit the
  provider's `409 concurrent_session` or remained in `Working...` without a
  structured verdict. No code or staged content was changed by those attempts.

## Git and PR state

- Branch: `fix/activity-refresh-empty-body`
- Base: `develop` at `ff146e49407b078183ed619ff3f3b2e11b17da2c`
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: BLOCKED — external FreePi provider returned no usable verdict after
  repeated attempts (`409 concurrent_session`/indefinite `Working...`).
- Gate B: NOT RUN

## Handoff/next steps

1. Inspect/stage only the two implementation files and context record.
2. Retry Gate A only when the external FreePi session is available; do not
   claim a pass from a partial or timed-out response.
3. After Gate A passes, commit, push, create a draft PR, wait for required CI,
   then run Gate B.
4. Deploy the exact reviewed image to Cloud Run only after the review workflow
   permits it, then verify `/health/live` and the activity refresh behavior.
