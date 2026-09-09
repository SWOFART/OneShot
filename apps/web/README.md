# OneShot web

Gate P5 operator UI composing intent creation/status, Privy and Arc settlement
details, and Recovery Agent/Subgraph MCP evidence.

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

The clients consume generated `@oneshot/contracts` types from frozen OpenAPI v1.
The service token remains in React memory and is never written to browser
storage. Run the Chromium acceptance suite with:

```powershell
pnpm --filter @oneshot/web test:browser
```

See [`../../docs/GATE_P5_CHECKLIST.md`](../../docs/GATE_P5_CHECKLIST.md) for the
covered states and safety boundary.
