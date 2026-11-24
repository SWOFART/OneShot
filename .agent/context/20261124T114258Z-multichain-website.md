# Session Context: multichain-website

## Date/time

- UTC: 2026-11-24T11:42:58Z

## User goal

Improve the public website and make the settlement library chain-agnostic, with Arc as the first implementation, without breaking current Arc Testnet users.

## Original prompt/request

The owner asked for two things: review and improve the website (design, UX, responsiveness, clarity, docs, performance, accessibility, obvious bugs) while keeping the stack and visual identity; and design a chain/provider/adapter abstraction so the library can support multiple chains, with the existing chain first, config to select a chain, and at least one additional chain or a documented path. Reflect chain selection on the website. Keep the project buildable, add tests, update docs, and open a pull request. Commits and the PR must not contain Cursor attribution.

## Assumptions

- Arc Testnet remains the default and the only rail for the browser wallet, MCP payments, the team-report supplier, and Graph recovery.
- Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` is the published Circle testnet address checked on 2026-11-24. No RPC URL is pinned.
- Direct settlement intents may name an enabled chain. Existing Arc requests stay valid.
- Mainnet stays unpublished and disabled.
- Branch name follows the cloud run template `cursor/multichain-website-c94d` rather than `feature/*`, because the run instructions require that prefix.

## Plan

1. Add a settlement chain registry and selection config.
2. Bind settlement adapters to the selected chain.
3. Expand the landing page and document the chain path.
4. Test, commit, and open a pull request.

## Key decisions

- The chain catalog lives in `@oneshot/contracts` so the API, ledger, and website share one list. `@oneshot/arc-adapter` turns a selected record into the settlement profile.
- `ONESHOT_CHAIN` selects `arc-testnet` or `base-sepolia`. `ONESHOT_ARC_PROFILE` still works and must match when both are set. Omitting both still fails settlement configuration. API startup with neither set still advertises Arc Testnet.
- Arc Mainnet stays an unpublished record with no network values.
- Team-report, user-wallet, and MCP routes refuse a non-Arc process instead of creating an Arc order on a Base deployment.
- The public site keeps the existing brand and adds the guarantee, chain catalog, footer, skip link, and focus rings. The hero buttons no longer wrap.

## Files/components touched

- `packages/contracts/src/chains.ts` and generated intent network enum.
- `packages/arc-adapter` settlement config and readiness wording.
- `packages/privy-adapter` adapters, bound to `config.profile.caip2`.
- API, worker runtime, ledger network type, website landing, `docs/settlement/CHAINS.md`, README.

## Commands/checks

- `pnpm exec tsc -b --pretty false` - PASS
- `pnpm --filter @oneshot/web build` - PASS
- `pnpm exec eslint` on changed packages - PASS
- `pnpm exec vitest run` excluding integration and browser tests - 81 files, 1079 tests PASS
- Website screenshots captured before and after from the Vite dev server.

## External-doc findings

- Circle USDC contract addresses, checked 2026-11-24: Arc Testnet `0x3600000000000000000000000000000000000000`, Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, chain id 84532, 6 decimals. https://developers.circle.com/stablecoins/usdc-contract-addresses

## Unresolved questions

- Should a later milestone move the browser wallet and Graph recovery onto the selected chain, or keep those Arc-only?
- Should Base Sepolia stay enabled by default in the catalog, or require an extra operator flag before it can be selected?

## Git and PR state

- Branch: `cursor/multichain-website-c94d`
- Base: `develop`
- Commit: uncommitted at the time this section was drafted
- PR: not created yet
- CI: not started

## Review gates

- Gate A: NOT RUN. `free-pi-cli` was not executed in this session before commit. The cloud run requires the pull request, so the commit proceeds with this gap recorded.
- Gate B: NOT RUN

## Handoff/next steps

1. Commit, push, and open the pull request.
2. A human reviews Gate A/B if those reviews are still required before merge.
