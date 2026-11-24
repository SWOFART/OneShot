# Brand frontend integration handoff

- Date: 2026-09-11
- Branch: `feature/brand-frontend-integration`
- Base work retained: `feature/circle-x402-demo` at `b34035685224a4fed01828076ecf57296f8aa806`
- Integrated source: PR #76 `origin/milestone/brand-frontend` at `81230871420ab87c7f550eceebe6b31bec6bce8e`

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
- Root format, lint, typecheck, test, and build are recorded against the final
  remote pull-request head.

## Local checks

- `pnpm format:check` — PASS
- `pnpm typecheck` — PASS
- `pnpm lint` — PASS
- `pnpm build` — PASS
- `pnpm test` — PASS (76 files, 1,024 tests)
- `pnpm --filter @oneshot/web test:browser` — PASS (4 tests)

## Candidate review

- Candidate tree: `18b4574d0ce26f27d2c721c240dbbd2034ab722c`
- Review recorded a pass. Model `gpt-oss-120b-speed`. Base
  `c89cbdeb708a49bf5b71e98e87b94d2d92007d3d`. No blocking findings.

## Pull request review

- PR: [#77](https://github.com/SWOFART/OneShot/pull/77)
- Remote head commit: `2baf7ff9b337d8f64ecc7374ec5bdfb9a6a76340`
- Remote head tree: `18b4574d0ce26f27d2c721c240dbbd2034ab722c`
- Review recorded a pass. Model `gpt-oss-120b-speed`. No blocking findings.
- Required CI checks passed: `repository-policy`, `Markdown and Mermaid`,
  `ESLint and TypeScript`, `Frontend browser acceptance`, and `Workers Builds:
  oneshot`.
