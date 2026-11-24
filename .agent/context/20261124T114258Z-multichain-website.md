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
- The browser wallet, MCP payments, and the team-report supplier follow `ONESHOT_CHAIN`. The site build reads `VITE_ONESHOT_CHAIN`.
- Graph recovery runs only when the selected chain sets `graphQueryEnv`. Arc Testnet keeps `ONESHOT_SUBGRAPH_QUERY_URL`. Base Sepolia has no indexer, so Graph recovery is logged as disabled and settlement continues.
- Arc Mainnet is the default rail. Chain id 5042, CAIP-2 eip155:5042, and USDC 0x3600…0000 are pinned from docs.arc.io and Circle on 2026-11-24. Settlement still requires ONESHOT_ALLOW_MAINNET_ACTIVATION=true. Testnets stay selectable. The landing page does not catalog chains.
- Interface type is self-hosted Inter (optical size axis) and JetBrains Mono. IBM Plex is gone.

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

- Circle USDC contract addresses, checked 2026-11-24: Arc Testnet `0x3600000000000000000000000000000000000000`, Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, chain id 84532, 6 decimals. [USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)

## Unresolved questions

- The owner chose to move the wallet, MCP, and supplier onto the selected chain, keep Base Sepolia selectable without an extra flag, and skip Graph recovery on chains with no indexer. Those choices are implemented on this branch.

## Git and PR state

- Branch: `cursor/multichain-website-c94d`
- Base: `develop`
- Commit: `bb5b922019d7a85b02d05eeb297d5c597807d2e8`
- PR: not created yet
- CI: not started

## Review gates

- Gate A: NOT RUN. `free-pi-cli` is installed but starts an interactive GitHub sign-in, which this session cannot complete. The review was not executed.
- Gate B: NOT RUN

## Handoff/next steps

1. Commit, push, and open the pull request.
2. A human reviews Gate A/B if those reviews are still required before merge.
