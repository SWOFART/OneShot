# Session Context: MCP access and request scope

## Date/time

- UTC: 2026-09-13T04:07:25Z

## User goal

Remove the unused MCP-specific 1 USDC cap, make the downloadable agent skill installable with npx, connect the merged MCP path to Google Cloud, and verify that users see only their own requests.

## Original prompt/request

The user asked to remove the MCP 1 USDC boundary, provide the bearer required by agent configuration, add the missing npx skill installation instructions, audit per-user request isolation, and make the MCP usable through the existing Google Cloud deployment.

## Assumptions

- “Remove the 1 USDC boundary” means delete the second MCP-only cap. The worker settlement cap and Privy policy remain authoritative security controls.
- A shared production bearer must stay in Google Secret Manager and must not be embedded in the public docs page.
- Browser request isolation applies to job lists, job reads/results, and activity. Direct intent/recovery routes need a later storage association before full cross-workspace isolation can be claimed.

## Plan

1. Remove the MCP-specific amount cap and its configuration/tests/docs.
2. Scope browser job and activity routes by the verified Privy subject.
3. Add and verify the exact npx skill install command.
4. Validate, commit/push, then build and deploy the API with Google Secret Manager-backed MCP configuration.
5. Verify public MCP authentication and tool discovery without submitting a payment.

## Key decisions

- Derive an opaque stable workspace ID as SHA-256 of the verified Privy subject; do not accept a caller-selected workspace.
- Issue one random 256-bit bearer per Privy workspace, store only its SHA-256 digest, and allow explicit rotation. Keep the optional operator bearer only for compatibility.
- Never render or commit the bearer token.

## Files/components touched

- API authentication and route workspace selection.
- MCP cap configuration and tests.
- MCP docs page, operator docs, downloadable skill, and implementation plan.
- PostgreSQL migration 011 and personal MCP credential store.`r`n- Authenticated Profile token generation and rotation UI.`r`n- Google Cloud deployment configuration (pending).

## Commands/checks

- `npx --yes skills@latest add https://github.com/SWOFART/OneShot/tree/develop --list --full-depth` - found `oneshot-arc-payment`.
- `pnpm build` - passed on local Node 22 with the repository Node 24 engine warning.
- `pnpm --filter @oneshot/api test` - 75/75 passed after personal token work.
- Focused web profile/docs tests - 10/10 passed.`r`n- `pnpm test` - 79 files and 1052 tests passed.`r`n- `pnpm test:browser` - 8/8 Chromium checks passed.
- Full web test exposed two pre-existing failures in `privy-session.test.tsx`; the changed MCP docs assertion was updated and passes.

## External-doc findings

- None. The installed `skills` CLI help verified the command syntax directly.

## Unresolved questions

- Google Secret Manager list/get remains unavailable to the active account; personal MCP bearer generation does not depend on a shared MCP secret.
- Direct `/v1/intents/:id`, reconcile, and recovery-view routes are not yet workspace-bound in storage; job request views are isolated.`r`n- The active account cannot list/get Secret Manager metadata, but personal MCP tokens no longer require a shared MCP secret.

## Git and PR state

- Branch: fix/mcp-access-and-scope
- Base: origin/develop at 246a38af36e291b0538eb0a8f87d1f3b3f1def60
- Commit: 9aafe21d27e27a99ddb0586a0cff747bd36a38f2
- PR: https://github.com/SWOFART/OneShot/pull/122 (draft)
- CI: all required checks passed for 9aafe21d27e27a99ddb0586a0cff747bd36a38f2

## Review gates

- Gate A: SKIPPED by explicit user instruction to continue without FreePi.
- Gate B: SKIPPED by explicit user instruction to continue without FreePi.

## Handoff/next steps

1. Finish local checks and inspect the candidate diff.
2. Commit, push, and open the PR without FreePi per user instruction.
3. Build/deploy the API image and configure `/mcp` through Google Cloud.
