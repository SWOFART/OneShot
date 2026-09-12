# Circle x402 API demo

The workspace Tools page now contains the live user-funded paid-API path. First
deploy the seller described in [`CIRCLE_X402_SELLER.md`](CIRCLE_X402_SELLER.md),
then configure `ONESHOT_X402_URL` and `ONESHOT_X402_MAX_AMOUNT_ATOMIC` in the
API environment. Use the site to request a quote and approve the stable task
key. The connected Privy Ethereum wallet signs the exact Circle Gateway
authorization for the reviewed quote; OneShot forwards that authorization to
the seller and verifies the resulting Arc settlement. The API never signs a
user-funded request with the server wallet.

The existing worker buyer adapter remains available for the operator fallback
and for compatibility with server-paid requests. It is not used for a
`USER_WALLET` paid-API intent, and a defensive worker guard refuses to route one
there even if a stray outbox row exists.

To include the paid transfer in the website's Graph activity panel, point the
API's `ONESHOT_ACTIVITY_WALLET_ADDRESS` at Circle's Arc Testnet Gateway wallet
(`0x0077777d7EBA4688BDeF3E311b846F25870A19B9`). Worker recovery uses that same
Gateway identity automatically for x402 candidates.

This is the second, deliberately separate demo mode:

- **Arc settlement demonstration** — the cabinet's team-operated transfer uses
  OneShot's normal Privy policy and direct Arc Testnet USDC settlement.
- **Paid API purchase via Circle x402** — the website is the primary demo path;
  `scripts/demo-circle-x402.mjs` remains an operator fallback that pays
  one Circle Arc nanopayments sample endpoint through Circle Gateway.

The website x402 request is signed by the connected Privy wallet through its
EIP-712 signing API. No private key is accepted or exported. The paying wallet
must already have the required Circle Gateway testnet balance; the one-time
deposit is an operational setup step and is not repeated by the website. The
operator fallback signs with the configured server-side Privy wallet and has
the same Gateway-balance prerequisite.

## Run

Build the workspace, then run the script with a deployment secret store or an
ignored local `.env` file:

```powershell
$env:ONESHOT_X402_URL = 'https://oneshot.kapustazh.dev/api/premium/dataset'
$env:ONESHOT_X402_BUSINESS_INTENT_ID = 'x402-demo-2026-09-11'
$env:ONESHOT_X402_GATEWAY_FUNDED = 'true'
$env:ONESHOT_X402_MAX_AMOUNT_ATOMIC = '10000'
pnpm demo:x402
```

The endpoint must return one affordable Circle Gateway option for Arc Testnet
(`eip155:5042002`) using the native USDC contract
`0x3600000000000000000000000000000000000000`. The default limit is `10000`
atomic units (`0.01 USDC`).

Before running the browser flow, verify that both the direct Cloud Run seller
URL and the same-domain URL return HTTP `402` with a `PAYMENT-REQUIRED` header.
An HTML `200` response means the Cloudflare Worker is serving the SPA instead of
the seller proxy; a `503 SELLER_NOT_READY` response means
`SELLER_BACKEND_URL` has not been configured on the Worker.

The paid request has one durable Business Intent. Circle's `PAYMENT-RESPONSE`
may carry a transfer UUID instead of an Arc transaction hash. OneShot persists
that identity and the paid response, then reads Circle's transfer status and
transaction hash and verifies the Arc Gateway `submitBatch` calldata plus its
`BatchProcessed` event. A lost or malformed response remains `UNKNOWN` and the
same request can only be checked again; it cannot silently sign or forward a
replacement payment. The durable claim and evidence apply across restarts and
workers.

This runbook does not claim that the x402 request is a direct ERC-20 transfer.
Circle Gateway batches the signed authorization, so a Graph token-transfer
candidate is discovery-only and may be absent. The Circle transfer record plus
the authoritative Arc Gateway batch receipt are the proof for this mode; the
direct Arc transfer demo remains the simpler canonical settlement proof.

Official references:

- [Circle x402 buyer](https://developers.circle.com/gateway/nanopayments/howtos/x402-buyer)
- [Circle x402 seller](https://developers.circle.com/gateway/nanopayments/quickstarts/seller)
- [Circle Arc nanopayments sample](https://github.com/circlefin/arc-nanopayments)
