# Current Delivery Gaps

Updated 2026-09-10 for the [resumable paid-tools plan](plan.md).
Planning backlog only; no fresh live qualification is claimed.

## Existing foundation

Durable intents/outbox, worker, Privy/Arc adapters, Studio recovery, advisor,
operator authentication and four-tab UI are reused. Historical P4/P5 evidence
does not prove the new job workflow or current deployment health.

## New increment: all gates not started

| Gate | Missing work | Acceptance boundary |
| --- | --- | --- |
| R0 | Supplier/task/ownership/delivery/binding/route contracts | Feasible supplier, scoped Privy execution, no guessed order association |
| R1 | Durable job/order/result and one connector | Two agents share purchase; paid delivery failure never repays |
| R2 | Separate landing and cabinet | Accessible job-centered UX over real APIs |
| R3 | Bounded activity audit and job-aware triage | Live cited evidence; explicit coverage; ambiguous binding holds |
| R4 | Live interrupted-job demonstration | Real payment, labelled fault, live Graph where needed, same supplier result |
| R5 | Release and submission | Exact-head checks, FreePi A/B, public docs/video, correct pool, human review |

## Current limitations

- Recovery already queries Graph; routine wallet audit is new work. More
  queries alone do not establish AI value.
- Indexed memoId is null. Transfer tuples may collide. Order binding and
  cross-job transfer attribution must be proved in R0/R1.
- Supplier delivery and job APIs are planned; preserve existing intent clients
  through additive contracts.
- Landing and console currently share a page. Raw intent/hash views become
  advanced details, not the default task.
- The existing demo:e2e command is offline rehearsal, not fresh live evidence.
  No recorded submission video is included.
- New job/result endpoints require server-side workspace access controls.
  Authentication alone does not isolate records.

## Deferred

Mainnet requires official parameters, explicit authorization and actual
deployment proof. Circle Agent Stack, multichain, pooled budgets, treasury,
payroll and arbitrary supplier integrations remain out of scope.

## Next action

After this planning PR is reviewed, implement R0 on a separate branch. Select
and prove one supplier's idempotency/retrieval semantics before production
job implementation or UX integration.
