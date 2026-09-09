# Session Context: update plan and Subgraph status

## Date/time

- UTC: 2026-09-08T23:12:11Z

## User goal

Review the open Pull Requests, evaluate their effect on `plan.md` and
`plan_missing_parts.md`, reconcile the deployed OneShot Subgraph status on The
Graph Explorer with the available query evidence, then commit the updated plan
on `docs/update-plan-subgraph`.

## Original prompt/request

Review open Pull Requests and evaluate how they impact `plan.md` and
`plan_missing_parts.md`; investigate the deployed Subgraph on The Graph
Explorer; resolve the UI/query-status discrepancy; create branch
`docs/update-plan-subgraph`; and commit an updated `plan.md`.

## Assumptions

- The user-supplied Explorer ID `69FEby7GetXpJVWJShPL6XjMsWWDowLuqf6cE5MvTHdy`
  is the public documentation target.
- The Graph deployment and manifest identifiers are public metadata; secrets,
  API keys, and credentials remain outside Git and context records.
- Open PRs are progress signals only until a human merges them into `develop`.

## Plan

1. Inspect policy, current plans, GitHub open PRs, and Graph Explorer evidence.
2. Create the required branch from the current `origin/develop`.
3. Update the canonical plan and align the missing-parts audit with the verified
   published-but-unallocated Subgraph status.
4. Run documentation/repository checks, capture Gate A, commit, and report the
   exact tree and commit. Do not push or create a PR unless requested.

## Key decisions

- Treat the Graph deployment as published and immutable but not network-indexed:
  Explorer shows `SUBGRAPH NOT INDEXED`, no indexers, and no allocations.
- Treat Studio/development query success as distinct from decentralized Gateway
  availability; it cannot upgrade The Graph to `LIVE_VERIFIED`.
- Pin runtime identity to the immutable deployment CID, while documenting the
  user-supplied public Subgraph ID and the duplicate public registration that
  points to the same deployment.

## Files/components touched

- `plan.md`: current PR progress, Graph deployment identity, discrepancy
  explanation, and status-gated recovery wording.
- `plan_missing_parts.md`: split deployment identification from the still-open
  allocation/indexing, MCP/model, and live-proof work.
- This context record.

## Commands/checks

- `git fetch origin develop` - PASS; `origin/develop` is
  `48391e4968675764632627716e580988a271c13d`.
- `gh pr list` / `gh pr view` - three open, mergeable PRs (#42, #43, #44),
  required checks successful.
- Graph Explorer UI inspection - published IDs and deployment metadata visible;
  status is `NOT INDEXED` / `SUBGRAPH NOT INDEXED` and query result says
  `subgraph not found: no allocations`.
- Graph manifest fetch - PASS; deployment CID resolves to the published Arc
  Testnet manifest.
- Remaining checks and commit are pending.

## External-doc findings

- The Graph Studio documentation states that Studio deployment is for testing
  and is separate from publishing to the decentralized network.
- The Graph querying documentation distinguishes the Studio development endpoint
  from the production Gateway endpoint.
- The Graph publishing documentation states that publishing makes a Subgraph
  available for Indexers; Explorer evidence shows no Indexer allocation yet.

## Unresolved questions

- The operator must choose whether to retain or clean up the duplicate public
  Subgraph registration; both observed registrations point at the same
  deployment. This does not alter the immutable deployment identity.
- Live Subgraph MCP/model trace and Arc candidate-verification evidence remain
  absent.

## Git and PR state

- Branch: `docs/update-plan-subgraph`
- Base: `origin/develop` at `48391e4968675764632627716e580988a271c13d`
- Commit: uncommitted
- PR: not created
- CI: not run for this branch

## Review gates

- Gate A: NOT RUN
- Gate B: NOT APPLICABLE; no PR requested or created

## Handoff/next steps

1. Finish the focused documentation edits and validation.
2. Stage only the plan, missing-parts audit, and context record; run Gate A.
3. Commit the reviewed tree and report the branch, commit, and remaining live
   Graph/MCP/model gap.
