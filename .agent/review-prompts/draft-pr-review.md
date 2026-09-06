# Review Gate B - Draft Pull Request Review

You are the second independent senior reviewer. Review only; do not edit files,
commit, push, change pull-request state, leave comments, approve, merge, deploy,
or mutate any external system.
Do not attempt to fix a finding yourself. Report findings and return the required verdict.

This must be a fresh review. Do not rely on memory or a resumed Gate A session.

## Review target

- Read the repository `AGENTS.md` and `.agent/AGENTS.md`.
- Verify draft pull request number, base branch (`develop`), head branch, and head SHA.
- Read the PR description, full GitHub PR diff, commits, required status checks,
  and Review Gate A evidence.
- Confirm CI and Gate B evidence refer to the exact current PR head SHA.
- Gate A evidence is bound to its base SHA and candidate tree SHA. Verify the
  current PR head tree equals the Gate A candidate tree before accepting it.

## Required analysis

Independently evaluate:
- Whether the PR delivers the stated milestone without hidden scope or creep;
- Every issue class evaluated in Gate A;
- Whether previous findings from Gate A were fully resolved;
- Whether CI covers changed behavior and all required checks are green;
- Whether documentation, config, and migration paths are complete;
- Whether the PR description provides sufficient detail for human review;
- Whether the current PR head tree and base still match Gate A evidence;
- Whether the PR is safe to mark ready for human review (not whether it should be merged).

## Verdict standard

Return `PASS` only if the exact draft head is ready for user review. A stale Gate A
verdict, failing CI, ambiguous evidence, or any blocking finding is `FAIL`.

Use this exact structure:

```text
VERDICT: PASS | FAIL
REVIEWER_TOOL: <tool or agent system>
REVIEWER_MODEL: <exact model name, or not exposed by platform>
PR: <number and URL>
REVIEWED_HEAD: <full SHA>
REVIEWED_HEAD_TREE: <full `HEAD^{tree}` SHA>
REVIEWED_BASE: develop (<exact base SHA>)
GATE_A_TREE: <candidate tree SHA; must equal REVIEWED_HEAD_TREE>

BLOCKING_FINDINGS:
- <severity> <file:line or subsystem> - <problem, impact, and required fix>
- None

NON_BLOCKING_FINDINGS:
- <file:line or subsystem> - <improvement recommendation>
- None

CI_AND_REVIEW_EVIDENCE:
- <check or Gate A evidence and result>

MILESTONE_READINESS:
- Scope and acceptance criteria - PASS | FAIL
- Tests and required checks - PASS | FAIL
- Security, privacy, and secrets - PASS | FAIL
- Documentation and operations - PASS | FAIL
- Ready for user review - PASS | FAIL

RESIDUAL_RISKS:
- <risk or limitation for the human reviewer to consider>
- None

SUMMARY:
<concise independent assessment for the user>
```
