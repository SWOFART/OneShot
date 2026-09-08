# OneShot web

Minimal operator UI for creating or replaying a Business Intent and reading its authoritative status.

The Cloudflare asset deployment serves this app at the domain root and the
recovery fixture viewer from `@oneshot/recovery-ui` at `/recovery/`. Deploy it
only after `VITE_ONESHOT_API_BASE_URL` points to a reachable OneShot API. An
assets-only Worker cannot serve `/health` or `/v1`.

```powershell
pnpm --filter @oneshot/web dev
```

Vite proxies `/v1` and `/health` to the local API. For a separate deployed API, set the public build variable `VITE_ONESHOT_API_BASE_URL`. Enter the demo service token at runtime; the UI keeps it in memory and never persists it.

The combined production asset tree is built with:

```powershell
pnpm build:frontend
```

This emits the main app to `apps/web/dist` and the recovery viewer to
`apps/web/dist/recovery`, matching the Wrangler asset directory.

The client consumes generated `@oneshot/contracts` types from frozen OpenAPI v1. Tests use deterministic fetch responses matching that contract.
