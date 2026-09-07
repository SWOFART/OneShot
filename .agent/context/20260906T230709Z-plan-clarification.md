# Session Context: Subgraph MCP plan clarification

## Date/time

- UTC: 2026-09-06T23:07:09Z

## User goal

Clarify the product plan and independently closable C-lane milestones so The
Graph qualification path explicitly uses a live OneShot/Arc Subgraph through
Subgraph MCP, with meaningful LLM recovery reasoning behind a deterministic
OneShot safety boundary.

## Original prompt/request

Create `plan-clarification` from the new repository's `develop`; update the plan,
The Graph milestones, and sponsor-qualification skill around the flow Subgraph
-> Subgraph MCP -> LLM Recovery Agent -> four allowed recommendations ->
deterministic safety core. Repository: <https://github.com/SWOFART/OneShot/>.

## Assumptions

- This work targets The Graph's AI application eligibility path, not the separate
  composable/standardized-products path; one live Subgraph is therefore planned.
- The LLM is advisory. Existing authoritative state and Arc-evidence semantics
  remain unchanged.
- No push or PR is included because the user did not request either in this turn.
- `develop` advanced during review preparation; the branch was fast-forwarded
  and the clarification was rebuilt on the newer hashless-recovery plan instead
  of restoring its deleted C01 milestone.

## Plan

1. Inspect current `develop` planning contracts and official The Graph sources.
2. Update the plan, C-lane packets, architecture, and sponsor qualification rules.
3. Run focused consistency and repository validation without external credentials.

## Key decisions

- Preserve develop's provider-neutral hashless-recovery design while selecting
  a deployment-pinned Subgraph MCP adapter to feed the LLM Recovery Agent.
- Freeze four advisory actions: `WAIT`, `RECONCILE`, `ESCALATE`, and
  `RETURN_EXISTING_RESULT`; reject any submit/retry capability.
- Keep OneShot durable state and verified Arc evidence authoritative. Direct LLM
  state mutation and Graph-based retry permission were rejected as unsafe.

## Files/components touched

- `plan.md`, `docs/DOMAIN_ARCHITECTURE.md`: explicit MCP/LLM/core architecture.
- `milestones/CONTRACTS.md`, `milestones/README.md`, `milestones/coder-c/*`: frozen ports, fixtures, packet tasks, tests, demo evidence.
- `.agent/TEST_MATRIX.md`: MCP failure, four-action, invalid-output, and existing-result cases.
- `.agent/SPONSOR_REQUIREMENTS.md`, `.agents/skills/sponsor-qualification/SKILL.md`: qualification standard.
- `.agent/research/20260907-subgraph-mcp-clarification.md`: primary-source decision record.

## Commands/checks

- `git fetch origin develop` - develop advanced from `4336e04` to `d256e5360247ba5c0dfd1901470a0ad8c7a46068` during review preparation.
- Fast-forward plus deliberate conflict resolution - preserved the new
  `C01-recovery-evidence-strategy.md`; did not resurrect deleted
  `C01-subgraph-index-health.md`.
- Final `git diff --check`, branch-base equality, task sizing, stale terminology,
  context, permissions, and secret-scope checks - pending after reconstruction.

## External-doc findings

- The Graph Subgraph MCP introduction - MCP exposes schema/query tools and returns structured Subgraph results to a client LLM.
- The Graph AI overview - models can retrieve live blockchain data through Subgraph MCP.
- The Graph hackathon resources, accessed 2026-09-07 - AI apps may use live Subgraph data through MCP; multiple products are a separate track.

## Unresolved questions

- None.

## Git and PR state

- Branch: `plan-clarification`
- Base: `origin/develop` at `d256e5360247ba5c0dfd1901470a0ad8c7a46068`
- Commit: `722c2f0` pushed; sponsor-claim/Arc-qualification plan edits committed this session
- PR: opened against `develop`
- CI: `Agent policy / repository-policy` runs on the pushed head

## Review gates

- Gate A: NOT RUN. `npx free-pi-cli` cannot start in this environment: the
  registry resolves `free-pi-cli` to a `0.0.1` placeholder release that ships no
  executable, and a pinned `free-pi-cli@0.2.19` install was denied by the local
  sandbox. The user was informed of the fail-closed rule in
  `.agent/IMPLEMENTATION_LOOP.md` and explicitly waived both gates for this
  documentation-only change.
- Gate B: NOT RUN. Waived by the same explicit user decision.

Equivalent local evidence was captured instead: the full `agent-policy` workflow
was reproduced locally against the candidate tree and passed, and
`git diff --cached --check` reported no whitespace errors.

## Handoff/next steps

1. Human owner reviews the PR directly; no FreePi verdict backs this tree.
2. Restore the normal Gate A/Gate B loop for the next change once a working
   `free-pi-cli` distribution is available.
