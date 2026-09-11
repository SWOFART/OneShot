# Plan implementation gap analysis

Audited against `plan.md` revision 2026-09-10 on branch
`feat/implement-plan-gap-analysis`.

## Delivered in this branch

- **R0/R1 foundation:** a stable workspace/tool/task-key maps atomically to one
  team-operated testnet supplier order and one derived Business Intent. Payload
  changes under that identity return a conflict. The job owns separate delivery
  state and a persisted result reference.
- **Delivery safety:** a verified committed settlement queues original-order
  fulfillment only. A delivery failure becomes `RETRIEVAL_FAILED`; resume can
  re-run retrieval/fulfillment for the same order and cannot create a payment.
  A unique `(transaction_hash, transfer_log_index)` prevents one observed
  transfer from being associated with two jobs.
- **R2:** `/` is a public landing page; `/app` is an authenticated cabinet with
  overview, tools, jobs, recovery/activity, wallet/permissions and developer
  access sections. Payment evidence remains advanced detail.
- **R3 implementation seam:** Graph activity has a bounded manual refresh,
  validates response structure, stores freshness/coverage metadata, compares
  indexed transfers with workspace-owned settlements, and surfaces unmatched
  transfers without changing local payment state. Configuration is explicit
  and server-side.

## Still external or human-gated

- **R4 live demonstration:** requires an explicitly authorized Arc Testnet
  purchase, controlled response-loss fault, fresh Studio capture, receipt/log
  verification and a real supplier-result capture. No local test or fixture is
  presented as this evidence.
- **R5 release:** requires exact-head CI, fresh FreePi Gate A and Gate B,
  public deployment/docs/video, prize-pool verification and human review. This
  branch makes no qualification or release claim.

## Validation boundary

Unit/build suites cover the new contract and worker seams. The PostgreSQL
Testcontainers integration test adds concurrent task-binding coverage but could
not run in this workspace because no container runtime is available. Run it in
an environment with Docker or another supported Testcontainers runtime before
reviewing the change as production-ready.
