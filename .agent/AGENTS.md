# OneShot Agent Policy

This file defines mandatory behavior for every coding, documentation,
infrastructure, data, and model agent working in this repository.

## Instruction order

1. Follow system and user instructions.
2. Follow the root `AGENTS.md` and this file.
3. Follow `.agent/MILESTONE_IMPLEMENTATION_LOOP.md` for milestone work.
4. Follow the narrowest applicable repository documentation and configuration.

If instructions conflict, stop and surface the conflict. Do not silently choose
the most convenient interpretation.

## Before making changes

- Read the task, acceptance criteria, relevant code, and related documentation.
- Inspect `git status`, the current branch, and the diff before editing.
- Preserve unrelated user changes and never include them in a commit.
- Identify the milestone, the smallest reviewable outcome, and explicit non-goals.
- State assumptions that can materially affect behavior, security, privacy,
  cost, licensing, or architecture.
- Prefer evidence from the repository and official primary documentation over
  memory for version-sensitive technical decisions.

## Scope and architecture

- One branch and pull request must represent one milestone or one tightly
  related correction.
- Keep scope lean and focused. Do not introduce speculative features, unused
  dependencies, or unnecessary abstractions unless the active milestone explicitly
  requires them.
- Preserve clean separation of concerns: presentation/interface, orchestration,
  domain logic, and external service adapters.
- Validate all untrusted input at boundaries.
- Handle state transitions, loading, empty states, and errors predictably.

## Implementation rules

- Write strict, readable code adhering to established style conventions.
- Do not weaken compiler, lint, or type-check configurations to make a change pass.
- Prefer small, typed interfaces at subsystem boundaries.
- Add or update tests for behavior changes and regression fixes.
- Do not leave dead code, unexplained suppressions, placeholder credentials, or
  untracked follow-up work hidden in comments.
- Update documentation when behavior or architectural patterns change.

## Quality policy

Before Review Gate A, run the full local validation suite:

```bash
# Project quality checks (configure as codebase components are introduced)
# e.g., lint, type check, unit tests, integration checks
```

Run additional focused tests required by the changed subsystem. A passing build
does not replace behavioral tests, security checks, or manual verification.

Do not bypass a failed check with `--force`, `--no-verify`, broad ignore rules,
lowered thresholds, or dependency overrides. Fix the cause or document a genuine
blocker for the user.

## Git and GitHub

- Never implement directly on `main` or `develop`.
- The default development and integration branch is `develop`.
- All milestone and feature pull requests must target `develop`.
- Use a descriptive branch such as `milestone/<id>-<name>`, `feature/<name>`, or
  `fix/<name>`.
- Never force-push, delete a protected branch, rewrite shared history, or use a
  destructive reset without explicit user authorization.
- Stage only files belonging to the active milestone and review the staged diff
  before committing.
- Draft pull requests may be created only after Review Gate A passes.
- A draft may be marked ready for user review only after required CI and Review
  Gate B pass for the exact current head commit.
- Agents must never merge a pull request. The user performs the final review and
  explicitly decides whether to merge.

## Mandatory independent reviews

Follow `.agent/MILESTONE_IMPLEMENTATION_LOOP.md` exactly.

- Review Gate A is a fresh, independent review of the complete workspace change
  before the draft pull request is created. It evaluates the diff against the target
  base branch (`develop`), covering acceptance criteria, correctness, edge cases,
  security, and test coverage.
- Review Gate B is a second fresh, independent review after the draft PR exists
  and required CI is green. Gate B is bound to the exact PR head commit SHA and verifies
  PR readiness, diff integrity, and check results.
- The implementation agent must not act as its own independent reviewer. Reviewers
  must be invoked in an independent session using `.agent/review-prompts/implementation-review.md`
  for Gate A and `.agent/review-prompts/draft-pr-review.md` for Gate B.
- Do not reuse or resume the Gate A session for Gate B.
- Any content change after Gate A invalidates Gate A.
- Any commit after Gate B invalidates Gate B.
- `WARN`, an incomplete response, unavailable tooling, authentication failure,
  or an ambiguous verdict is not a pass.

## Security, privacy, and secrets

- Never commit secrets, API keys, tokens, credentials, private certificates, or personal data.
- Maintain a comprehensive `.gitignore` for secrets, local environments, and temporary artifacts.
- Validate input sizes and payloads before running expensive operations.
- Treat dependency and code licensing as core release criteria.

## Definition of agent-complete

Work is ready for user review only when:

- Milestone acceptance criteria are fully met;
- The branch contains only intended changes;
- Local checks and required GitHub checks pass;
- Review Gate A and Review Gate B pass for the current head commit;
- All blocking findings are fixed and re-reviewed;
- The draft PR has been marked ready, but not merged;
- The PR description details scope, risk, validation evidence, and both review verdicts;
- Documentation is updated and accurate.

When handing off, report the branch, commit SHA, PR URL, checks run, review verdicts,
known limitations, and the exact decision required from the user.
