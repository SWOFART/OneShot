# Session Context: Web Proxy Robustness & Default Privy App ID

## Date/time

- UTC: 2026-09-10T02:27:00Z

## User goal

Fix "Privy login is not configured for this build" and "REQUEST FAILED: Failed to fetch" errors by:

1. Hardcoding the default Privy App ID in apps/web/src/main.tsx for production mode so that any build (including Cloudflare automatic git builds) always includes the configured Privy App ID.
2. Solidifying apps/web/worker.ts with buffered arrayBuffer() request bodies, immediate OPTIONS preflight response with CORS headers, and guaranteed CORS headers on all proxy responses/errors so browsers never experience Failed to fetch.

## Assumptions

- Base is develop at 48ff88c72df959137f08a98ceaac397ab5a1c527.
- In test mode (import.meta.env.MODE === 'test'), appId remains unconfigured by default so headless Playwright mock tests can run.
- In production builds (import.meta.env.MODE === 'production'), appId defaults to cmtqbf5zo013w0cky3r0jqjca.
- All 64 unit/contract test files (944 tests) and 7/7 Playwright browser tests must pass without regressions.
