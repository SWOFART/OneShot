# OneShot Agent Policy

This policy applies to code, documentation, infrastructure, data, and agent
work in this repository.

## Instruction order

1. Follow system and user instructions.
2. Follow root `AGENTS.md` and this policy.
3. Follow the task-specific documents and repo skills routed by root
   `AGENTS.md`.
4. Follow the narrowest applicable repository configuration.

Surface conflicts. Never silently weaken an invariant, review gate, or security
boundary.

## Product boundary

OneShot's core promise is: `One job. Many retries. One settlement.`

- OneShot owns authoritative business-intent execution state and prevents
  duplicate committed settlements.
- Privy provides corporate wallet access and scoped authorization, policy, and
  spending permissions.
- Arc is the USDC settlement rail.
- The Graph provides live indexed history and recovery context. It is never the
  sole duplicate-payment lock or authority for creating another settlement.

Read `.agent/PROJECT_CONTEXT.md`, `.agent/SECURITY_INVARIANTS.md`, and
`.agent/SPONSOR_REQUIREMENTS.md` before changing these boundaries.

## Non-negotiable invariants

- `1 business intent -> at most 1 committed settlement`.
- Keep one stable `business_intent_id` across retries, restarts, parallel
  attempts, and agent instances.
- Treat `UNKNOWN` settlement state as a reconciliation requirement. Never
  blindly repay.
- Make state durable and transitions atomic and concurrency-safe.
- Represent money as integer atomic units or `bigint`, never JavaScript
  floating point.
- Graph absence or indexing delay is not proof that payment did not happen.
- Normal execution must not bypass Privy policy or OneShot controls.
- Use testnet only unless the user explicitly authorizes another network.
- Never log, expose, persist, commit, or send secrets, private keys, seed
  phrases, tokens, wallet credentials, or sensitive runtime configuration.

## Before changing files

- Inspect current branch, status, task acceptance criteria, relevant code, and
  existing diff.
- Preserve unrelated user work and keep it out of commits.
- Record material assumptions and the active context in `.agent/context/`.
- Use current primary documentation for version-sensitive integrations.
- Do not create the product implementation `plan.md` until required skills and
  integration research are ready. Agent infrastructure work is not that plan.

## Implementation quality

- Keep one branch and PR focused on one milestone or tightly related change.
- Preserve clear ownership among interface, orchestration, domain state, and
  external adapters.
- Validate untrusted input at boundaries.
- Do not weaken compiler, lint, type, test, or security settings to get a pass.
- Add tests for behavior changes and regression fixes. Payment-related changes
  must select applicable cases from `.agent/TEST_MATRIX.md`.
- Do not leave dead code, unexplained suppressions, placeholder credentials, or
  hidden follow-up work.
- Update documentation when behavior, contracts, or architecture change.

## Skills

User-level workflow skills expected for Codex:

- `research`: primary-source integration research before architecture choices.
- `tdd`: one behavior at a time through red-green-refactor.
- `diagnosing-bugs`: evidence-first diagnosis before fixing unclear failures.
- `to-tickets`: split an approved spec or plan into ordered tracer-bullet work.
- `handoff`: compact a session into a durable handoff.
- `resolving-merge-conflicts`: resolve active merge/rebase conflicts safely.
- `prototype`: answer a design question with disposable code.
- `wizard`: guide human-only setup, credentials, or dashboard steps.
- `caveman`: reduce conversational token use; never compress persisted repo
  docs, code, review evidence, or security warnings.

Project skills in `.agents/skills/`:

- `oneshot-idempotency`: mandatory for intent/payment/retry/settlement work.
- `oneshot-failure-injection`: mandatory for external-effect failure boundaries.
- `sponsor-qualification`: mandatory before sponsor/demo/release claims.

Optional generic code-review skills may supplement work. They never satisfy or
replace FreePi Gate A or Gate B.

## Git and review policy

- Never implement directly on `main` or `develop`.
- Branch from current `develop`; target `develop` from short-lived
  `feature/*`, `fix/*`, or `milestone/*` branches unless the user explicitly
  names a different short-lived branch.
- Never direct-push or force-push protected branches. Never rewrite shared
  history without explicit user authorization.
- Follow `.agent/IMPLEMENTATION_LOOP.md` for local checks, both independent
  FreePi reviews, CI, PR readiness, and invalidation rules.
- Only explicit `VERDICT: PASS` passes a gate. Missing, ambiguous, truncated,
  stale, unauthenticated, or failed review output fails closed.
- Agents never merge. A human must review and explicitly authorize the merge.

## Context retention

Follow `.agent/context/README.md`. Update the current record at milestone
boundaries, before handoff or session end, and before deliberate context reset or
compaction when possible. Never store secrets there.

## Agent-complete

Handoff only after intended scope is complete, local checks pass, the diff is
cleanly scoped, and the current gate state is recorded. A change is ready for
human review only after Gate A, required CI, and Gate B pass for the exact
applicable content/head SHA. Report branch, commit, PR, checks, gate evidence,
and remaining risks. Never merge.
