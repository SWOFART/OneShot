# OneShot Agent Policy

This policy applies to code, documentation, infrastructure, data, and agent
work in this repository.

## Instruction order

1. Follow system and user instructions.
2. Follow root `AGENTS.md` and this policy.
3. Follow the task-specific documents and repo skills routed by root
   `AGENTS.md`.
4. Follow the narrowest applicable repository configuration.

Surface conflicts. Never silently weaken an invariant, required check, or
security boundary.

## Tool neutrality

- Codex, Claude, Antigravity, Cursor, or another capable agent may implement
  work, but all tools follow the same canonical repository policy.
- Tool adapters remain short pointers to root `AGENTS.md`; personal prompts,
  permissions, models, and machine-specific commands stay in ignored files.

## Product boundary

OneShot's core promise is: `One job. Many retries. One settlement.`

- OneShot owns authoritative Business Intent, Attempt, and Settlement state and
  prevents duplicate committed settlements.
- Privy provides corporate wallet access and scoped authorization, policy, and
  spending permissions.
- Arc is the USDC settlement rail.
- Direct Privy and Arc evidence resolves known transaction identities. The Graph
  is the selected v1 hashless candidate-discovery layer after its C01 evidence
  gate; it is never the duplicate-payment lock or settlement authority.

Read `.agent/PROJECT_CONTEXT.md`, `.agent/SECURITY_INVARIANTS.md`, and
`.agent/SPONSOR_REQUIREMENTS.md` before changing these boundaries.

## Non-negotiable invariants

- `1 business intent -> at most 1 committed settlement`.
- Keep one stable `business_intent_id` across retries, restarts, parallel
  attempts, workers, and agent instances.
- Treat `UNKNOWN` settlement state as a reconciliation requirement. Never
  blindly repay.
- Make state durable and transitions atomic and concurrency-safe.
- Represent money as integer atomic units or `bigint`, never JavaScript
  floating point.
- External-index absence or delay is not proof that payment did not happen.
- Normal execution must not bypass Privy policy or OneShot controls.
- Use testnet only unless the user explicitly authorizes another network.
- Never log, expose, persist, commit, or send secrets, private keys, seed
  phrases, tokens, wallet credentials, or sensitive runtime configuration.

## Before changing files

- Inspect the current branch, status, task acceptance criteria, relevant code,
  existing diff, and any merge/rebase state.
- Preserve unrelated user work and keep it out of commits.
- Record material assumptions and active context in `.agent/context/`.
- Use current primary documentation for version-sensitive integrations.
- Do not create or materially revise the product implementation `plan.md` until
  required skills and integration research are ready.

## Implementation quality

- Keep one branch and PR focused on one milestone or tightly related change.
- Preserve clear ownership among interface, orchestration, domain state, and
  external adapters.
- Validate untrusted input at boundaries.
- Do not weaken compiler, lint, type, test, or security settings to get a pass.
- Add tests for behavior changes and regression fixes. Payment-related changes
  select applicable cases from `.agent/TEST_MATRIX.md`.
- Do not leave dead code, unexplained suppressions, placeholder credentials, or
  hidden follow-up work.
- Update documentation when behavior, contracts, or architecture change.

## Repository skills

- `oneshot-idempotency`: mandatory for intent, retry, worker, payment,
  reconciliation, or settlement work.
- `oneshot-failure-injection`: mandatory for external-effect failure
  boundaries.
- `sponsor-qualification`: mandatory before sponsor, demo, or release claims.

Personal workflow and review skills may supplement these rules. They never
replace OneShot policy, required CI, or human review.

## Git and review policy

- Never implement directly on `main` or `develop`.
- Branch from current `develop`; target `develop` from short-lived
  `feature/*`, `fix/*`, or `milestone/*` branches unless the user explicitly
  names another short-lived branch or base.
- Never direct-push or force-push protected branches or rewrite shared history
  without explicit user authorization.
- Follow `.agent/IMPLEMENTATION_LOOP.md` for local checks, diff review, CI, and
  pull-request readiness.
- Agents never merge a PR. A human reviews and explicitly authorizes the merge.

## Context retention

Follow `.agent/context/README.md`. Update the active record at milestone
boundaries, before handoff/session end, and before deliberate context reset or
compaction when possible. Never store secrets there.

## Agent-complete

Handoff only after intended scope is complete, local checks pass, and the diff
is cleanly scoped. A change is ready for human review only after required CI
passes for the pull-request head. Report branch, commit, PR, checks, and
remaining risks. Never merge.
