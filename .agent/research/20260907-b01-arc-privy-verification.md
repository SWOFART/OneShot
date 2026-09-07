# B01 primary-source verification: Arc network values and Privy policy reach

Date: 2026-09-07
Packet: `milestones/coder-b/B01-sdk-network-compatibility.md`
Purpose: satisfy B01.2 (pin Arc values only after checking official documentation)
and decide B01.3 (whether Privy policy can constrain a nested Arc Memo call).

## Sources

- Arc, "Connect to Arc", <https://docs.arc.io/arc/references/connect-to-arc> — accessed 2026-09-07.
- Arc, "Contract addresses", <https://docs.arc.io/arc/references/contract-addresses> — accessed 2026-09-07.
- Privy, "Policies & controls overview", <https://docs.privy.io/controls/policies/overview> — accessed 2026-09-07.

## 1. Arc Testnet values (B01.2)

| Value | Official source | Matches `milestones/CONTRACTS.md`? |
| --- | --- | --- |
| Chain ID `5042002` | Connect to Arc | Yes |
| CAIP-2 `eip155:5042002` | Derived from chain ID | Yes |
| USDC ERC-20 interface `0x3600000000000000000000000000000000000000` | Contract addresses | Yes |
| ERC-20 interface decimals `6` | Contract addresses | Yes |
| Block explorer `https://testnet.arcscan.app` | Connect to Arc | Not previously recorded |
| Primary RPC `https://rpc.testnet.arc.io` | Connect to Arc | Not previously recorded |

The frozen contract values are confirmed correct. Nothing had to change.

### Finding 1: native gas precision differs from settlement precision

Arc's native gas asset is also called USDC, but it uses **18 decimals**, while
the **USDC ERC-20 interface uses 6**. Same name, same chain, a factor of 10^12
apart.

This is the exact hazard B01.2 names when it requires settlement amounts to be
separated from native USDC gas accounting. A single `decimals` field on a
deployment profile would invite code to price a settlement in gas units and
overpay or underpay by twelve orders of magnitude.

Encoded as two distinct fields, `tokenDecimals` (6, settlement) and
`nativeDecimals` (18, gas). The readiness probe reports `MISMATCH` if a profile
ever declares them equal or declares native decimals as anything but 18.

### Finding 2: RPC endpoints are operator configuration, not constants

Arc publishes four testnet RPC endpoints (a primary plus Blockdaemon, dRPC, and
QuickNode). There is no single canonical endpoint to pin, which confirms the
decision to keep RPC and explorer URLs out of the profile table and in
validated configuration.

A first draft of `profiles.ts` had guessed `https://rpc.testnet.arc.network`.
The real host is `arc.io`, not `arc.network`, so the guess was wrong as well as
against policy. A test now asserts that no profile contains any `http(s)://`
string.

## 2. Privy policy reach and the Arc Memo path (B01.3)

### Arc Memo contract

Address `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`. It attaches memo metadata
to contract calls and emits `Memo` events carrying a sequential index.

Using it for settlement means the wallet calls the Memo contract, which forwards
the USDC transfer. The recipient and amount then live inside the forwarded inner
call rather than in the transaction the wallet signs directly.

### What a Privy policy can constrain

Privy policies are built from rules and conditions over these field sources:

- `ethereum_transaction` — `to`, `value`, `chain_id`.
- `ethereum_calldata` — the called function by name, and its decoded arguments
  as `function_name.param_name`, supplied with the contract's JSON ABI.
- `ethereum_typed_data_domain` / `ethereum_typed_data_message` — EIP-712 data.

This is sufficient to fully constrain a **direct** ERC-20 transfer: the policy
can pin the destination contract, the chain, a zero native value, the method,
and the decoded recipient and amount arguments.

### Verdict: `NOT SUPPORTED` for the nested Memo path

`ethereum_calldata` decodes the arguments of the function the wallet calls. For
a Memo-forwarded settlement, that is the Memo function; the USDC recipient and
amount sit inside an inner call that Privy's documented conditions do not
decode. Privy's documentation does not describe constraining a nested or
forwarded inner call.

B01.3 permits recording `SUPPORTED` only with deny fixtures proving every wrong
dimension is rejected. The recipient and amount dimensions cannot be denied
through documented policy conditions on the nested path, so the honest result is
`NOT SUPPORTED`.

**Consequence.** v1 settlement uses the **direct USDC ERC-20 transfer**, which
is fully policy-constrainable. The Memo path is not used for settlement. This
matches `plan.md` section 27, which already lists "Arc Memo correlation if Privy
cannot constrain the forwarded call" as the cuttable option, and
`milestones/CONTRACTS.md` section 2, which admits `memo_id` only when the Memo
path passes B01 policy validation. It has not passed, so `memo_id` stays unused.

Correlation for hashless recovery therefore relies on the tuple/window discovery
and Subgraph MCP path owned by Coder C, not on a memo identifier.

### Not ruled out, but out of B01 scope

A narrow purpose-built settlement contract with recipient and amount as
top-level arguments would be policy-constrainable and could carry a memo. That
is a new contract to write, audit, and deploy. It is recorded here as a
possibility, not adopted.

## 3. Residual verification gaps

- The Memo contract ABI is not published on the pages read. Not needed, since
  the Memo path is not adopted for settlement.
- Privy wallet and policy identifier formats are not documented on the page
  read. `packages/arc-adapter` validates a conservative shape only; B02 should
  replace it with the documented format.
- Arc Mainnet parameters remain unpublished. The mainnet profile stays empty.
