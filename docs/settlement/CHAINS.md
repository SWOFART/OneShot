# Settlement chains

OneShot settles one USDC transfer for one business intent. The chain is not
hardcoded inside the settlement adapter. A chain record supplies the chain id,
CAIP-2 network, settlement asset, and native gas asset. The adapter submits
only on the chain selected for that process.

Arc Testnet is the first implementation and the default. Base Sepolia is a
second pinned testnet. Arc Mainnet is present and unpublished: it carries no
chain id, token, RPC, or explorer, and it cannot be selected.

The browser wallet, MCP payments, the team-report supplier, and direct
settlement intents all use the selected chain. A site build sets
`VITE_ONESHOT_CHAIN` to the same id so the wallet switches with the server.

## Select a chain

Set one selector. If both are set, they must be the same id.

| Variable              | Required                             | Values                                  |
| --------------------- | ------------------------------------ | --------------------------------------- |
| `ONESHOT_CHAIN`       | One of the two selectors             | `arc-testnet`, `base-sepolia`           |
| `ONESHOT_ARC_PROFILE` | Used when `ONESHOT_CHAIN` is omitted | `arc-testnet`. `arc-mainnet` is refused |

`ONESHOT_ARC_RPC_URL` is the HTTPS JSON-RPC endpoint for the selected chain.
The readiness probe reads `eth_chainId` and the token `decimals()` and refuses
the process when they disagree with the pinned chain. HTTP is allowed only on
loopback.

```bash
ONESHOT_CHAIN=base-sepolia
ONESHOT_ARC_RPC_URL=https://<base-sepolia-rpc-host>
```

Leaving both selectors unset fails settlement configuration. API startup with
neither variable still advertises Arc Testnet, which is the chain the API used
before selection existed.

Mainnet still requires a pinned profile, an enabled flag, and
`ONESHOT_ALLOW_MAINNET_ACTIVATION=true`. Authorization alone is not enough.

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
| `arc-testnet`  | `eip155:5042002` | `5042002` | USDC `0x3600000000000000000000000000000000000000`, 6 decimals | Default. Native gas is also named USDC and uses 18 decimals.                                     |
| `base-sepolia` | `eip155:84532`   | `84532`   | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals | Selectable testnet. Native gas is ETH at 18 decimals. Address from Circle's published USDC list. |
| `arc-mainnet`  | none             | none      | none                                                          | Unpublished and disabled.                                                                        |

## Graph recovery

Graph recovery is optional per chain. Arc Testnet sets `graphQueryEnv` to
`ONESHOT_SUBGRAPH_QUERY_URL`, so an Arc deployment keeps its existing subgraph.
Base Sepolia does not set `graphQueryEnv`.

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
   Put Arc Testnet first. Copy the Base Sepolia record and replace the id,
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
