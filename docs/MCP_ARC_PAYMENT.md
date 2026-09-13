# OneShot MCP Arc payment

The first MCP release exposes one remote tool, `arc_payment`. It creates or
replays a durable OneShot Business Intent; the existing worker performs the
policy-bound Privy server-wallet transfer on Arc Testnet. The MCP endpoint does
not sign or submit transactions itself.

The web app renders the client setup and walkthrough at `/docs/mcp`.

## Deploy

Configure the API with one fixed request scope and payer. Personal bearer
tokens are generated from an authenticated Profile and stored as SHA-256
digests in PostgreSQL:

```dotenv
ONESHOT_WORKSPACE_ID=<demo-workspace>
ONESHOT_MCP_REQUEST_KEY=<one-stable-demo-request-key>
ONESHOT_MCP_PAYER_ADDRESS=0x<privy-server-wallet-address>
ONESHOT_MCP_WAIT_MS=2500
```

`ONESHOT_MCP_BEARER_TOKEN` is optional and exists only for a legacy
operator-controlled client. If used, store it in Google Secret Manager. MCP
bearers are accepted only on `/mcp`; Privy browser JWTs and
`SERVICE_BEARER_TOKEN` cannot call this endpoint. Settlement remains subject to the worker's
`ONESHOT_SETTLEMENT_CAP_ATOMIC` and the attached Privy policy.

The fixed `ONESHOT_MCP_REQUEST_KEY` is the one-intent demo quota. A call using
another key is denied. A repeated call using the configured key and identical
fields returns the original intent or settlement; changed payment fields return
a conflict.

## Connect

Install Node.js with npm (`npx` is bundled with npm), then install the agent
skill:

```sh
npx --yes skills@latest add https://github.com/SWOFART/OneShot/tree/develop --skill oneshot-arc-payment
```

Point any Streamable HTTP MCP client at:

```text
https://oneshot.kapustazh.dev/mcp
```

Sign in to OneShot, open **Profile**, and generate a bearer for that Privy
account. Send it as `Authorization: Bearer <token>`. A generic client entry is:

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

`tools/list` returns only `arc_payment`:

```json
{
  "request_key": "<ONESHOT_MCP_REQUEST_KEY>",
  "recipient": "0x<recipient>",
  "amount_usdc": "<approved amount>",
  "purpose": "One approved demo purchase"
}
```

`amount_usdc` is parsed as a decimal string with at most six decimal places;
JavaScript floating point is never used. The tool pins USDC and
`eip155:5042002`, reports the Privy server payer, and returns the authoritative
OneShot state. `AUTHORIZING`, `READY`, and `SUBMITTING` mean wait. `UNKNOWN`
means repeat the same call or inspect recovery evidence. Only `COMMITTED` with a
stored transaction hash returns an ArcScan proof link.

## Walkthrough

1. Connect and confirm `tools/list` contains only `arc_payment`.
2. Call it once with the configured key, recipient, amount, and purpose.
3. Show the returned Business Intent progressing to `COMMITTED`.
4. Repeat the exact call and show the same Business Intent and transaction.
5. Open the returned ArcScan link and compare recipient and atomic USDC amount.

This walkthrough uses live inputs and the durable worker path. It needs no
hardcoded transaction or mocked settlement.
