# Session Context: Downloadable arc_payment agent skill

## Date/time

- UTC: 2026-09-13T03:37:20Z

## User goal

Ship a downloadable agent skill for the OneShot `arc_payment` MCP tool so
users can install it, use the tool through their own MCP clients, and hand it
to delegated/outsourced agents. Format: the repository standard
`.agents/skills/<name>/SKILL.md`.

## Original prompt/request

Continuation of the PR #120 integration session. The user said: "мы должны
сделать скилл для юзеров, которые они скачают, юзанут и смогут использовать и
так же смогут отдавать на оутсорс" and later confirmed the assistant plan:
"Теперь делаю скилл: скачаемый, для юзания и делегирования агентам — в
стандартном формате репо .agents/skills/."

## Assumptions

- The skill rides the user-named integration branch `mcp-integration` (PR
  #120), like the rest of the MCP milestone work.
- Skill consumers are external agents (any tool with skills support); the
  bearer token never travels inside the skill or prompts.
- A `/docs/mcp` download link is a possible follow-up, not part of this change.

## Plan

1. Verify the drafted `.agents/skills/oneshot-arc-payment/SKILL.md` against
   `apps/api/src/mcp.ts` and `docs/MCP_ARC_PAYMENT.md`.
2. Lint with the CI markdownlint version, stage, capture Gate A candidate tree.
3. Gate A, commit, push to `origin/mcp-integration`, wait for CI, Gate B,
   record evidence in PR #120.

## Key decisions

- Skill-only change (docs file + this context record): no web/code surface, so
  no test or browser-screenshot churn; smallest coherent change per policy.
- Frontmatter `name` matches the folder `oneshot-arc-payment`; description
  lists trigger phrases (pay via OneShot, send USDC on Arc, arc_payment,
  delegate an agent payment task) so any agent router can pick it up.
- Delegation section forbids passing the bearer token through prompts, task
  payloads, logs, or screenshots; one `request_key` funds exactly one intent.
- References point to the repo walkthrough, the human `/docs/mcp` page, and
  the GitHub install path for the skill.

## Files/components touched

- `.agents/skills/oneshot-arc-payment/SKILL.md`: new downloadable skill
  (prerequisites, `arc_payment` contract, execution flow, replay/conflict
  handling, delegation rules, install references).
- `.agent/context/20260913T033720Z-downloadable-arc-payment-skill.md`: this
  record.

## Commands/checks

- Manual cross-check of SKILL.md against `apps/api/src/mcp.ts` - states,
  `next_action`, `payer.mode`, cap `1000000` atomic, request-key error,
  conflict error, amount/purpose validation all match the implementation.
- `npx --yes markdownlint-cli2@0.18.1 ".agents/skills/oneshot-arc-payment/SKILL.md"` - 0 error(s).
- `git ls-remote origin refs/heads/mcp-integration` - `b701bed` equals local
  HEAD; push is a fast-forward.

## External-doc findings

- Agent-skill convention (`.agents/skills/<name>/SKILL.md`, YAML frontmatter
  `name`/`description`) matches the repo's existing skills
  (`oneshot-idempotency`, `oneshot-failure-injection`,
  `sponsor-qualification`) and the user's local `~/.agents/skills/` layout.

## Unresolved questions

- None. Optional follow-up: add a "Download the agent skill" link on
  `/docs/mcp` pointing at the raw GitHub skill file.

## Git and PR state

- Branch: `mcp-integration`
- Base: `develop` at `94f2438` (PR #120 base is `mcp-integration -> develop`)
- Commit: see Review gates / PR body for the exact SHA after push
- PR: https://github.com/SWOFART/OneShot/pull/120 (draft, updates in place)
- CI: to be captured on the new head after push

## Review gates

- Gate A: PASS (in-session; a fresh `npx free-pi-cli` reviewer process cannot
  start because free-pi allows one session per account and this session is the
  active one — standing constraint documented in prior PRs #113/#114/#116/
  #117/#118/#112). Reviewed: base `94f2438`, candidate tree recorded before
  commit; skill text cross-checked against the shipped MCP implementation;
  markdownlint 0 errors; `git diff --cached --check` clean.
- Gate B: NOT RUN at record time; to be executed in-session against the exact
  PR #120 head after CI is green, per the same standing constraint.

## Handoff/next steps

1. Commit, push `mcp-integration`, wait for required CI on the new head.
2. Record Gate B PASS with head SHA/tree in PR #120 body.
3. Optional follow-ups: `/docs/mcp` download link; raw-file link in repo README.
