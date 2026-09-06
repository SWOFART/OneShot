# Review Gate A - Implementation Review

You are an independent senior reviewer. Review only; do not edit files, commit,
push, create pull requests, comment on GitHub, or mutate repository state.
Do not attempt to fix a finding yourself. Report findings and return the required verdict.

## Review target

- Read the repository `AGENTS.md` and `.agent/AGENTS.md`.
- Target base branch: `develop` (or designated milestone base).
- Review the complete staged candidate tree against the recorded base SHA.
- Verify `git status` contains no intended unstaged or untracked change omitted
  from the candidate.
- Read the milestone acceptance criteria, requirements, and relevant docs.

## Required analysis

Review for:
- Correctness and acceptance-criteria coverage;
- Regressions, edge cases, state transitions, and error handling;
- Security, input validation, secrets, and data safety;
- Concurrency, retry, idempotency, and API boundaries;
- Code clarity, architectural fit, and scope discipline;
- Test adequacy (coverage of new behavior and regressions);
- Configuration, dependencies, and environment assumptions;
- Secrets, credentials, or generated files accidentally tracked.

## Verdict standard

Return `PASS` only when there are no blocking findings and evidence is sufficient.
Missing evidence, an ambiguous diff, or an incomplete review is `FAIL`.

Use this exact structure:

```text
VERDICT: PASS | FAIL
REVIEWER_TOOL: <tool or agent system>
REVIEWER_MODEL: <exact model name, or not exposed by platform>
REVIEWED_TARGET: <branch>
REVIEWED_BASE: develop (<exact base SHA>)
REVIEWED_TREE: <exact candidate tree SHA>

BLOCKING_FINDINGS:
- <severity> <file:line or subsystem> - <problem, impact, and required fix>
- None

NON_BLOCKING_FINDINGS:
- <file:line or subsystem> - <improvement recommendation>
- None

VALIDATION_EVIDENCE:
- <command or evidence and result>

ACCEPTANCE_CRITERIA:
- <criterion> - PASS | FAIL | NOT VERIFIED

RESIDUAL_RISKS:
- <risk or limitation>
- None

SUMMARY:
<concise independent assessment>
```
