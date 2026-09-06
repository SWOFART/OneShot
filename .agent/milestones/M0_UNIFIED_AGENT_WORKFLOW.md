# M0: Unified agent workflow

## Outcome

Every contributor follows one repository workflow while remaining free to use
Codex, Claude, Antigravity, Cursor, or another capable agent.

## Acceptance criteria

- `AGENTS.md` and `.agent/` remain the only canonical shared policy.
- Tool-specific files point to canonical policy instead of copying it.
- Personal agent configuration is ignored.
- Gate A records reviewer, available model identity, exact base SHA, and
  candidate tree SHA.
- Gate B records reviewer, available model identity, exact PR head SHA, and
  equality with the Gate A candidate tree after required CI.
- Pull requests run a minimal `Agent policy` status check.
- Feature work targets `develop`; humans retain merge authority.

## Scope

In scope: shared policy, portable Git evidence, review prompts, PR evidence
fields, Antigravity adapter, ignore rules, and minimal policy CI.

Out of scope: product implementation, selecting a mandatory review provider,
Windows-only automation, branch-protection mutation, and merging existing
`agents-setup` or Claude adapter branches.

## Validation

- Inspect complete diff against the recorded immutable `develop` base SHA.
- Confirm Markdown links and referenced paths exist.
- Confirm only intended files are staged.
- Run the policy workflow checks locally where practical.
- Run independent Gate A before commit and Gate B after draft PR checks.

## Risks and rollback

Risk: a tool may not auto-load `AGENTS.md`. Thin adapters handle known tools;
the PR template and human review expose missing gate evidence.

Rollback: revert this documentation-only commit. No runtime or data migration
exists.
