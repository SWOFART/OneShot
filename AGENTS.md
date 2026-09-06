# OneShot Agent Entry Point

Read `.agent/AGENTS.md` before any repository work.

Then load only the documents needed for the task:

- Architecture or domain work: `.agent/PROJECT_CONTEXT.md` and
  `.agent/SECURITY_INVARIANTS.md`.
- Privy, Arc, The Graph, demo, release, or submission work:
  `.agent/SPONSOR_REQUIREMENTS.md`.
- Intent, payment, retry, worker, queue, job, invoice, settlement, or
  reconciliation work: the `oneshot-idempotency` repo skill and
  `.agent/TEST_MATRIX.md`.
- Failure handling or reliability work: the `oneshot-failure-injection` repo
  skill and `.agent/TEST_MATRIX.md`.
- Any implementation, review, commit, push, or pull request:
  `.agent/IMPLEMENTATION_LOOP.md`.
- Demo/release sponsor claims: the `sponsor-qualification` repo skill.
- Handoff, milestone boundary, session end, or deliberate context reset:
  `.agent/context/README.md` and the current context record.

Canonical shared policy lives only in this file and `.agent/`. Tool-specific
files such as `.claude/CLAUDE.md` and `.agents/rules/repository-policy.md` are
thin adapters: they point here and must not duplicate or override policy.

Repository skills live in `.agents/skills/`. Personal workflow skills may help,
but they never replace OneShot policy or mandatory FreePi Gate A and Gate B.

If a required document cannot be read, stop and report the missing policy.
