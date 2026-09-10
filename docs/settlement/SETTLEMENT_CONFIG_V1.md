# settlement-config-v1

B01 handoff artifact for the Coder B lane. Consumers: Coder A composition,
Coder C reconciliation, and human operators performing provider setup.

Implemented by `packages/arc-adapter` and `packages/privy-adapter`. Both install,
lint, typecheck, test, and build independently with no root workspace
composition and no credential.

## 1. Arc deployment profiles

Verified 2026-09-07 against official Arc documentation. Evidence and source URLs
are in `.agent/research/20260907-b01-arc-privy-verification.md`.

| Field                        | Arc Testnet                                  | Arc Mainnet   |
| ---------------------------- | -------------------------------------------- | ------------- |
| `id`                         | `arc-testnet`                                | `arc-mainnet` |
| `verification`               | `PINNED`                                     | `UNPUBLISHED` |
| `enabled`                    | `true`                                       | `false`       |
| `chainId`                    | `5042002`                                    | absent        |
| `caip2`                      | `eip155:5042002`                             | absent        |
| `tokenContract`              | `0x3600000000000000000000000000000000000000` | absent        |
| `tokenDecimals` (settlement) | `6`                                          | absent        |
| `nativeDecimals` (gas)       | `18`                                         | absent        |

### Two precisions, one name

Arc's native gas asset and its USDC ERC-20 interface are both called USDC and
use **different precision**: 18 decimals for gas, 6 for the ERC-20 interface.
They are 10^12 apart.

Settlement amounts are always atomic units of `tokenDecimals`. Gas accounting
uses `nativeDecimals`. The readiness probe reports `MISMATCH` if a profile
declares them equal, or declares native decimals as anything but 18.

### Why the mainnet profile is empty

Arc has not published mainnet network parameters. The profile carries no chain
ID, RPC, explorer, or token value, because a plausible-looking default is more
dangerous than an absent one. Enabling a mainnet profile requires three
independent conditions: pinned verified values, an enabled flag, and
`ONESHOT_ALLOW_MAINNET_ACTIVATION=true` set by a human. Authorization alone is
refused.

### Why profiles carry no RPC or explorer URL

Arc publishes four testnet RPC endpoints, so there is no single canonical value
to pin. Endpoints are operator configuration, validated at load and re-verified
against the profile chain ID by the readiness probe.

## 2. Configuration variables

Classification: `public` safe to log; `secret` never logged, committed, or sent
to a reviewer; `optional` public with a documented default; `human-only` a human
must supply and approve it.

| Variable                           | Class      | Required       | Notes                                  |
| ---------------------------------- | ---------- | -------------- | -------------------------------------- |
| `ONESHOT_ARC_PROFILE`              | public     | yes            | Unknown id is refused, never defaulted |
| `ONESHOT_ARC_RPC_URL`              | public     | yes            | https, or http on loopback only        |
| `ONESHOT_ARC_EXPLORER_URL`         | optional   | no             | Operator evidence links                |
| `ONESHOT_PRIVY_APP_ID`             | public     | yes            | Not a credential                       |
| `ONESHOT_PRIVY_APP_SECRET`         | secret     | yes at runtime | Read by no code in these packages      |
| `ONESHOT_PRIVY_WALLET_ID`          | public     | yes            | Execution wallet                       |
| `ONESHOT_PRIVY_POLICY_ID`          | public     | yes            | Must be attached to the wallet         |
| `ONESHOT_RECIPIENT_ALLOWLIST`      | human-only | yes            | Empty list settles nothing             |
| `ONESHOT_SETTLEMENT_CAP_ATOMIC`    | human-only | yes            | Atomic units, compared as `bigint`     |
| `ONESHOT_RPC_TIMEOUT_MS`           | optional   | no             | Default 10000, max 120000              |
| `ONESHOT_ALLOW_MAINNET_ACTIVATION` | human-only | no             | Default false                          |

`packages/arc-adapter/.env.example` is generated from this schema and contains
placeholders only.

## 3. Readiness probe

`probeReadiness(config, probe)` returns `{ ready, hasMismatch, checks }` and is
ready only when every check passes. There is no partial-ready state.

| Check | Asserts |
| --- | --- |
| `profile.consistency` | CAIP-2 matches chain ID; settlement precision is 6; gas precision is 18 and differs from settlement |
| `privy.identityFormat` | Wallet and policy identifier shape, printing neither value |
| `rpc.chainId` | Live `eth_chainId` equals the profile chain ID |
| `token.bytecode` | The configured USDC address holds contract bytecode |
| `token.decimals` | Live `decimals()` equals the profile's six-decimal ERC-20 settlement precision |

### `UNAVAILABLE` versus `MISMATCH`

- `UNAVAILABLE` — the answer could not be learned. Configuration may be fine.
  Retrying later is reasonable.
- `MISMATCH` — the answer was learned and is wrong. A human must fix it. It
  must never be retried into working.

Both block readiness. Only `MISMATCH` is permanent. The probe runs against the
`RpcProbe` interface, so it works fully offline with no credential. The live
probe also reads the token's `decimals()` view method; it never signs or sends.

## 4. Selected settlement path

The B01.3 spike result: **direct USDC ERC-20 `transfer(address,uint256)`**.

The Arc Memo path (`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`) is recorded
`NOT_SUPPORTED` for settlement. Privy policy conditions decode the arguments of
the function the wallet calls; on the Memo path that is the Memo function, so
the forwarded transfer's recipient and amount cannot be constrained or denied.
B01.3 permits `SUPPORTED` only with deny fixtures for every wrong dimension, and
two dimensions have none available.

Consequence: `memo_id` in `milestones/CONTRACTS.md` section 2 stays unused.
Hashless correlation relies on the tuple/window and provider-neutral Graph discovery owned
by Coder C.

### Constrained dimensions

`evaluateScope` refuses anything outside the expected scope, with an independent
deny reason per dimension: `WRONG_CHAIN`, `WRONG_DESTINATION_CONTRACT`,
`NON_ZERO_NATIVE_VALUE`, `WRONG_METHOD`, `WRONG_RECIPIENT`, `WRONG_AMOUNT`,
`MALFORMED_CALLDATA`.

This duplicates the remote Privy policy on purpose. A policy lives in Privy
configuration and can drift, and the local check can only refuse, never grant.

## 5. Pinned dependencies and rationale

| Dependency | Version     | Rationale                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------- |
| Node       | `>=22.12.0` | Vitest 5 requires `^22.12.0 \|\| ^24 \|\| >=26`; local runtime is 22.16.0 |
| TypeScript | `5.9.3`     | See rejection below                                                       |
| viem       | `2.56.3`    | Typed ABI encoding and address handling; peer `typescript >=5.0.4`        |
| Vitest     | `5.0.0`     | Test runner; peer `@types/node ^22 \|\| >=24`                             |
| ESLint     | `9.39.1`    | With `typescript-eslint` `8.69.0` `strictTypeChecked`                     |

### Rejected: TypeScript 7.0.2

TypeScript `7.0.2` is published, but `typescript-eslint` constrains `typescript`
to `>=4.8.4 <6.1.0` at every published version including the latest `8.69.0`.
Adopting TS 7 would mean dropping type-aware linting on the packages that
validate chain identity and money. Rejected; pinned `5.9.3`.

### Upgrade risks

- `eslint@9.39.1` already reports as outside its supported version window and
  needs a scheduled bump.
- TypeScript 7 becomes adoptable only once `typescript-eslint` widens its peer
  range. Re-evaluate then.
- Versions are pinned exact, so upgrades are deliberate rather than incidental.

## 6. Package-local commands

```bash
cd packages/arc-adapter    # or packages/privy-adapter
npm install
npm run lint
npm run typecheck
npm run test
npm run build
npm run check              # all of the above in order
```

## 7. Known gaps for B02

- Privy wallet and policy identifier formats are not documented on the pages
  read. `IDENTIFIER_SHAPE` is a conservative guess and should be replaced with
  the documented format.
- No Privy SDK call is made yet. B01 models the policy; B02 exercises it.
- The Arc Memo ABI was not published on the pages read. Not needed while the
  Memo path stays unadopted.
