# Session Context: graph-transaction-evidence

## Date/time

- UTC: 2026-09-13

## User goal

Make The Graph call and display evidence for transactions performed through the
site, regardless of whether the OneShot request is confirmed, failed safely, or
remains uncertain.

## Original prompt/request

“Our the graph is never called and give any info on our transactions. Fix it so
The Graph shows evidence for transactions performed via our site, whether the
transaction failed or was approved.”

## Assumptions

- The Graph remains non-authoritative; OneShot and Arc receipt evidence decide
  settlement state.
- A failed/rejected request may have no indexed ERC-20 Transfer event. The UI
  must show that state and say that missing Graph data is not proof of no
  payment.
- User-wallet payer addresses must be discovered from durable workspace jobs;
  the configured server wallet remains an optional fallback for server-wallet
  activity.
- The pre-existing edit to the prior session context remains user-owned.

## Plan

1. Make API Graph activity use all durable workspace payer wallets and refresh
   automatically from the cabinet.
2. Return and render a workspace transaction ledger with Graph match status for
   every site request outcome.
3. Enqueue durable Graph evidence capture for confirmed, failed-safe, unknown,
   and rejected lifecycle outcomes.
4. Add focused API, storage, worker, and browser/UI regression coverage.

## Key decisions

- A missing indexed transfer is displayed as `NOT_INDEXED`, never as proof that
  a payment did not happen.
- A failed Graph read is displayed as `UNAVAILABLE`, not as a negative payment
  result.
- Failed-safe and rejected requests are represented in the site transaction
  ledger even when no transaction hash exists.
- Graph transport failures remain observable as unavailable activity and do not
  change payment state or create retry permission.

## Branch state

- Branch: `fix/graph-transaction-evidence`
- Base: refreshed `origin/develop` at `65200cc2dfcf22912e532a157232e439d623044f`.
- Commit/PR: not created.
- Gate A/B: not started.

## Checks

- Policy and routed idempotency/failure-injection documents read.
- `pnpm --filter @oneshot/contracts check:generated` passed.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Focused API/storage/worker/web suites passed.
- Full `pnpm test` passed: 80 files, 1,057 tests.
- `pnpm test:browser` passed: 8 browser tests.
- `pnpm test:integration` loaded all integration suites but skipped them because
  this workstation has no container runtime.
- No commit, push, PR, deployment, or FreePi Gate A/B run has been performed
  yet; these are pending the explicit push/PR request.

## Unresolved questions

- The Graph indexes successful ERC-20 transfer events; reverted/no-transfer
  transactions cannot be fabricated into the subgraph. They will be shown with
  their OneShot outcome and explicit non-proof wording.

## Handoff/next steps

Stage the scoped tree, run Gate A, commit, push, open the draft PR, wait for
required CI, and run Gate B before handing off for human review.
