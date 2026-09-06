# OneShot Implementation Loop

This is the required, hackathon-friendly path from issue to human review.
`develop` is the base. Gate A binds to complete candidate content; Gate B binds
to the exact draft PR head SHA and its required check state.

## 1. Scope and branch

1. Start from current `develop`.
2. Create one short-lived `feature/*`, `fix/*`, or `milestone/*` branch unless
   the user explicitly names another short-lived branch.
3. Record goal, acceptance criteria, assumptions, and branch state in
   `.agent/context/`.
4. Never implement directly on `develop` or `main`.

## 2. Implement and validate

1. Make the smallest coherent change.
2. Use applicable repo skills and `.agent/TEST_MATRIX.md`.
3. Run local format, lint, type, test, build, and focused failure-injection
   checks that exist for affected components.
4. Inspect tracked, staged, unstaged, and intended untracked changes against
   `develop`. Check scope, generated files, secrets, and unrelated work.
5. Record commands and results in the current context file.

Do not bypass failures with force flags, skipped checks, broad ignores, lower
thresholds, or disabled hooks.

## 3. FreePi Gate A: complete pre-push review

Gate A must run before the first push and before draft PR creation.

1. From repository root, start a fresh process:

   ```bash
   npx free-pi-cli
   ```

2. In that new FreePi session, provide
   `.agent/review-prompts/freepi-prepush-review.md` and the task acceptance
   criteria. Do not use invented flags or a `pi --session` command.
3. Let the reviewer inspect the complete intended workspace change against
   `develop`, including staged, unstaged, and explicitly intended untracked
   files. Never expose ignored or sensitive files.
4. Accept only an explicit `VERDICT: PASS` with reviewed base SHA and sufficient
   evidence.

Each Gate A attempt uses a new `npx free-pi-cli` process. Never resume or reuse a
reviewer context. Any relevant content change after Gate A invalidates it: rerun
local checks and Gate A in another fresh process.

Missing evidence, an ambiguous or truncated answer, authentication failure,
tool failure, or any verdict other than explicit `VERDICT: PASS` is failure.

## 4. Commit, push, and draft PR

Only after Gate A passes for current content:

1. Stage only reviewed files and inspect the staged diff.
2. Commit with a clear message and push the short-lived branch without force.
3. Create a draft PR targeting `develop`; never target `main` for feature work.
4. Fill `.github/PULL_REQUEST_TEMPLATE.md`, including Gate A evidence.

## 5. Required CI

Wait for every required check on the exact draft PR head SHA. Pending, skipped,
missing, or failing required checks are not green.

If a fix changes content, rerun local validation and a fresh Gate A, commit,
push, and wait for CI again.

## 6. FreePi Gate B: exact PR review

After the draft PR exists and required CI is green:

1. Capture PR URL/number, base, head branch, exact full head SHA, full diff, and
   required check results.
2. Start a second fresh process from repository root:

   ```bash
   npx free-pi-cli
   ```

3. Provide `.agent/review-prompts/freepi-pr-review.md` plus the captured PR and
   CI evidence. This must not reuse any Gate A process or session.
4. Accept only explicit `VERDICT: PASS` bound to the exact current PR head SHA.

Any commit or content change after Gate B invalidates Gate B. Return to local
validation, fresh Gate A, commit/push, green CI, then fresh Gate B.

## 7. Human review and merge

After Gate A, required CI, and Gate B pass for current content/head:

1. Record both verdicts and evidence in the PR and context file.
2. Mark the draft ready for human review.
3. Report branch, SHA, PR URL, checks, gates, and residual risks.
4. Stop. Agents never merge. Only a human may authorize and perform merge.

## Privacy boundary

FreePi may review code, intended diffs, tests, public docs, and non-sensitive
check output only. Never provide `.env`, `.env.local`, private keys, seed
phrases, access tokens, API secrets, wallet credentials, ignored files, or
sensitive runtime configuration. If safe review is impossible, fail the gate.
