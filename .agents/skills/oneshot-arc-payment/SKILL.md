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

Pay once, safely, through OneShot. The canonical Streamable HTTP MCP endpoint
is `https://oneshot.kapustazh.dev/mcp`; use it by default unless the user
explicitly supplies an authorized alternative. The bearer is configured in the
MCP client's secret headers and is never handled by this skill.

The payment is non-custodial: the payer is the user's connected Privy
embedded/external wallet or MetaMask wallet. OneShot prepares the exact
transaction and verifies the returned hash; it never signs or broadcasts a
user-wallet payment.

## Connection and wallet prerequisites

- Configure the MCP client with the canonical endpoint above and the bearer
  generated from the user's OneShot Profile:
  `authorization: Bearer <token>`. The bearer is a secret: never print, log,
  copy into task prompts, or commit it.
- Installing this skill does not register an MCP server or create a bearer.
  If the current agent host has no OneShot MCP connection, tell the operator to
  add the canonical endpoint using the configuration in `docs/MCP_ARC_PAYMENT.md`
  or `/docs/mcp`. Never ask the operator to paste the bearer into the task
  prompt.
- Before calling `arc_payment`, resolve the active payer address. If the agent
  host exposes a connected wallet/account tool, query it and use the active
  Ethereum wallet selected by the user. If the host has no wallet context, ask
  the user to connect/select the wallet or provide its public EVM address once.
  A payer address cannot be derived safely from the bearer, recipient, server
  wallet, or an unrelated historical payment; never guess one.

The current OneShot `arc_payment` schema requires `payer_wallet` because the
intent and exact transaction are bound to the user's selected wallet before
signing. The address is public, but the bearer is not.

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
REJECTED`), `replayed`, `payer.mode` (`USER_WALLET`), `amount_atomic`, an
exact `transaction` object for the Arc USDC transfer, and a `signing_url`. Give
the user the signing URL: it opens the authenticated OneShot wallet handoff,
which loads the prepared payment and asks the user to review and sign it. The
tool never broadcasts a transaction.

After the wallet returns a transaction hash, call `arc_payment_submit` with the
returned `business_intent_id` and that exact hash. OneShot binds the hash,
checks the receipt and exact USDC `Transfer` log, and returns the durable state.

## How to execute a payment

1. Resolve the active wallet address as described above. Generate the
   `request_key`, then call `arc_payment` once with that key, the exact payer
   wallet, recipient, amount, and purpose the user approved.
2. Give the user the returned `signing_url`. The user must be signed into the
   matching OneShot workspace, review the recipient and amount, and click the
   wallet confirmation. Do not create a replacement transaction.
3. The wallet handoff records the hash through the normal user-wallet API. If
   the agent receives the hash separately, call `arc_payment_submit` with the
   returned `business_intent_id` and that exact hash.
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

- Hand the delegate only the task arguments: the canonical endpoint (unless it
  is already configured), the resolved `payer_wallet` when the delegate has no
  wallet connector, `recipient`, `amount_usdc`, `purpose`, and this skill. The
  delegate generates and retains the request key.
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
