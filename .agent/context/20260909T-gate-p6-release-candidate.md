# Gate P6 release candidate

- Branch: `milestone/gate-p6-release-candidate`
- Base: `7ae55c8d473ca1bc6ca146de0dfd375571fb517a`
- Scope: repeatable offline E2E demo, judge walkthrough, and plan scope update.
- Acceptance: demo proves 1.00 USDC evidence, zero-effect Privy denials, and
  lost-response at-most-once recovery; Circle and video are not claimed.
- Checks: `pnpm demo:e2e`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm --filter @oneshot/testkit-settlement evidence:b06` passed.
