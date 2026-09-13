# Session Context: pending delivery refresh

## Date/time

- UTC: 2026-09-13T17:00:00Z

## User goal

A request whose payment has settled kept showing "Retrieving result" even
though the supplier result was already available, intermittently and without a
clear trigger. Make the list reflect the delivery that has actually completed.

## Original prompt/request

"we need another fix. After transaction is done it still showing retrieving
result (picture 1), when results logically should be ready, like in picture 2.
Sometimes it works, sometimes it doesnt, i dont know scenarios, but right now on
our latest operation we dont need retrieving results, bc results ARE ready."
Follow-up: skip Gate A and Gate B, open the pull request as a draft.

## Assumptions

- The reported screenshots show one list read: the newest request is `PENDING`
  while an older one is `AVAILABLE`, which is a stale snapshot of a delivery
  still in flight rather than a rendering fault.
- Bounded read-only re-reads are an acceptable middle ground against the
  earlier report that automatic follow-up reads created unwanted traffic.
- No live payment or deployment is involved.

## Plan

1. Commit, push, and open a draft pull request against `develop`.

## Key decisions

- `JobList` re-reads `GET /v1/jobs` while any delivery is `PENDING`: every four
  seconds, fifteen attempts, then it stops. It never calls the resume endpoint
  and never submits a payment, so the at-most-once settlement invariant is
  untouched.
- The re-reads are quiet: they do not raise the loading flag, because the
  spinner, the disabled refresh button, and the `.tab-fade` remount all belong
  to a read the operator asked for.
- This partially reverses commit `a2903a1`, which removed automatic polling
  after a report of unwanted traffic. The bound and the pending-only condition
  are what keep both reports satisfied; the resume control it removed stays
  removed.
- A delivery stranded in `PENDING` server-side is out of scope here and is
  recorded below as an unresolved risk.

## Files/components touched

- `apps/web/src/components/JobWorkspace.tsx` - bounded, quiet re-reads of the
  request list while a delivery is pending.
- `apps/web/test/components.test.tsx` - the re-read reaches `Result ready`,
  stops once nothing is pending, and gives up on a delivery that stays pending.
- `apps/web/browser/p5.spec.ts` - the read count is now a lower bound, because
  an exact count would flake once a pending delivery is re-read on a timer.

## Commands/checks

- `pnpm format:check` - PASS
- `pnpm lint` - PASS
- `pnpm typecheck` - PASS
- `pnpm test` - PASS, 81 files / 1057 tests, includes build. The root vitest
  config covers no `.tsx` file, so the command below is the one that exercises
  these components.
- `pnpm --filter @oneshot/web test` - PASS, 17 files / 97 tests
- `pnpm test:browser` - PASS, 8 tests
- Local Node is 24.20.0 against the pinned 24.19.0; CI must validate the
  pinned runtime.

## External-doc findings

- None. No version-sensitive integration changed.

## Unresolved questions

- A delivery that is stranded in `PENDING` cannot be recovered: `resumeDelivery`
  re-queues only `NOT_REQUESTED` or `RETRIEVAL_FAILED`, and the web resume
  control was removed, so a `PENDING` job whose outbox row was already consumed
  has no path forward. The bounded re-reads give up on such a job rather than
  fixing it. This needs a separate backend change.

## Git and PR state

- Branch: fix/pending-delivery-refresh
- Base: develop (68626d26bd0ddb7a39dda2aa02f53979d493a5f9)
- Commit: this record plus the implementation commit
- PR: draft, opened after push
- CI: runs on the pushed head

## Review gates

- Gate A: SKIPPED at the user's explicit instruction. This is a deliberate
  deviation from `.agent/IMPLEMENTATION_LOOP.md` §4-5, not a pass.
- Gate B: SKIPPED at the user's explicit instruction. Same deviation, §7.

## Handoff/next steps

1. Run Gate A, and Gate B on the PR head, before this leaves draft.
2. A human owner reviews and merges.
