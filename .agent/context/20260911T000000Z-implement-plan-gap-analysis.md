# Session Context: Implement plan gap analysis

## Date/time

- UTC: 2026-09-11T00:00:00Z

## User goal

Compare the revised `plan.md` to the current codebase, identify every remaining implementation gap, and implement the planned product increment on a focused feature branch.

## Original prompt/request

Compare our updated plan.md against the current codebase to identify all unimplemented or incomplete features. Checkout a new feature branch feat/implement-plan-gap-analysis and implement all remaining features required by plan.md.

## Assumptions

- “Implement all” covers R0–R3 code, contracts, tests, and documentation that can be completed locally. R4 requires a human-authorized live testnet payment and R5 needs external CI/review/release artifacts, so those gates cannot be truthfully completed by code alone.
- The initial connector is a team-operated, test-only report supplier with an explicit idempotent order/result contract; it makes no third-party adoption claim.
- The initial workspace model is a single configured/allowlisted workspace, enforced in the API and data model.

## Plan

1. Audit existing contracts, storage, APIs, worker, recovery, and web UI against R0–R3.
2. Add the smallest safe job/order/delivery and activity-audit slice, retaining existing intent APIs.
3. Replace the combined console with separated landing and authenticated cabinet flows.
4. Add focused safety, concurrency, restart, access-control, and UX tests; run required local checks.

## Key decisions

- Work is on `feat/implement-plan-gap-analysis`, created from clean `develop` at `f1298fa26b17b8a074bf4786dd714c57108eece3`.

## Files/components touched

- `packages/contracts`, `packages/domain`, `packages/storage-postgres`: additive job/order/delivery contracts, deterministic task identity, migration `006`, task binding, result persistence, and bounded activity observations.
- `packages/supplier-adapter`: one labelled team-operated testnet report connector with idempotent order/result behavior.
- `apps/api`, `apps/worker`: workspace-scoped job/result/activity APIs and a committed-payment-only delivery worker task.
- `apps/web`: separate public `/` and authenticated `/app` cabinet routes, job-first UX and manual read-only activity refresh.
- `docs/PLAN_GAP_ANALYSIS.md`, `README.md`, `.env.example`: implementation boundary, configuration, and remaining external gates.

## Commands/checks

- Read canonical agent policy, implementation loop, project/security/test guidance, idempotency and failure-injection skills.
- `git status --short --branch` - clean `develop...origin/develop` before branch creation.
- `git switch -c feat/implement-plan-gap-analysis` - created successfully.
- Initial Gate A review correctly found that a failed delivery could not be re-queued because the fulfilled outbox key was reused. The repair adds a fenced `delivery_attempt` generation to the job and the outbox key, so a resumed delivery uses a fresh task while preserving the original committed intent and supplier order. Stale generation workers cannot complete or fail a newer delivery attempt.
- Runnable coverage now includes `JobLedger` fenced retry behavior, supplier idempotency, committed-delivery failure/retry with zero settlement submissions, all job/activity API routes, and Studio Graph validation.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm check:generated`, `pnpm validate:fixtures`, `pnpm build`, and `pnpm test` - PASS after the repair; root test: 69 files / 984 tests.
- `TEST_POSTGRES=1 pnpm --filter @oneshot/storage-postgres test:integration` - blocked: this workspace has no working Testcontainers container runtime. The new real-PostgreSQL concurrent task-binding test is present but not executable here.
- CI follow-up after draft PR #72: the PostgreSQL rollback test incorrectly reused migration version 006 after this increment introduced that migration, so it now uses synthetic version 007. Legacy browser acceptance was opening the new public landing at `/` while expecting the retired operator console; it now exercises the public landing and authenticated `/app` cabinet/job/recovery flow. `pnpm --filter @oneshot/web test:browser` passes locally (4 Chromium tests), alongside the full local validation stack and 984 unit tests.
- CI follow-up after commit `0cccf6d`: storage and API PostgreSQL integration suites passed, but worker and restart-recovery cleanup failed because their `afterEach` TRUNCATE lists omitted `resumable_jobs`, the migration-006 child table referencing `business_intents`. Adding that table to both cleanup lists prevents cascading dirty-state failures; format, lint, typecheck, build, and 984 unit tests pass locally.
- Frontend follow-up: the authenticated cabinet now gives Tools responsibility for starting a report and Jobs responsibility for listing results, retrying delivery, and opening payment evidence. The supplier quote returned by the API (amount, recipient, network, and order reference) is rendered instead of hardcoded UI text; the wallet panel identifies Arc Testnet and the server-configured Privy execution boundary without exposing an address or secret. Composition and browser coverage now assert the split and exercise the Jobs resume path. Web unit tests and all 4 Chromium tests pass locally.

## External-doc findings

- No new external documentation was needed. Existing configured Studio GraphQL is optional for manual activity refresh; it remains evidence-only.

## Unresolved questions

- R4 live Arc/Studio/supplier interruption evidence and R5 CI/FreePi/release/human-review evidence remain external gates. No qualification claim is made.

## Git and PR state

- Branch: `feat/implement-plan-gap-analysis`
- Base: `develop` at `f1298fa26b17b8a074bf4786dd714c57108eece3`
- Commit: pending fresh Gate A for the frontend follow-up
- PR: #72 remains draft; frontend follow-up is not pushed yet
- CI: not run for the frontend follow-up

## Review gates

- Gate A: prior implementation and CI fixes passed; fresh Gate A required for the frontend follow-up tree before commit/push.
- Gate B: prior PR head passed; rerun after the frontend follow-up is pushed.

## Handoff/next steps

1. Run PostgreSQL integration tests in an environment with a supported container runtime.
2. Stage the frontend follow-up tree, obtain fresh Gate A before any commit/push, then follow the required CI/Gate B process for PR #72.
3. Perform the human-authorized R4 live demo and R5 release evidence separately; do not treat local fixtures as proof.
