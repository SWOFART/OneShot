# Recovery proof palette and Graph backfill — active context

## Goal

Make Graph candidate discovery appear for historical committed settlements and
bring Payment proof / Recovery control into the main OneShot palette without
removing evidence or weakening settlement safety.

## Acceptance criteria

- Historical `COMMITTED` settlements missing Graph evidence receive one durable,
  idempotent `capture_graph_evidence` outbox job.
- New settlement behavior and Graph authority remain unchanged.
- Missing Graph copy distinguishes an observation that is still pending from
  proof that no payment happened.
- Payment proof and recovery use the shared surface, ink, line, radius, and font
  tokens used by the authenticated workspace.
- Existing responsive and accessibility checks remain green.

## Constraints

- Graph remains non-authoritative candidate discovery; Arc and OneShot remain
  authoritative.
- No live payment, deployment, or external configuration change.
- The dirty `fix/x402-wallet-proof-recovery` worktree is unrelated user work and
  must remain untouched.

## Branch state

- Branch: `fix/recovery-proof-palette`
- Base: `origin/develop` at `72c4bd7` (rebased by fast-forward from `964d475`
  after PR #130 landed; no file overlap with this change)
- Worktree: `recovery-proof-palette`

## Plan

1. Add the smallest append-only migration that backfills missing Graph capture
   jobs from durable settlements.
2. Reuse the shared brand tokens in both read-only UI slices and clarify missing
   Graph evidence copy.
3. Run focused tests, visual browser checks, the implementation loop, and review
   gates required for the final staged tree.

## Review gates

- Gate A: pending
- Gate B: pending

## Base update

- While the work was in progress, `origin/develop` advanced from `964d475` to
  `72c4bd7` (merge of PR #130, MCP generated request keys). The branch had no
  commits yet, so it fast-forwarded; the diff has zero file overlap with this
  change and local checks were re-run on the updated candidate tree.

## Implementation

- Added migration `013_backfill_graph_evidence.sql`; it enqueues one Graph
  capture job only when a durable settlement has neither Graph evidence nor an
  existing capture job.
- Missing Graph evidence now reads `CAPTURE PENDING` for committed settlements
  and `NOT YET REPORTED` for non-terminal recovery states.
- Recovery uses the shared Rubik/mono typography, brand radii, pill actions,
  lime authoritative-state summary, and a light/dark-aware Graph evidence card.
- Payment proof uses the same lime request summary and shared typography/radii;
  long policy values wrap instead of colliding with adjacent facts.

## Validation

- `pnpm test` — PASS, 80 files / 1,056 tests.
- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm format:check` — PASS.
- `pnpm check:generated` — PASS.
- `git diff --check` — PASS.
- Recovery and settlement standalone pages rendered and inspected at desktop
  width, including the missing-Graph state.
- PostgreSQL integration test added for the backfill and migration idempotency,
  but not executed locally because Docker/PostgreSQL is unavailable.
- Existing composed-browser test could not unlock the latest Privy-first app
  because its `Machine token (advanced)` locator is stale; this reproduces on
  the unmodified `origin/develop` UI and is not caused by this change.
