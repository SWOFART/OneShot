# Circle x402 seller deployment

This repository now includes a small seller service for Circle's Arc Testnet
nanopayment flow. It implements the official sample's four paid routes with
Circle's `createGatewayMiddleware`:

| Method | Route                     |     Price |
| ------ | ------------------------- | --------: |
| GET    | `/api/premium/quote`      |  `$0.001` |
| GET    | `/api/premium/dataset`    |   `$0.01` |
| POST   | `/api/premium/compute`    | `$0.0003` |
| GET    | `/api/premium/agent-task` |   `$0.03` |

The OneShot website points at the dataset route because its configured demo cap
is `10000` atomic USDC units (`$0.01`). The agent-task route remains available
for the official sample-compatible demonstration but is above that cap.

The seller is intentionally a separate service from the OneShot API. The seller
has no database, no OneShot settlement authority, and no chargeable business
side effects. OneShot remains responsible for the stable Business Intent,
submission claim, `UNKNOWN` handling, Arc verification, and at-most-once
settlement invariant.

## Configuration

The service requires only a public testnet receiving address:

```text
ONESHOT_X402_SELLER_ADDRESS=0x<40-hex-testnet-seller-address>
```

The optional settings are:

```text
ONESHOT_X402_FACILITATOR_URL=https://gateway-api-testnet.circle.com
ONESHOT_X402_SELLER_PORT=8081
```

The facilitator setting is restricted to Circle's Arc Testnet endpoint. The
service does not accept a seller private key. A private key is only needed for
separate operational actions such as withdrawing a seller Gateway balance; it
must never be placed in this repository or passed to the service.

## Local smoke test

Use an ignored local `.env` or process environment. Do not copy real wallet
credentials into committed files.

```powershell
$env:ONESHOT_X402_SELLER_ADDRESS = '0x<40-hex-testnet-seller-address>'
$env:ONESHOT_X402_SELLER_PORT = '8081'
pnpm build
pnpm --filter @oneshot/seller start
```

In a second terminal, an unpaid request must return `402`:

```powershell
curl.exe -i http://127.0.0.1:8081/api/premium/dataset
```

The response must contain `PAYMENT-REQUIRED`, Arc Testnet network identity
`eip155:5042002`, native USDC
`0x3600000000000000000000000000000000000000`, and amount `10000`. The local
URL cannot be used as `ONESHOT_X402_URL` by the production buyer adapter because
that adapter requires a credential-free public HTTPS resource.

## Google Cloud Run deployment

Build the seller image in the same Google Cloud project and region used by the
existing services:

```powershell
$project = (gcloud config get-value project).Trim()
$image = "europe-west1-docker.pkg.dev/$project/oneshot-repo/oneshot-seller:latest"
gcloud builds submit --config=cloudbuild-seller.yaml --substitutions="_IMAGE=$image" .
gcloud run deploy oneshot-seller `
  --image $image `
  --region europe-west1 `
  --port 8080 `
  --allow-unauthenticated `
  --set-env-vars "ONESHOT_X402_SELLER_ADDRESS=0x<40-hex-testnet-seller-address>"
$sellerUrl = (gcloud run services describe oneshot-seller --region europe-west1 --format='value(status.url)').Trim()
$sellerUrl
```

Unauthenticated access is required because the x402 `402 Payment Required`
challenge is the seller's public authentication boundary. The seller wallet
address is public configuration; keep all unrelated Cloud Run secrets in Secret
Manager.

## Cloudflare same-domain route

The Worker serves the SPA for ordinary paths, forwards `/v1/*` and `/health/*`
to the OneShot API, and forwards `/api/premium/*` to the seller when
`SELLER_BACKEND_URL` is set. Deploy the Worker with the Cloud Run URL:

```powershell
pnpm build:frontend
pnpm exec wrangler deploy --var "SELLER_BACKEND_URL:$sellerUrl"
```

If the seller service is deployed under a custom HTTPS hostname, use that URL
instead. The Worker removes `Authorization` and `Cookie` before forwarding to
the public seller while preserving `Payment-Signature`; it exposes the
`PAYMENT-REQUIRED` and `PAYMENT-RESPONSE` headers to browser callers.

The final buyer resource URL is:

```text
https://oneshot.kapustazh.dev/api/premium/dataset
```

## OneShot service configuration

Set the same URL and integer cap on the API and worker Cloud Run services, then
restart/redeploy them:

```text
ONESHOT_X402_URL=https://oneshot.kapustazh.dev/api/premium/dataset
ONESHOT_X402_MAX_AMOUNT_ATOMIC=10000
```

The API uses the URL for the non-chargeable live quote. The worker uses the
stored quote to submit exactly one Circle x402 request for a claimed Business
Intent. If the response is lost or ambiguous, the durable state remains
`UNKNOWN`; reconciliation must resolve it before any future payment action.

## Production verification

Run these checks before using the website:

```powershell
curl.exe -i "$sellerUrl/api/premium/dataset"
curl.exe -i https://oneshot.kapustazh.dev/api/premium/dataset
```

Both responses must be HTTP `402`, contain `PAYMENT-REQUIRED`, and advertise
exactly one affordable Arc Testnet Gateway option. The same-domain response
must not be the frontend HTML. After setting the API and worker environment,
click **Check live quote**, approve the stable task key once, and follow the
stored provider transaction to ArcScan. The activity and recovery views remain
candidate/evidence views; Arc receipt verification and the OneShot ledger remain
authoritative.

Official references:

- [Circle seller quickstart](https://developers.circle.com/gateway/nanopayments/quickstarts/seller)
- [Circle Arc nanopayments sample](https://github.com/circlefin/arc-nanopayments)
- [Circle Nanopayments overview](https://developers.circle.com/gateway/nanopayments)
