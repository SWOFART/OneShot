# Session Context: recovery-route-composition

## Date/time

- UTC: 2026-09-08T18:25:19Z

## User goal

Serve the existing `apps/web` frontend at the domain root and the recovery UI
at `/recovery` from the same Cloudflare assets deployment.

## Original prompt/request

The current Cloudflare deployment includes `./apps/web/dist`, while UI exists
in `packages/recovery-ui`. Combine them so `oneshot.kapustazh.dev` keeps the
current pages and `oneshot.kapustazh.dev/recovery` serves the recovery UI; do
this on a new branch.

## Assumptions

- The recovery site is the existing synthetic fixture viewer, not a new live
  API integration.
- The current Wrangler assets directory remains `apps/web/dist`.
- The branch should start from the clean current `develop` branch.

## Plan

1. Build the main app and recovery site into one static asset tree.
2. Verify asset paths, production builds, and Wrangler configuration.

## Key decisions

- Emit recovery files to `apps/web/dist/recovery` and use Vite base
  `/recovery/`, preserving the root app bundle and making nested assets resolve
  under the route.
- Keep Cloudflare's existing SPA fallback because both apps are static entry
  points and the recovery viewer does not require server-side routes.

## Files/components touched

- `package.json`: added the combined frontend build script.
- `wrangler.jsonc`: changed the Cloudflare build command to the combined build.
- `packages/recovery-ui/vite.site.config.ts`: configured the `/recovery/` base
  and shared output directory.
- `apps/web/README.md`: documented the deployed route and build command.
- `packages/recovery-ui/README.md`: updated the package deployment instructions
  for the combined asset tree and `/recovery/` route.

## Commands/checks

- Branch creation: `feature/recovery-route-composition`.
- `pnpm build:frontend` - passed; root output and `/recovery/` output were
  emitted into one asset tree.
- `pnpm --filter @oneshot/web test` - passed, 27 tests.
- `pnpm --filter @oneshot/recovery-ui test` - passed, 51 tests.
- Both package typechecks and linters - passed.
- `pnpm exec wrangler deploy --dry-run` - passed; Wrangler read 9 asset files
  from `apps/web/dist` and exited without uploading.
- Prettier check on changed config files - passed.
- Documentation correction: `packages/recovery-ui/README.md` now documents
  `pnpm build:frontend`, `apps/web/dist/recovery`, and `/recovery/`.

## External-doc findings

- None required; this change uses the repository's existing Vite and Wrangler
  configuration.

## Unresolved questions

- None.

## Git and PR state

- Branch: `feature/recovery-route-composition`
- Base: `develop` (working tree was clean at branch creation)
- Commit: uncommitted
- PR: not created
- CI: not run

## Review gates

- Gate A: FAIL on prior tree due stale recovery deployment docs; fresh review
  pending for the corrected tree.
- Gate B: NOT RUN

## Handoff/next steps

1. Review the branch and deploy it through the normal Cloudflare workflow.
