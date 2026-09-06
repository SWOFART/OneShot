# OneShot Implementation Loop

This is the required path from a focused change to human review. `develop` is
the base. Gate A binds to one immutable candidate tree before the first push;
Gate B binds to the exact draft-PR head SHA and the same tree after required CI.

## 1. Scope and branch

1. Start from current `develop`.
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
   ignored secret files to a reviewer.
5. Stage every intended file and only intended files. Gate A reviews a single
   candidate tree, not a partially staged workspace.
6. Record concise command/result evidence in the active context. Keep full logs
   only for failures that require diagnosis.

Do not bypass failures with force flags, skipped checks, broad ignores, lower
thresholds, or disabled hooks.

## 3. Capture immutable Gate A evidence

Refresh the base and record exact identities:

```bash
git fetch origin develop
git rev-parse origin/develop
git write-tree
git status --short
git diff --cached --check
git diff --cached <recorded-base-sha>
```

- `recorded-base-sha` is the printed full SHA, not a moving ref.
- `git write-tree` is the candidate tree SHA.
- For an already-created but unpushed merge commit, use
  `git rev-parse "HEAD^{tree}"` and `git diff <recorded-base-sha> HEAD`; the
  commit must have no additional workspace changes.
- Confirm no intended change is absent from the candidate and no unrelated file
  is present.

## 4. FreePi Gate A: pre-push review

1. From the repository root, start exactly one fresh process:

   ```bash
   npx free-pi-cli
   ```

2. In one message, tell the new session to read
   `.agent/review-prompts/freepi-prepush-review.md`; provide only the task
   acceptance criteria, recorded base SHA, candidate tree SHA, and whether the
   tree is staged or the exact unpushed `HEAD` tree.
3. Let the reviewer inspect the candidate diff and routed repository documents
   with its tools. Do not paste duplicate policy, complete file bodies, repeated
   terminal output, or secrets into the prompt.
4. Accept only an explicit `VERDICT: PASS` containing the required reviewer,
   model, base, target, and tree identities.

Each attempt uses a new `npx free-pi-cli` process. Never resume or reuse a
reviewer context. Any candidate-tree change invalidates Gate A and requires
local checks plus a new process. Missing evidence, ambiguity, truncation,
authentication/tool failure, or any verdict other than explicit PASS fails
closed.

## 5. Commit, push, and draft PR

Only after Gate A passes for the candidate tree:

1. If the tree is staged, commit it without changing content. If Gate A reviewed
   an existing unpushed commit, do not amend it.
2. Confirm `git rev-parse "HEAD^{tree}"` equals the reviewed candidate tree.
3. Push the short-lived branch without force.
4. Create a draft PR targeting `develop`, never `main` for feature work.
5. Fill `.github/PULL_REQUEST_TEMPLATE.md`, including Gate A evidence.

## 6. Required CI

Wait for every required check on the exact draft-PR head SHA. Pending, skipped,
missing, or failing required checks are not green.

If a fix changes content, rerun local validation and fresh Gate A, commit, push,
and wait for CI again.

## 7. FreePi Gate B: exact PR review

1. Capture PR URL/number, base, head branch, exact full head SHA, head tree SHA,
   full diff, required check results, and Gate A candidate tree.
2. Start a second fresh process from the repository root:

   ```bash
   npx free-pi-cli
   ```

3. In one message, tell it to read
   `.agent/review-prompts/freepi-pr-review.md` and provide only the captured
   identities, PR URL, concise CI summary, acceptance criteria, and Gate A
   verdict. Let the reviewer obtain the diff and public evidence with tools.
4. Accept only explicit `VERDICT: PASS` bound to the exact current PR head SHA
   whose tree equals the Gate A candidate tree.

Any content change after Gate B invalidates both tree equality and Gate B.
Return to local validation, fresh Gate A, commit/push, green CI, then fresh Gate
B.

## 8. Human review and merge

After Gate A, required CI, and Gate B pass for the current tree/head:

1. Record both verdicts and evidence in the PR and context file.
2. Mark the draft ready for human review.
3. Report branch, SHA, tree SHA, PR URL, checks, gates, and residual risks.
4. Stop. Agents never merge; only a human may authorize and perform the merge.

## Review token discipline

- Canonical policy is linked, not copied into tool adapters or review prompts.
- Send each reviewer one compact instruction message. The reviewer reads only
  documents routed by root `AGENTS.md` and files relevant to the diff.
- Reference immutable Git identities and concise check results instead of
  pasting whole diffs, policy files, or successful logs into chat.
- Reviewers inspect silently and return one structured verdict. They do not
  narrate file reads, repeat the task, or restate unchanged policy.
- Never reduce scope, skip evidence, or hide failures to save tokens. Token
  discipline removes duplication, not review coverage.

## Privacy boundary

FreePi may review the candidate diff, tests, public documentation, and
non-sensitive check evidence only. Never provide `.env*`, ignored files,
private keys, seed phrases, access tokens, API secrets, wallet credentials, or
sensitive runtime configuration. If safe review is impossible, fail the gate.
