# Brand frontend integration handoff

- Date: 2026-09-11
- Branch: `feature/brand-frontend-integration`
- Base work retained: `feature/circle-x402-demo` at `b34035685224a4fed01828076ecf57296f8aa806`
- Integrated source: PR #76 `origin/milestone/brand-frontend` at `81230871420ab87c7f550eceebe6b31bec6bce8e`
- Gate A base: `origin/develop` at `c89cbdeb708a49bf5b71e98e87b94d2d92007d3d`

## Objective

Replace the old web presentation with the PR #76 brand system while keeping
the current product connections: Privy operator authentication, machine-token
fallback, intent/status/settlement/recovery clients, Tools and Jobs cabinet
flows, Circle x402 demo, and read-only recovery evidence.

## Implemented shape

- `@oneshot/brand` owns palette tokens, fonts, CommitRing, and responsive Hero.
- Web routes remain split: `/` public landing and `/app` authenticated cabinet.
- Both routes use the branded mark, Arc/USDC status chips, theme toggle, and
  responsive Hero; the default console keeps the PR #76 shell and existing
  Gate P5 tabs.
- PR #76 EIP-6963 discovery, searchable wallet picker, headless Privy SIWE,
  and sanitized wallet failure handling remain enabled.
- Job workspace styles now consume brand tokens; no raw color literals or old
  undefined CSS variables remain in the web stylesheet.

## Safety boundary

- UI remains read-only for settlement and recovery evidence.
- Login credentials and machine tokens stay in memory; no token is persisted.
- Existing intent idempotency, UNKNOWN reconciliation, Privy policy boundary,
  and Circle x402 approval flow are unchanged.

## Acceptance

- Web unit/component suites pass.
- Web typecheck/lint/build and browser Gate P5 pass.
- Root format, lint, typecheck, test, build, and required FreePi Gates A/B are
  run on the final staged tree before the draft PR is opened.

## Local checks

- `pnpm format:check` — PASS
- `pnpm typecheck` — PASS
- `pnpm lint` — PASS
- `pnpm build` — PASS
- `pnpm test` — PASS (76 files, 1,024 tests)
- `pnpm --filter @oneshot/web test:browser` — PASS (4 tests)

## Gate A candidate review

- Candidate tree before the evidence update: `625c552731320f19b71cb4bf7f64c66dcef1fc1c`
- FreePi Gate A: PASS; reviewer tool `free-pi-cli`, selected model
  `gpt-oss-120b-speed`, base `c89cbdeb708a49bf5b71e98e87b94d2d92007d3d`,
  target staged workspace. The reviewer reported no blocking or non-blocking
  findings and verified the requested brand, auth, job, and safety criteria.
- A fresh Gate A review is required for the final tree after this context entry
  is staged.
