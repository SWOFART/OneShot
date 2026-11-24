# OneShot Implementation Loop

This is the required path from a focused change to human review. `develop` is
the integration branch. `main` is the release branch.

## 1. Scope and branch

1. Start from current `develop`, unless the user explicitly names another base.
2. Create one short-lived `feature/*`, `fix/*`, or `milestone/*` branch unless
   the user explicitly names another short-lived branch.
3. Record goal, acceptance criteria, assumptions, non-goals, and branch state in
   `.agent/context/`.
4. Never implement directly on `develop` or `main`.

## 2. Implement and validate

1. Make the smallest coherent change.
2. Use applicable repo skills and `.agent/TEST_MATRIX.md`.
3. Run local format, lint, type, test, build, and focused failure-injection
   checks that exist for affected components.
4. Inspect tracked, staged, unstaged, ignored, and intended untracked changes
   for scope, generated files, secrets, and unrelated work. Never open or send
   ignored secret files to a reviewer, an issue, or CI logs.
5. Stage every intended file and only intended files.
6. Record concise command/result evidence in the active context. Keep full logs
   only for failures that require diagnosis.

Do not bypass failures with force flags, skipped checks, broad ignores, lower
thresholds, or disabled hooks.

## 3. Commit, push, and pull request

1. Commit the intended change without rewriting shared history.
2. Push the short-lived branch without force.
3. Open a pull request targeting `develop`, unless the user explicitly names
   another base. Do not target `main` for ordinary feature work.
4. Fill `.github/PULL_REQUEST_TEMPLATE.md`. Link the issue when one exists.

## 4. Required CI

Wait for every required check on the pull-request head. Pending, skipped,
missing, or failing required checks are not green.

If a fix changes content, rerun the applicable local checks, commit, push, and
wait for CI again.

## 5. Human review and merge

After required CI passes for the current head:

1. Record the checks and any residual risk in the pull request and context file.
2. Mark a draft ready for human review when the scope is complete.
3. Report branch, SHA, pull request URL, checks, and residual risks.
4. Stop. Agents never merge; only a human may authorize and perform the merge.

## Review discipline

- Canonical policy is linked, not copied into tool adapters.
- Review the diff, tests, and public documentation that the change touches.
- Reference the head SHA and concise check results instead of pasting successful
  logs into the pull request.
- Never reduce scope, skip evidence, or hide failures.

## Privacy boundary

Reviewers and automation may see the diff, tests, public documentation, and
non-sensitive check evidence only. Never provide `.env*`, ignored files,
private keys, seed phrases, access tokens, API secrets, wallet credentials, or
sensitive runtime configuration. If a safe review is impossible, stop and do
not send the data.
