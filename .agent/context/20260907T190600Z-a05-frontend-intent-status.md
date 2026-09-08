# Session Context: A05 Frontend Intent and Authoritative Status

## Date/time

- Started: 2026-09-07T19:06:00Z
- Continued: 2026-09-08T12:29:20Z

## User goal and original request

Implement Coder A milestone A05 after Gate P4: "Делай" in response to the identified next packet, A05 Frontend Intent and Authoritative Status.

## Assumptions and non-goals

- Base is current `origin/develop` at `1250dec`.
- A05 consumes frozen OpenAPI v1 and does not add settlement capability.
- The browser receives a demo service token only at runtime and does not persist it.
- B05/C05 composition remains project Gate P5 work.
- No production API deployment, mainnet action, settlement detail UI, or visual polish campaign is included.

## Plan and decisions

- Preserve and finish the existing uncommitted A05 implementation after moving its base from A04 to current `develop`.
- Use generated `@oneshot/contracts` types and a small typed fetch client.
- Keep exact USDC parsing and formatting string/`bigint` based.
- Preserve the same Business Intent ID for replay; generate another ID only through an explicit new-obligation action.
- Stop polling at `UNKNOWN`; expose reconciliation only, never payment retry.
- Replace the Cloudflare placeholder asset with the built A05 SPA.
- Use React/Vite dependencies already present in the workspace; add no design system or state library.

## Files and components

- `apps/web`: application shell, API client, intent form, status view, readiness banner, exact money helpers, tests, and setup documentation.
- Root TypeScript/ESLint/workspace lock configuration includes the new app.
- Root Wrangler assets now point to `apps/web/dist`; the old placeholder is removed.
- Root README lists the operator frontend and its local command.

## Commands and checks

- `pnpm --filter @oneshot/web test`: 27 tests passed.
- `pnpm --filter @oneshot/web lint`: passed.
- `pnpm --filter @oneshot/web typecheck`: passed.
- `pnpm --filter @oneshot/web build`: passed; production source maps remain disabled.
- `pnpm exec wrangler deploy --dry-run`: passed with `apps/web/dist` assets.
- `pnpm format:check`, root `pnpm lint`, root `pnpm typecheck`, generated-contract check, and fixture validation: passed.
- Root `pnpm test`: 576 tests passed across 43 files.
- `TEST_POSTGRES=1 pnpm test:integration`: unavailable locally because no container runtime is running; the first Testcontainers suite reported `Could not find a working container runtime strategy`. Required CI provides the integration environment.
- Local runtime uses Node 22.23.2 and reports the repository's expected Node 24.19.0 engine warning; CI uses `.nvmrc`.

## External documentation findings

- Wrangler 4.127.0 local schema accepts `assets.not_found_handling = "single-page-application"`.
- Added `build.command = "pnpm --filter @oneshot/web build"` to `wrangler.jsonc` so Cloudflare Workers Builds automatically builds the Vite SPA before asset upload.

## Unresolved questions

- None for A05 packet scope. Production API deployment and P5 UI composition remain later work.

## Branch, commit, PR, and review state

- Branch: `milestone/a05-frontend-intent-status`
- Base: `origin/develop` at `1250dec79bc702939fe2a3b0fd00e66bb34128af`
- Initial commit: `d3fbfacdee365d159807256a53011140442867ff`
- PR: `#32` (https://github.com/SWOFART/OneShot/pull/32)
- Gate A: PASS (pre-push tree `da775d97e7a8c7869803c6f5a6a91894b5714d83`; updating for build command fix)
- Gate B: pending CI and exact-head review

## Handoff and next steps

- Validate wrangler build integration locally.
- Re-run Gate A, commit fix, push to PR #32.
- Verify CI passes (including Workers Builds).
- Run Gate B and mark PR ready for review.
- Project Gate P5 will compose B05/C05 UI packages after A05 closes.
