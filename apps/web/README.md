# OneShot web

Minimal operator UI for creating or replaying a Business Intent and reading its authoritative status.

```powershell
pnpm --filter @oneshot/web dev
```

Vite proxies `/v1` and `/health` to the local API. For a separate deployed API, set the public build variable `VITE_ONESHOT_API_BASE_URL`. Enter the demo service token at runtime; the UI keeps it in memory and never persists it.

The client consumes generated `@oneshot/contracts` types from frozen OpenAPI v1. Tests use deterministic fetch responses matching that contract.
