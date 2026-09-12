# Session: clarify payment service labels

## Date/time

2026-09-12 17:28 UTC.

## User goal and original request

Rename the website surfaces that currently imply two external API products. The
first flow is a direct Arc Testnet USDC payment with a team-operated sample
result. The second flow buys a dataset from OneShot's own x402 seller.

## Assumptions and acceptance

- Change user-facing copy and matching tests only.
- Preserve tool identifiers, API contracts, payment behavior, recipients, and
  settlement logic.
- Label the team-operated x402 seller explicitly.
- Keep the direct payment purpose as the existing `report_subject` payload field.

## Plan and decisions

- Rename `API services` to `Payment services`.
- Rename `Company research service` to `Direct Arc payment`.
- Rename `Company or domain` to `Payment purpose`.
- Rename `Circle Dataset API` to `OneShot x402 Dataset` and identify it as a
  team-operated demo.

## Files/components touched

- `apps/web/src/App.tsx`
- `apps/web/src/components/JobWorkspace.tsx`
- `apps/web/src/components/workspace-copy.ts`
- Focused web unit and browser tests.

## Commands/checks

- `pnpm --filter @oneshot/web exec vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 --no-file-parallelism` — PASS (18 files, 83 tests).
- `pnpm --filter @oneshot/web typecheck` — PASS after clearing incomplete generated output left by a full disk.
- `pnpm lint` — PASS.
- `pnpm format:check` — PASS.
- `pnpm --filter @oneshot/web test:browser` — PASS (8 Playwright tests).
- `git diff --check` — PASS.

## External-doc findings

None. This change follows current repository behavior.

## Unresolved questions

None for this copy-only scope.

## Branch/commit/PR state

- Branch: `fix/clarify-payment-services`
- Base: `origin/develop` at `ff146e49407b078183ed619ff3f3b2e11b17da2c`.
- Commit and PR: pending.

## Gate state

- Gate A: explicitly waived by the user on 2026-09-12.
- Gate B: explicitly waived by the user on 2026-09-12.

## Handoff/next steps

Commit the validated candidate, push the branch, and open a PR for human review.
