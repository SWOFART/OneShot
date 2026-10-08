# Session Context: sync main README

## Date/time

- UTC: 2026-10-08T16:57:09Z

## User goal

Make main README match develop via a new documentation-only PR.

## Original prompt/request

User asked to make README the same as develop, then accepted updating main.
Prior instruction: never reopen closed PRs; skip FreePi for this work.

## Assumptions

- Sync README and its linked developer guide; other develop changes excluded.
- Main is explicitly selected target; branch from main for scoped comparison.

## Plan

1. Copy exact documents from develop, check links and Markdown, create draft PR.

## Key decisions

- Source develop: 55a387abad228d61c7a0a7a911299c103495bda0.
- No application or deployment configuration changes.
- No merge by agent.

## Files/components touched

- README.md and docs/DEVELOPER_GUIDE.md: exact develop versions.
- This session context.

## Commands/checks

- Exact source equality and relative links: checked before commit.
- Pinned repository-wide Markdown lint: run before commit.
- git diff --check: run before commit.

## External-doc findings

- None; copy existing documentation without new integration claims.

## Unresolved questions

- None.

## Git and PR state

- Branch: docs/sync-main-readme.
- Base main: 319b0758147622e8f25930e6663884a252f86dd1.
- Commit/PR: created after validation; new draft targets main.
- CI: pending at creation.

## Review gates

- Gate A and B: SKIPPED per explicit user instruction to omit FreePi.
- No passing review claimed; remains draft.

## Handoff/next steps

1. Human review and merge; closed PRs remain untouched.
