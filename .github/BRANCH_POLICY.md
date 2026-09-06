# Branch and review policy

## Protected branches

- `develop` is the integration branch.
- `main` is the release branch.
- Do not push directly to either protected branch.
- Do not merge a pull request as an agent. A human owner merges after the required reviews and checks pass.

## Working branches

Create a focused branch from the latest target branch and keep commits scoped to one concern. Before opening or updating a pull request, follow `.agent/IMPLEMENTATION_LOOP.md` and confirm the exact candidate tree has passed the pre-push FreePi gate.

## Required pull-request evidence

Every pull request must record:

- the base and head commit SHAs;
- the candidate tree SHA reviewed before push;
- the independent reviewer tool and model;
- the exact `VERDICT: PASS` result for Gate A;
- the validation commands and results;
- security and product-invariant impact;
- any residual risks or follow-up work.

After push, run the PR-head FreePi gate against the exact remote head. A pass for a different tree or commit is stale and does not satisfy the gate.

## Required checks

The following checks must pass before human merge:

- `Agent policy / repository-policy`;
- all applicable build, test, lint, type-check, and security checks;
- independent FreePi Gate A and Gate B reviews as defined in `.agent/IMPLEMENTATION_LOOP.md`.

If a required check cannot run, stop and document the blocker. Do not weaken, bypass, or silently substitute a gate.
