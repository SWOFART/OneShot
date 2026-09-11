# Circle x402 API demo

The workspace Tools page now contains the live paid-API path. Configure
`ONESHOT_X402_URL` and `ONESHOT_X402_MAX_AMOUNT_ATOMIC` in both the API and
worker environments, then use the site to request a quote and approve the
stable task key. The approval creates one durable Business Intent; the worker
submits Circle Gateway x402 only after the existing authorization and
submission claims.

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

The x402 request is signed by the configured Privy wallet through its EIP-712
signing API. No private key is accepted or exported. The wallet must already
have a Circle Gateway testnet balance; the one-time deposit is an operational
setup step and is not repeated by the demo script.

## Run

Build the workspace, then run the script with a deployment secret store or an
ignored local `.env` file:

```powershell
$env:ONESHOT_X402_URL = 'https://<circle-sample-host>/api/premium/dataset'
$env:ONESHOT_X402_BUSINESS_INTENT_ID = 'x402-demo-2026-09-11'
$env:ONESHOT_X402_GATEWAY_FUNDED = 'true'
$env:ONESHOT_X402_MAX_AMOUNT_ATOMIC = '10000'
pnpm demo:x402
```

The endpoint must return one affordable Circle Gateway option for Arc Testnet
(`eip155:5042002`) using the native USDC contract
`0x3600000000000000000000000000000000000000`. The default limit is `10000`
atomic units (`0.01 USDC`).

The script performs one paid HTTP request. If the response is lost, malformed,
or lacks a confirmed `PAYMENT-RESPONSE` transaction hash, the result is treated
as `UNKNOWN` and the process exits without retrying. The in-process guard
collapses duplicate calls for one Business Intent; the production job adapter
must persist the claim and evidence in OneShot's PostgreSQL ledger before using
this rail across restarts or workers.

This runbook does not claim that the x402 request is the direct Arc settlement
path. Circle Gateway batches the signed authorization, while the direct Arc
transfer demo remains the canonical OneShot settlement proof.

Official references:

- [Circle x402 buyer](https://developers.circle.com/gateway/nanopayments/howtos/x402-buyer)
- [Circle x402 seller](https://developers.circle.com/gateway/nanopayments/quickstarts/seller)
- [Circle Arc nanopayments sample](https://github.com/circlefin/arc-nanopayments)
