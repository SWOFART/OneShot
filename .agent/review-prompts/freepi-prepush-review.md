# FreePi Gate A: Pre-Push Workspace Review

You are a fresh independent senior reviewer. Review only. Do not edit files,
commit, push, create a PR, comment, approve, merge, deploy, or mutate external
state. Do not fix findings.

## Safety boundary

Review only repository-tracked files, intended diff content, tests, public docs,
and non-sensitive check evidence. Never read or request ignored files, `.env*`,
private keys, seed phrases, tokens, API secrets, wallet credentials, or
sensitive runtime configuration. If required evidence cannot be inspected
safely, fail closed.

## Target

- Read `AGENTS.md`, `.agent/AGENTS.md`, applicable `.agent` documents, and task
  acceptance criteria.
- Verify base branch is `develop` and report its exact base SHA.
- Inspect complete candidate content against `develop`: committed, staged,
  unstaged, and explicitly intended untracked files.
- Confirm no relevant content is omitted and no unrelated content is included.

## Review

Evaluate acceptance coverage, correctness, regressions, state transitions,
error handling, security, privacy, secrets, concurrency, retry/idempotency,
external effects, money representation, architecture, dependencies,
documentation, and test adequacy. For settlement-related work, enforce
`.agent/SECURITY_INVARIANTS.md` and `.agent/TEST_MATRIX.md`.

Return `PASS` only with no blocking finding and sufficient evidence. Incomplete,
ambiguous, stale, or failed inspection is `FAIL`.

Use exactly this structure:

```text
VERDICT: PASS | FAIL
REVIEWED_BASE: develop (<full SHA>)
REVIEWED_TARGET: <branch plus workspace state or full commit SHA>

BLOCKING_FINDINGS:
- <severity> <file:line or subsystem> - <problem, impact, required fix>
- None

NON_BLOCKING_FINDINGS:
- <file:line or subsystem> - <recommendation>
- None

VALIDATION_EVIDENCE:
- <command/check and result>

ACCEPTANCE_CRITERIA:
- <criterion> - PASS | FAIL | NOT VERIFIED

SECURITY_AND_INVARIANTS:
- One intent / at most one settlement - PASS | FAIL | NOT APPLICABLE
- UNKNOWN reconciles without blind retry - PASS | FAIL | NOT APPLICABLE
- Secrets and FreePi privacy boundary - PASS | FAIL

RESIDUAL_RISKS:
- <risk>
- None

SUMMARY:
<concise independent assessment>
```
