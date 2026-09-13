# Current Delivery Gaps

Updated 2026-09-10 for the [resumable paid-tools plan](plan.md).
Planning backlog only; no fresh live qualification is claimed.

## Existing foundation

Durable intents/outbox, worker, Privy/Arc adapters, Studio recovery, advisor,
operator authentication and four-tab UI are reused. Historical P4/P5 evidence
does not prove the new job workflow or current deployment health.

## New increment: R0–R3 delivered; R4/R5 remain evidence-gated

| Gate | Missing work | Acceptance boundary |
| --- | --- | --- |
| R0 | Supplier/task/ownership/delivery/binding/route contracts | Delivered in the R0–R3 foundation; keep one supported supplier and scoped Privy execution |
| R1 | Durable job/order/result and one connector | Delivered; two-agent/concurrency/restart tests share one intent/payment and delivery never repays |
| R2 | Separate landing and cabinet | Delivered at `/` and `/app`; accessible job-centered UX over authenticated APIs |
| R3 | Live bounded activity audit and job-aware triage | Delivered seam; fresh Studio evidence and ambiguous transfer binding remain runtime evidence |
| R4 | Live interrupted-job demonstration | Reviewed testnet-only response-loss hook and sanitized runner; real payment, Studio capture and supplier result still require authorization |
| R5 | Release and submission | `release:check` and checklist are delivered; exact-head FreePi A/B, fresh live evidence, optional video, correct pool, and human review remain |

## Current limitations

- Recovery already queries Graph; the activity endpoint now compares indexed
  transfers with workspace-owned settlements and reports unmatched rows.
  More queries alone do not establish AI value.
- Indexed memoId is null. Transfer tuples may collide. Order binding and
  cross-job transfer attribution must be proved in R0/R1.
- The existing demo:e2e command is offline rehearsal, not fresh live evidence.
- `demo:r4` is offline by default. Live R4 needs an explicitly authorized Arc
  Testnet run, a fresh Studio response, and a real supplier result; no recorded
  submission video is included.
- New job/result endpoints require server-side workspace access controls.
  Authentication alone does not isolate records.

## Deferred

Mainnet requires official parameters, explicit authorization and actual
deployment proof. Circle Agent Stack, multichain, pooled budgets, treasury,
payroll and arbitrary supplier integrations remain out of scope.

## Next action

Next: run the opt-in R4 drill with a stable task key, then capture exact
sanitized evidence before final submission. The R5 release preflight is
offline-only; do not claim live sponsor qualification from rehearsal output.
