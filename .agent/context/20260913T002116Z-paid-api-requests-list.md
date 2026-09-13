# Session Context: Durable paid-API requests list

## Date/time

- UTC: 2026-09-13T00:21:16Z

## User goal

Keep paid-API purchases visible in Requests after page reload and let the operator reopen the existing Payment Proof without creating another payment.

## Original prompt/request

The user asked whether API purchases should be added to Requests like ordinary transactions because Payment Proof disappears after page refresh, then requested implementation.

## Assumptions

- The existing `paid_api_requests` rows and `business_intent_id` are the durable source of truth.
- A paid-API quote alone is not a request; the durable row starts at `prepare`/approval.
- Listing is read-only and must not enqueue, retry, sign, or submit payment.

## Plan

1. Add a durable unified request-list API projection for team-report jobs and paid-API purchases.
2. Load the unified list in Requests and render paid-API rows with their payment state and proof link.
3. Add contract, API, storage, client, and UI regression coverage.

## Key decisions

- Added `GET /v1/requests`, which merges the existing job ledger list and paid-API ledger list, sorts by durable `updated_at`, and caps the response at 100 rows.
- Paid-API rows reuse their existing `business_intent_id`; selecting a row opens the existing settlement/recovery surfaces. No new payment endpoint or retry action was introduced.
- The old `GET /v1/jobs` remains available for compatibility; the Requests UI uses the unified endpoint with a runtime fallback for older test compositions.
- The browser client also falls back from a server `404` on `/v1/requests` to `GET /v1/jobs`, preserving older demo/API deployments during rollout.

## Files/components touched

- `packages/contracts/scripts/generate-contracts.mjs` and generated artifacts - `RequestListItem`, `RequestListResponse`, and `/v1/requests`.
- `packages/storage-postgres/src/ledger.ts` - read-only `listPaidApi` projection ordered by update time.
- `apps/api/src/paid-api.ts`, `apps/api/src/app.ts` - paid-API list service and unified API route.
- `apps/web/src/api/job-client.ts`, `apps/web/src/components/JobWorkspace.tsx` - durable Requests loading and paid-API row/proof link.
- Tests across contracts, API, storage integration, client, and UI.

## Commands/checks

- `pnpm.cmd test` - 82 files / 1090 tests passed.
- `pnpm.cmd typecheck` - passed.
- `pnpm.cmd lint` - passed.
- `pnpm.cmd format:check` - passed.
- `pnpm.cmd check:generated` - generated contracts current.
- `pnpm.cmd test:browser` - 8/8 passed; the legacy endpoint fallback was exercised by the browser demo server.
- PostgreSQL integration tests remain gated by `TEST_POSTGRES=1`; the new `listPaidApi` assertion follows the existing gated suite convention.

## External-doc findings

- None required; this is an internal durable projection and UI navigation change.

## Unresolved questions

- The separate Circle Gateway aggregate-batch verifier fix is in another branch and is not part of this candidate.

## Git and PR state

- Branch: `fix/paid-api-requests`
- Base: `origin/develop` at `f225601de0ddf265ee3367fa5ef69972ab458c08`
- Commit: uncommitted staged candidate pending Gate A
- PR: not created
- CI: not run

## Review gates

- Gate A: NOT RUN
- Gate B: NOT RUN

## Handoff/next steps

1. Stage the candidate and request a fresh Gate A review.
2. After approval, commit/merge and deploy the API image plus web assets.
3. Reload Requests; select the paid-API row to reopen Payment Proof for the original intent.
