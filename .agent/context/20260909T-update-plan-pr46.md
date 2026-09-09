# Context: update plan for merged PR #46

Date: 2026-09-09
Goal: Record the impact of merged PR #46 on the delivery plan and missing-parts audit.
Branch: `docs/update-plan-pr46`
Recorded base: `origin/develop` at `0cd80ca50467a6a2a7732808bfbd269fa0e71b2c`

## Acceptance criteria

- `plan.md` records PRs #42-#46 as merged into `develop`.
- `plan.md` records PR #46 as delivering tested Vertex AI and Subgraph MCP
  adapters while keeping production defaults unavailable.
- `plan.md` and `plan_missing_parts.md` retain the Explorer no-allocation,
  The Graph `NOT VERIFIED`, `FALLBACK_DIRECT_RECOVERY`, P4 incomplete, and P6
  open positions.
- `plan_missing_parts.md` distinguishes delivered adapter implementation from
  remaining runtime admission, allocation, live-query, and qualification proof.
- No source, configuration, secrets, or OneShot settlement invariants change.

## Assumptions and non-goals

The current `origin/develop` state is the implementation base. This change is
documentation-only apart from this context record. It does not enable live
MCP/model ports, change the Explorer deployment, claim a Graph allocation, or
authorize hashless recovery.

## Validation

- `npx.cmd markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"`: PASS
- `git diff --check`: PASS
- Gate A: NOT RUN
- Gate B: NOT RUN
