---
name: oneshot-arc-payment
description: >
  Pay a USDC recipient on Arc Testnet through the OneShot `arc_payment` MCP
  tool: connect an MCP client with the user's profile bearer token, create or
  replay one durable payment intent, read the authoritative settlement state,
  and verify the ArcScan proof. Use when the user asks to pay via OneShot, send
  USDC on Arc, run the arc_payment MCP tool, or delegate an agent payment task.
---

# OneShot arc_payment MCP skill

Pay once, safely, through OneShot. This skill is written for any agent
(primary or delegated) whose MCP client is already connected to the OneShot
MCP endpoint. It never handles keys: the payer is the user's connected Privy
embedded/external wallet or MetaMask wallet, and the bearer token lives only in
the MCP client config.

## Prerequisites (user-provided, never invented)

- MCP endpoint URL, e.g. `https://oneshot.kapustazh.dev/mcp` (Streamable HTTP).
- A bearer generated from the user's OneShot Profile — configured in the MCP client as
  `authorization: Bearer <token>`. It is a secret: never print, log, copy into
  task prompts, or commit it.

If either is missing, stop and ask the operator. Do not guess values.

## Tool contract: `arc_payment` then `arc_payment_submit`

Input (all fields required, strict):

- `request_key` — generate this yourself before the first call as
  `report-<purpose-slug>-<8 random hex>`. Never ask the user for it. Retain and
  reuse the exact value for every retry of that payment.
- `payer_wallet` — the connected EVM wallet address selected by the user in
  Privy or MetaMask. Never invent it or substitute a server wallet.
- `recipient` — `0x`-prefixed 40-hex EVM address on Arc Testnet.
- `amount_usdc` — canonical decimal string, up to 6 decimals, greater than
  zero (for example `1` or `0.25`; `1` USDC = `1000000` atomic units).
- `purpose` — short non-secret payment purpose (max 256 chars).

Output: `state` (`READY | SUBMITTING | COMMITTED | FAILED_SAFE | UNKNOWN |
REJECTED`), `replayed`, `payer.mode` (`USER_WALLET`), `amount_atomic`, and an
exact `transaction` object for the Arc USDC transfer. The agent must show that
transaction to the user or hand it to the connected wallet; this tool never
broadcasts it.

After the wallet returns a transaction hash, call `arc_payment_submit` with the
returned `business_intent_id` and that exact hash. OneShot binds the hash,
checks the receipt and exact USDC `Transfer` log, and returns the durable state.

## How to execute a payment

1. Generate the `request_key`, then call `arc_payment` once with that key, the
   exact payer wallet, recipient, amount, and purpose the user approved.
2. Ask the user to review the returned calldata and sign/broadcast it with
   Privy or MetaMask. Do not create a replacement transaction.
3. Call `arc_payment_submit` with the returned `business_intent_id` and the
   hash returned by the wallet.
4. If `state` is `COMMITTED`, report `settlement.transaction_hash` and its
   `explorer_url` (ArcScan). Done.
5. If `state` is `UNKNOWN`, repeat `arc_payment_submit` with the same hash.
   UNKNOWN is not failure: it never justifies a replacement payment or a new
   key.
6. If the tool returns the conflict error ("already belongs to a different
   payment"), the key was reused with changed fields. Stop and report the
   conflict; do not replace an uncertain payment.
7. If `state` is `FAILED_SAFE` or `REJECTED`, report it and stop. Do not retry
   with a different key or amount.

## Delegating (outsourcing) the payment to another agent

- Hand the delegate only the task arguments: endpoint URL, `payer_wallet`,
  `recipient`, `amount_usdc`, `purpose`, and this skill. The delegate generates
  and retains the request key.
- The delegate must use its own MCP client configuration; the bearer token
  must not travel through prompts, task payloads, logs, or screenshots.
- One request key funds exactly one intent. Each delegate generates one key per
  new approved payment and reuses it for retries; never mutate a key after the
  first call.
- The delegate reports back the authoritative `state` plus the ArcScan proof
  for `COMMITTED`, or the exact tool error. "It probably went through" is not
  a report.

## References

- Walkthrough: `docs/MCP_ARC_PAYMENT.md` in the OneShot repository.
- Human-readable page: `https://oneshot.kapustazh.dev/docs/mcp`.
- Install (requires Node.js/npm; `npx` ships with npm):
  `npx --yes skills@latest add https://github.com/SWOFART/OneShot/tree/develop --skill oneshot-arc-payment`.
