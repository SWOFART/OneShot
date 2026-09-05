# Milestone Implementation Loop

This is the mandatory lifecycle for every milestone and feature implementation in OneShot.
Gate A is bound to reviewed file content against the base branch (`develop`).
Gate B and final readiness are bound to the exact pull-request head commit.

## Lifecycle

```mermaid
flowchart LR
    A["Phase 1: Scope milestone"] --> B["Phase 2: Implement"]
    B --> C["Phase 3: Local validation"]
    C --> D["Phase 4: Review Gate A"]
    D -->|"FAIL"| B
    D -->|"PASS"| E["Phase 5: Commit and create draft PR"]
    E --> F["Phase 6: Required CI"]
    F -->|"FAIL"| B
    F -->|"PASS"| G["Phase 7: Review Gate B"]
    G -->|"FAIL"| B
    G -->|"PASS"| H["Phase 8: Mark ready for user"]
    H --> I["User review"]
    I -->|"Changes requested"| B
    I -->|"Approved"| J["User-authorized merge"]
```

## Phase 1 - Scope the milestone

Create an implementation plan / proposal record containing:

- Outcome and user value;
- Acceptance criteria;
- In-scope and out-of-scope behavior;
- Affected components and interfaces;
- Test and measurement plan;
- Security, privacy, operational, and cost risks;
- Rollback or safe-disable strategy.

Exit gate: The work is scoped small enough for one focused pull request and has
objective, testable acceptance criteria.

## Phase 2 - Implement

1. Create a branch from the latest base branch (`develop`):
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b milestone/<id>-<name>
   ```
2. Make the smallest coherent change satisfying the milestone.
3. Add or update tests and documentation alongside code.
4. Inspect the full workspace diff (`git status`, `git diff`, untracked files)
   for scope drift, generated files, secrets, and unrelated edits.

The implementation may remain uncommitted through Gate A. Do not push a branch
or create a PR yet.

Exit gate: The workspace contains one coherent candidate change and no unrelated work.

## Phase 3 - Local validation

Run repository validation commands from the project root:

```bash
# Execute local quality checks (lint, format check, type check, test suites)
```

Record each command and its result. Fix failures and repeat until clean. Do not
classify an expected failure as a pass.

Exit gate: All applicable local checks pass for the current workspace content.

## Phase 4 - Review Gate A: workspace implementation review

Run an independent review session using `.agent/review-prompts/implementation-review.md`.

The reviewer evaluates:
- Complete workspace diff against `develop`;
- Acceptance criteria coverage;
- Edge cases, error handling, regressions;
- Security, secrets, and licensing;
- Test adequacy and architecture fit.

Gate decision:
- `PASS`: No blocking correctness, security, data-loss, architecture, test, or
  acceptance-criteria findings.
- `FAIL`: At least one blocking finding, missing evidence, incomplete review, or
  ambiguous verdict.

On `FAIL`, resolve every blocking finding, rerun local validation, and repeat Gate A
in a fresh session.

Exit gate: Gate A returns an explicit `VERDICT: PASS`.

## Phase 5 - Commit and create draft pull request

Only after Gate A passes:

1. Stage only the reviewed milestone files and inspect the staged diff.
2. Commit the reviewed change.
3. Push the branch to origin:
   ```bash
   git push -u origin milestone/<id>-<name>
   ```
4. Create a **draft** pull request against `develop`.
5. Fill out `.github/PULL_REQUEST_TEMPLATE.md` with:
   - Milestone outcome & scope;
   - Acceptance criteria checklist;
   - Risk assessment;
   - Validation evidence;
   - Review Gate A verdict and reviewer evidence.
6. Keep the pull request in draft state.

Exit gate: The draft PR is created against `develop` with complete Gate A evidence.

## Phase 6 - Required CI

Wait for all required GitHub Actions checks to finish on the draft PR head commit.

If CI fails or requires a content change:
1. Fix the issue locally;
2. Rerun local validation (Phase 3);
3. Rerun Review Gate A (Phase 4) for the updated content;
4. Commit, push, and wait for CI.

Exit gate: All required status checks are green for the exact PR head commit.

## Phase 7 - Review Gate B: exact draft PR review

Gate B runs in an independent reviewer session after CI passes, evaluating the draft PR
using `.agent/review-prompts/draft-pr-review.md`.

The reviewer independently inspects:
- PR title, description, and diff against `develop`;
- Commits and file changes;
- Required CI status and check logs;
- Gate A evidence and resolution of earlier findings;
- Merge readiness and residual risks.

On `FAIL`, return to Phase 2. Any content change requires rerunning Phases 3 through 7.

Exit gate: Gate B returns an explicit `VERDICT: PASS` for the exact current PR head SHA.

## Phase 8 - Ready for user review

After Gate A, CI, and Gate B all pass:

1. Add the Gate B verdict and evidence link to the PR description or comment.
2. Mark the draft pull request as ready for review (`gh pr ready <pr-number>`).
3. Notify the user with:
   - Branch name & head commit SHA;
   - PR URL;
   - Checks run & Gate A / B verdicts;
   - Known limitations or risks.
4. Stop. **Do not merge.**

The user performs the final review and explicitly decides whether to merge into `develop`.

## Fail-closed conditions

Do not advance a gate when:
- Review output is truncated or lacks an explicit `VERDICT: PASS`;
- Target base branch or PR head SHA is ambiguous;
- Required CI is missing, pending, skipped, or failing;
- Unresolved blocking findings remain.
