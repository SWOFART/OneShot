# Session Context: user-friendly workspace

## Date/time

- UTC: 2026-09-12T01:15:31Z

## User goal

Create a separate reviewable pull request that makes the authenticated OneShot
workspace understandable to non-developers. Remove technical labels and raw
identifiers from the primary surface, replace Developer Access / Wallet
Permission / Tools / Jobs / Recovery Assets with clear user-facing concepts,
and keep technical evidence available behind an explicit details boundary.

## Original prompt/request

The user asked to implement the previously agreed UX plan in a separate PR:
remove the 100% developer-access presentation, redesign wallet permissions,
improve payment review, make tools and jobs clearer, and rebuild recovery UI so
the workspace is ready for human review rather than a collection of internal
technical panels.

## Assumptions

- This PR is frontend-only. Existing API contracts and settlement invariants
  remain authoritative.
- The current workspace supports read-only policy/access presentation; it does
  not expose a policy-editing API. The UI must not imply that it can edit rules.
- Full identifiers, addresses, provider details, and raw state names remain
  available only in advanced evidence/details surfaces.

## Plan

1. Add a shared user-facing status/copy mapping and safe masking helpers.
2. Reshape the authenticated cabinet navigation and overview.
3. Replace wallet/developer/recovery panels with Spending Rules, Team & Access,
   and Payment Protection views.
4. Make service/request/review cards human-readable and hide raw identifiers.
5. Improve the legacy payment status surface without removing UNKNOWN from the
   domain or reconciliation behavior.
6. Update focused tests, run web checks, and capture Gate A/PR state.

## Key decisions

- `UNKNOWN` is not removed from backend or durable state; it is rendered as
  plain-language payment verification so users are not invited to retry.
- Recovery Assets is removed as a primary concept. Recovery is presented as
  Payment Protection, with evidence and Graph/agent internals behind details.
- No new dependency, backend permission model, or payment path is added.

## Files/components touched

- `apps/web/src/App.tsx`
- `apps/web/src/components/JobWorkspace.tsx`
- `apps/web/src/components/IntentStatusView.tsx`
- `apps/web/src/components/LoginGate.tsx`
- `apps/web/src/components/WorkspacePanels.tsx`
- `apps/web/src/components/workspace-copy.ts`
- `apps/web/src/styles.css`
- Focused web tests and browser acceptance tests.

## Commands/checks

- `git fetch origin develop` - completed; base is `origin/develop` at
  `bfaf733b779dece7adc61c8b6483b1360e4f5667`.
- Worktree created on `feature/user-friendly-workspace`.
- `pnpm --filter @oneshot/web typecheck` - PASS (Node 22.23.2 engine warning;
  repository requests Node 24.19.0).
- `pnpm --filter @oneshot/web lint` - PASS.
- `pnpm format:check` - PASS.
- `pnpm --filter @oneshot/web test -- --no-file-parallelism --maxWorkers=1
  --pool=threads --reporter=dot` - PASS, 18 files / 78 tests.
- `pnpm --filter @oneshot/web test:browser` - PASS, 4 browser scenarios.
- `pnpm build` - PASS.
- `pnpm test -- --no-file-parallelism --maxWorkers=1 --pool=threads
  --reporter=dot` - PASS, 80 files / 1049 tests.
- `git diff --check` - PASS.

## External-doc findings

- `.agent/PROJECT_CONTEXT.md` - OneShot remains authoritative for payment
  state; UI changes must not change settlement authority.
- `.agent/SECURITY_INVARIANTS.md` - preserve UNKNOWN/reconciliation and never
  expose secrets or signing material.

## Unresolved questions

- None for the frontend scope. Backend-enforced team roles remain a later
  milestone because no editing/role API is present in this branch.

## Git and PR state

- Branch: `feature/user-friendly-workspace`
- Base: `origin/develop` / `bfaf733b779dece7adc61c8b6483b1360e4f5667`
- Commit: uncommitted; candidate tree staged before commit
- PR: not created
- CI: not run

## Review gates

- Gate A: skipped at the user's explicit request.
- Gate B: skipped at the user's explicit request.

## Handoff/next steps

1. Commit only the focused UI changes, push, and open a draft PR targeting
   `develop`.
2. Human review and CI remain pending on the PR; no FreePi review gate was run.
