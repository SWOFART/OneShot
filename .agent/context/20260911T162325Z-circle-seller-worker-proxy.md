# Circle seller Worker proxy

## Goal

Make the public `/api/premium/*` route on the Cloudflare Worker reach the
separately deployed Circle x402 seller on Cloud Run and preserve its HTTP 402
payment challenge.

## Acceptance criteria

- The seller proxy uses a redirect mode supported by Cloudflare Workers without
  forwarding credentials to an uncontrolled redirect target.
- Existing API proxy behavior and seller credential stripping remain unchanged.
- The seller service is publicly reachable on Arc Testnet and returns HTTP 402
  with `PAYMENT-REQUIRED` for an unpaid dataset request.
- The same-domain Worker route returns the seller's HTTP 402 response rather
  than `SELLER_NOT_READY`.

## Assumptions

- The documented team-controlled Arc Testnet recipient
  `0xa605EE031E41f04f8e193059a39A24407f83677c` is the intended public seller
  address; no buyer private key or credential is used.
- Cloud Run project is `oneshot-508002`, region is `europe-west1`, and the
  existing Artifact Registry repository is `oneshot-repo`.

## Non-goals

- No buyer payment, Gateway withdrawal, or mainnet activation.
- No change to OneShot settlement/idempotency logic.
- No committed runtime secrets or wallet credentials.

## Plan

1. Change the seller proxy redirect mode from `error` to `manual`.
2. Run focused web checks and the full required local checks.
3. Capture Gate A, commit, push, and open a draft PR targeting `develop`.
4. Wait for required CI, run exact-head Gate B, then mark ready for human
   review.
5. Deploy the seller image to public Cloud Run and configure the Worker with
   its regional Cloud Run URL.

## Git and deployment state

- Base: `develop` at `46d4c87b5eaaa65295ce19a7148395f111602105`.
- Branch: `fix/circle-seller-worker-proxy`.
- Intended code change: seller proxy in `apps/web/worker.ts` and its focused
  regression assertion in `apps/web/test/worker-proxy.test.ts`, plus this
  context record.
- User-owned local files remain outside the candidate tree:
  `cloudbuild-worker.yaml`, `.gcloudignore`, and `cloudbuild-api.yaml`.
- Seller image build: Cloud Build `51f9e18e-330e-4539-b8c7-5dacd44d6ee0`,
  successful; image digest `sha256:afc4fcc59d9f510dcc2db947b96d9d65dc7c1e5544458ce75cfe0c9e8f0307d7`.
- Seller service: `oneshot-seller` in `europe-west1`, public URL
  `https://oneshot-seller-775560462825.europe-west1.run.app`.
- Worker was first deployed with the `.a.run.app` alias and returned 502; the
  regional URL is the verified origin. Final Worker version
  `575b97da-d1ef-44a0-8714-3ee6fc105ca3` returns the seller HTTP 402 challenge
  at `https://oneshot.kapustazh.dev/api/premium/dataset`.
- API revision `oneshot-api-00008-c6t` and Worker revision
  `oneshot-worker-00016-97p` now carry the non-secret x402 settings:
  `ONESHOT_X402_URL=https://oneshot.kapustazh.dev/api/premium/dataset` and
  `ONESHOT_X402_MAX_AMOUNT_ATOMIC=10000`.

## Checks and gates

- Focused remote edge probe: `redirect: 'error'` returned 502 before origin;
  `redirect: 'manual'` returned HTTP 402 and reached Cloud Run.
- Direct seller `/health/live` and `/health/ready`: HTTP 200.
- Direct seller `/api/premium/dataset`: HTTP 402 with Arc Testnet challenge.
- Gate A: pending for this candidate.
- Gate B: pending for the exact PR head.
