# Settlement chains

OneShot settles one USDC transfer for one business intent. The chain is not
hardcoded inside the settlement adapter. A chain record supplies the chain id,
CAIP-2 network, settlement asset, and native gas asset. The adapter submits
only on the chain selected for that process.

Arc Testnet is the first implementation and the default. Base Sepolia is a
second pinned testnet. Arc Mainnet is present and unpublished: it carries no
chain id, token, RPC, or explorer, and it cannot be selected.

The browser wallet, MCP `arc_payment` tools, team-report supplier, and Graph
recovery stay on Arc Testnet. Those paths refuse to run when the process is
configured for another chain. Direct settlement intents use the selected chain.

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
5. Keep supplier orders, user-wallet payments, and Graph recovery on Arc until
   those paths have their own chain-specific evidence. Direct intents accept
   the new network automatically.

`createChainRegistry` builds a registry from a list. Tests use it to try an
extra chain without changing the catalog the process loads.
