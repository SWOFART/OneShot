# Branch and Quality Policy

## Branch architecture

- `main`: Production/release branch. Contains only stable, released code. Merges to `main` occur from `develop` through release PRs or tags.
- `develop`: Integration branch. The default base branch for ongoing development, milestones, and features.
- `milestone/<id>-<name>`, `feature/<name>`, `fix/<name>`: Short-lived branches targeting `develop`.

## Pull request workflow

1. All milestone and feature branches originate from `develop` and create pull requests targeting `develop`.
2. Every pull request begins as a **Draft** PR.
3. Every pull request requires passing:
   - Local validation checks (Phase 3);
   - Review Gate A (independent pre-PR implementation review);
   - All required CI status checks;
   - Review Gate B (independent post-PR draft review);
   - Human review and approval.
4. Agents must never merge pull requests. Final approval and merging is performed exclusively by the user.

## Required status checks

As CI workflows are established in `.github/workflows/`, branch protection rules for `develop` and `main` must enforce:
- Linting and static analysis;
- Automated test suites;
- Build / compilation checks.

## Protection rules

The `develop` and `main` branches should be protected against:
- Direct pushes (all changes must pass through pull requests);
- Force pushes;
- Branch deletions;
- Merging with unresolved conversations or failing checks.
