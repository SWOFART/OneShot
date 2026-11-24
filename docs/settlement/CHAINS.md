# Settlement chains

OneShot settles one USDC transfer for one business intent. The chain is not
hardcoded inside the settlement adapter. A chain record supplies the chain id,
CAIP-2 network, settlement asset, and native gas asset. The adapter submits
only on the chain selected for that process.

Arc Mainnet is the default rail. Its chain id `5042`, CAIP-2 `eip155:5042`,
and USDC address `0x3600000000000000000000000000000000000000` are pinned from
Arc's published network and contract pages and from Circle's USDC address list,
checked on 2026-11-24. Settlement still refuses to run until the operator sets
`ONESHOT_ALLOW_MAINNET_ACTIVATION=true`. Arc Testnet and Base Sepolia stay
selectable for testing.

The browser wallet, MCP payments, the team-report supplier, and direct
settlement intents all use the selected chain. A site build sets
`VITE_ONESHOT_CHAIN` to the same id so the wallet switches with the server.

## Select a chain

Set one selector. If both are set, they must be the same id.

| Variable              | Required                             | Values                                  |
| --------------------- | ------------------------------------ | --------------------------------------- |
| `ONESHOT_CHAIN`       | Defaults to `arc-mainnet`            | `arc-mainnet`, `arc-testnet`, `base-sepolia` |
| `ONESHOT_ARC_PROFILE` | Legacy selector; must match `ONESHOT_CHAIN` when both are set | `arc-mainnet`, `arc-testnet` |

`ONESHOT_ARC_RPC_URL` is the HTTPS JSON-RPC endpoint for the selected chain.
The readiness probe reads `eth_chainId` and the token `decimals()` and refuses
the process when they disagree with the pinned chain. HTTP is allowed only on
loopback.

```bash
ONESHOT_CHAIN=base-sepolia
ONESHOT_ARC_RPC_URL=https://<base-sepolia-rpc-host>
```

Leaving both selectors unset selects Arc Mainnet. The process then fails until
`ONESHOT_ALLOW_MAINNET_ACTIVATION=true`. A test deployment sets
`ONESHOT_CHAIN=arc-testnet` or `ONESHOT_CHAIN=base-sepolia` instead.

Mainnet settlement requires the pinned profile, which this build already
carries, and `ONESHOT_ALLOW_MAINNET_ACTIVATION=true`. The flag is the
operator confirmation. The profile does not store an RPC URL. The readiness
probe still checks that the operator's endpoint reports chain id `5042`.

## What a chain record contains

A pinned chain has:

- `id` and `displayName`
- `family: 'evm'`
- `settlementMethod: 'erc20-transfer'`
- `chainId` and `caip2` (`eip155:<chainId>`)
- settlement asset symbol, decimals, and contract
- native asset symbol and decimals

Settlement amounts are integer atomic units of the settlement asset. Native
decimals are for gas only. The readiness probe requires 6 settlement decimals,
18 native decimals, and those two values to differ. That matches USDC on Arc
and on Base Sepolia. A chain that does not meet it is refused.

RPC and explorer URLs are operator configuration. They are not stored on the
chain record.

## Enabled chains

| Id             | Network          | Chain id  | Settlement asset                                              | Status                                                                                           |
| -------------- | ---------------- | --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `arc-mainnet`  | `eip155:5042`    | `5042`    | USDC `0x3600000000000000000000000000000000000000`, 6 decimals | Default. Native gas is USDC at 18 decimals. Settlement requires `ONESHOT_ALLOW_MAINNET_ACTIVATION=true`. No Graph indexer in this build. |
| `arc-testnet`  | `eip155:5042002` | `5042002` | USDC `0x3600000000000000000000000000000000000000`, 6 decimals | Testnet. Native gas is USDC at 18 decimals. Graph indexer uses `ONESHOT_SUBGRAPH_QUERY_URL`. |
| `base-sepolia` | `eip155:84532`   | `84532`   | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals | Testnet. Native gas is ETH at 18 decimals. No Graph indexer. |

## Graph recovery

Graph recovery is optional per chain. Arc Testnet sets `graphQueryEnv` to
`ONESHOT_SUBGRAPH_QUERY_URL`, so a testnet deployment keeps its existing
subgraph. Arc Mainnet and Base Sepolia do not set `graphQueryEnv`.

When the selected chain has no indexer, the API and worker log
`Graph recovery disabled` and continue. Settlement, receipt verification, MCP
payments, and the team-report supplier do not wait on Graph. A chain that has
an indexer still requires that indexer's URL and the existing recovery
settings. The Arc subgraph is not queried for a different chain.

The browser wallet uses a public endpoint in `apps/web/src/wallet-chain.ts`.
That endpoint is for the wallet only. Settlement still uses
`ONESHOT_ARC_RPC_URL`.

## Add a chain

1. Add a pinned record to `SETTLEMENT_CHAINS` in `packages/contracts/src/chains.ts`.
   Keep Arc Mainnet first. Copy a testnet record and replace the id,
   display name, chain id, CAIP-2, and token contract with values from the
   asset issuer. Do not invent an address, and do not add an RPC URL.
2. Add the same CAIP-2 string to `settlementNetworks` in
   `packages/contracts/scripts/generate-contracts.mjs`.
3. Run `pnpm --filter @oneshot/contracts generate`. The chain test fails if the
   OpenAPI enum and `ENABLED_SETTLEMENT_NETWORKS` disagree.
4. Confirm the readiness probe passes against a fixture whose `eth_chainId`
   and `decimals()` match the record.
5. Set `graphQueryEnv` only when that chain has its own indexer. Leave it unset
   to skip Graph recovery. Add a public wallet endpoint in
   `apps/web/src/wallet-chain.ts` when the browser should pay on the new chain.

`createChainRegistry` builds a registry from a list. Tests use it to try an
extra chain without changing the catalog the process loads.
