# OneShot MCP Arc user-wallet payment

The active MCP flow is non-custodial:

1. `arc_payment` creates or replays a payer-bound OneShot job and returns the
   exact Arc Testnet USDC ERC-20 transaction request.
2. The MCP result includes a one-time-style signing URL. The user opens it in
   the authenticated OneShot workspace, reviews the exact request, and signs
   with the connected Privy embedded or external wallet, or with MetaMask.
3. The wallet broadcasts the USDC transfer directly to the recipient.
4. `arc_payment_submit` receives the returned transaction hash.
5. OneShot binds that hash, verifies the receipt and exact USDC `Transfer` log,
   and returns the durable state and proof.

The MCP bearer authenticates the workspace/agent. It does not authorize a
server payer and it cannot sign or broadcast a user transaction.

## Deploy

Configure the API with a workspace and the credential-free Arc RPC used for
receipt verification:

```dotenv
ONESHOT_WORKSPACE_ID=<workspace>
ONESHOT_ARC_RPC_URL=https://<arc-testnet-rpc>
```

Personal bearer tokens are generated from an authenticated Profile and stored
as SHA-256 digests in PostgreSQL. `ONESHOT_MCP_BEARER_TOKEN` remains optional
for a legacy operator-controlled client.

```dotenv
ONESHOT_MCP_BEARER_TOKEN=<at-least-32-characters>
```

```text
НЕ УДАЛЯТЬ: ONESHOT_MCP_PAYER_ADDRESS and ONESHOT_MCP_WAIT_MS are retained
only for the disabled corporate autonomous-agent server-wallet mode. The
active personal MCP handler ignores them and never uses a server wallet.
```

## Connect

Install the agent skill:

```sh
npx --yes skills@latest add https://github.com/SWOFART/OneShot/tree/develop --skill oneshot-arc-payment
```

Point a Streamable HTTP MCP client at:

```text
https://oneshot.kapustazh.dev/mcp
```

This is the canonical OneShot MCP endpoint and is the default for the payment
skill; installing the skill alone does not register this server in an agent
host. Use the ready-made configuration from Profile or the JSON below.

Send the bearer as `Authorization: Bearer <token>`:

```json
{
  "mcpServers": {
    "oneshot": {
      "type": "http",
      "url": "https://oneshot.kapustazh.dev/mcp",
      "headers": {
        "Authorization": "Bearer <ONESHOT_MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

`tools/list` exposes `arc_payment` and `arc_payment_submit`.

## Prepare and submit

Prepare a payment with the wallet address selected by the user. If the agent
host has a wallet/account connector, it should read the active Ethereum wallet
from that connector. Otherwise the user provides only the public wallet address
once; the bearer token does not identify a wallet and must not be pasted into a
prompt.

```json
{
  "request_key": "report-one-approved-demo-purchase-850d9a80",
  "payer_wallet": "0x<connected-wallet>",
  "recipient": "0x<recipient>",
  "amount_usdc": "1",
  "purpose": "One approved demo purchase"
}
```

The result contains `transaction.to` equal to the Arc USDC contract,
`transaction.data` containing `transfer(recipient, amount_atomic)`,
`transaction.from` equal to `payer_wallet`, and `value: "0x0"`.
It also contains `signing_url`, which opens the authenticated wallet handoff.
The client should give that URL to the user. The frontend validates the
prepared job and uses the wallet's normal signing API. The MCP tool must not
be treated as a signing API.

Then submit the exact hash returned by the wallet:

```json
{
  "business_intent_id": "intent_<value-from-prepare>",
  "transaction_hash": "0x<hash-returned-by-wallet>"
}
```

`COMMITTED` with a stored transaction hash and ArcScan URL is final proof.
`UNKNOWN` means the same hash should be submitted again after the receipt is
available. A different hash is rejected, so the flow preserves one intent,
one bound transaction hash, and at most one committed settlement.
