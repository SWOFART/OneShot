# Branch and review policy

## Protected branches

- `develop` is the integration branch.
- `main` is the release branch.
- Do not push directly to either protected branch.
- A human owner merges after the required reviews and checks pass.

## Working branches

Create a focused branch from the latest `develop` unless a maintainer names another base. Keep commits scoped to one concern. Before opening or updating a pull request, follow [CONTRIBUTING.md](../CONTRIBUTING.md): run the applicable local checks, inspect the diff, and fill the pull request template.

## Required pull-request evidence

Every pull request must record:

- the linked issue, when one exists;
- what changed and why;
- the validation commands and results;
- security and product-invariant impact;
- any residual risks or follow-up work.

## Required checks

The following checks must pass before merge:

- `repository-policy`;
- all applicable build, test, lint, type-check, and security checks.

If a required check cannot run, stop and document the blocker. Do not weaken or bypass a check.
