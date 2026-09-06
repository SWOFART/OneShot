# Branch and Quality Policy

## Branch architecture

- `main`: stable release branch. Promote reviewed releases from `develop`.
- `develop`: integration branch and base for ongoing work.
- `feature/*`, `fix/*`, `milestone/*`: short-lived branches created from current
  `develop` and targeting `develop`.

No direct pushes, force pushes, history rewrites, or branch deletion on `main`
or `develop`. Agents never merge any PR. A human performs final review and
explicitly authorizes merge.

## Pull request workflow

1. Implement on a short-lived branch from `develop`.
2. Pass applicable local lint, type, test, build, and failure-injection checks.
3. Inspect the complete change against `develop` and confirm no secrets or
   unrelated files.
4. Run fresh independent FreePi Gate A through `npx free-pi-cli`. Require exact
   `VERDICT: PASS` before first push or draft PR creation.
5. Push without force and open a draft PR targeting `develop`.
6. Wait for every required CI check to be green on the exact PR head SHA.
7. Run a second fresh independent FreePi Gate B through `npx free-pi-cli`, bound
   to the exact PR head SHA, full PR diff, and check state.
8. After explicit Gate B `VERDICT: PASS`, mark ready for human review. Stop
   before merge.

Gate A and Gate B must use separate new FreePi processes and contexts. Any
relevant content change after Gate A invalidates Gate A. Any commit or content
change after Gate B invalidates Gate B. Ambiguous, incomplete, stale, failed, or
unavailable review output fails closed.

## Required status checks

As workflows are added, branch protection for `develop` and `main` must require
applicable lint/static analysis, automated tests, and build/compilation checks.
Pending, skipped, missing, or failing required checks are not green.

See `.agent/IMPLEMENTATION_LOOP.md` for the complete workflow and privacy rules.
