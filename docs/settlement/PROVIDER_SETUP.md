# Provider setup (human-run)

B03.1. Prepares a Privy application, execution wallet, policy, and Arc Testnet
funding so a real settlement can be captured as Gate P4 evidence.

**A human runs every step here.** Agents must not create accounts, enter
credentials, mutate policy, or move funds. An agent may run the read-only
verification in section 7 and report results.

Testnet only. Nothing in this guide applies to mainnet, and Arc mainnet
parameters are unpublished. See `docs/settlement/SETTLEMENT_CONFIG_V1.md`.

## 1. Before you start

You need a Privy account, a terminal, and somewhere to store secrets that is
not this repository. Budget about 30 minutes.

At no point paste a secret into a chat, an issue, a PR, a fixture, a log, or a
review prompt. `.agent/SECURITY_INVARIANTS.md` treats that as a breach, and a
committed secret must be rotated, not deleted.

## 2. Privy application

1. Create a Privy application for OneShot.
2. Record the **app ID**. It is a public identifier, safe to log.
3. Create an **app secret**. This is the one true credential in the system.
   Put it straight into your secret store; do not write it to a file first.

## 3. Execution wallet

1. Create a server wallet. This is the only wallet that will sign settlement.
2. Record the **wallet ID** and the **wallet address**.
3. Configure the owner or key quorum according to your organisation's rules. A
   single-owner wallet is acceptable for a testnet demo and is not acceptable
   for anything holding real value.

## 4. Recipient and cap

Two human decisions, both deliberate:

- **Recipient allowlist.** The addresses settlement may pay. Keep it as short
  as the demo allows. An empty list settles nothing, which is the safe default.
- **Per-settlement cap.** The maximum atomic units for one settlement, in
  six-decimal USDC atomic units. `1000000` is one USDC.

These are the two values that bound the blast radius if everything else fails.

## 5. Policy

Attach a policy to the execution wallet constraining all six dimensions:

| Dimension | Constraint |
| --- | --- |
| Chain | equals `5042002` |
| Destination contract | equals the USDC interface `0x3600000000000000000000000000000000000000` |
| Native value | equals `0` |
| Method | `transfer` |
| Recipient | in your allowlist |
| Amount | at or below your cap |

The policy must end with a **default deny**. Without it, anything the rules do
not mention is permitted.

`buildExpectedPolicy` in `@oneshot/privy-adapter` produces this shape, and
`policyDigest` produces a fingerprint you can compare against later to detect
drift. Record the **policy ID** and the digest.

## 6. Funding

1. Fund the execution wallet from the Circle faucet at
   <https://faucet.circle.com> for Arc Testnet.
2. Fund only what the demo needs.
3. Confirm the balance on the explorer at <https://testnet.arcscan.app>.

Arc's native gas asset uses 18 decimals while the USDC ERC-20 interface uses 6.
They are both called USDC. Read balances carefully.

## 7. Verification (read-only, safe to automate)

Set the variables from `packages/arc-adapter/.env.example` in your shell or
secret store, then run the readiness probe. It performs no mutation and prints
no credential:

```bash
cd packages/arc-adapter
npm run check
```

A `MISMATCH` result means a value is wrong and a human must fix it. It must
never be retried into working. An `UNAVAILABLE` result means the endpoint could
not be reached and may resolve on its own.

## 8. Storing the values

| Value | Classification | Where it goes |
| --- | --- | --- |
| App ID | public | configuration |
| App secret | **secret** | secret store only |
| Wallet ID | public | configuration |
| Wallet address | public | configuration and evidence |
| Policy ID | public | configuration |
| Recipient allowlist | human-only | configuration |
| Cap | human-only | configuration |

Never commit a real value. `packages/arc-adapter/.env.example` holds
placeholders only and is generated from the config schema.

## 9. Cleanup and rotation

When the demo is finished:

1. Return or drain remaining testnet funds.
2. Rotate the app secret, and rotate immediately if it was ever pasted anywhere
   outside the secret store.
3. Narrow or empty the recipient allowlist.
4. Keep the wallet and policy if you need the evidence trail; disable the
   policy's allow rule to make the wallet inert.

Rotation is the response to a suspected leak. Deleting the message that
contained it is not.
