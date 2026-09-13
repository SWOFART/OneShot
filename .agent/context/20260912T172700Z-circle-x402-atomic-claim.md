# Circle x402 atomic claim and user-funded payment repair

## Goal

Repair the Circle x402 paid-API failure where a request reached authorization
but closed as `FAILED_SAFE` with the sanitized reason that provider request
identity could not be persisted before submission. Implement the intended MVP
model where the connected Privy wallet authorizes the Circle payment to the
deployed API seller and OneShot forwards the signed authorization exactly once.
Also fix the activity refresh client request that sent an empty JSON body and
was rejected by Fastify with HTTP 400.

## Scope and assumptions

- Existing server-paid Circle x402 remains available for compatibility, but the
  website's connected-wallet path uses explicit `USER_WALLET` mode for the
  Circle Dataset API.
- The user wallet is durably bound to the task key, quote, seller, amount,
  token, and Arc Testnet before signing.
- The current failure occurred before the external supplier/payment boundary;
  no retry or payment action is performed on the existing terminal intent.
- The worker must persist provider identity atomically with submission
  ownership. A database failure must leave the outbox delivery retryable and
  must not call Circle.
- The API forwards only the browser's already-signed x402 payload and never
  signs or substitutes a server wallet for a user-funded intent.
- Circle Gateway batching requires the payer's Gateway testnet balance; the UI
  documents this prerequisite and never deposits or transfers funds silently.

## Non-goals

- Do not retry any existing failed or UNKNOWN request, approve another payment,
  or expose credentials.
- Do not change settlement verification, reconciliation authority, or the
  existing Team Report user-wallet rail.

## Changes

- `IntentLedger.claimSubmission` accepts an optional provider identity and
  inserts its replay fields in the same transaction as `READY -> SUBMITTING`.
- The worker derives identity before claiming and no longer performs a separate
  post-claim identity update.
- Confirmed results carry an explicit exact-Arc-verification marker; the ledger
  records authoritative ARC evidence only for that marker, so paid API proof
  can render verified without trusting generic simulator confirmations.
- The Circle service copy states that its payer is the OneShot server-side
  Privy execution wallet for the legacy server-paid path, while the connected
  Circle Dataset UI explicitly prepares, signs, and submits from the user's
  wallet.
- Added `paid_api_requests.payment_mode` and `payer_wallet` with a frozen
  migration digest, user-wallet prepare/submit API routes, strict Circle
  Gateway payload validation, signerless forwarding, exact Arc receipt
  verification, and a worker guard against accidental server-wallet routing.
- Removed `content-type: application/json` from bodyless activity refresh calls;
  bodyful requests still send JSON.
- Added a dedicated paid-API user-wallet reconciliation route that only checks
  the durably recorded transfer/hash and can never forward a new payment.
- API, adapter, browser component, worker, and migration-gated regression tests
  cover user-wallet binding, forward-only behavior, and refresh behavior.

## Selected test-matrix cases

- Crash/failure before submission: zero provider calls and safe retryable claim
  boundary.
- Service restart / durable identity: identity exists on the owned attempt
  before external submission.
- Exact receipt proof: a marked confirmed settlement records both ONESHOT and
  ARC authoritative observations; an unmarked confirmation remains OneShot-only.
- Existing at-most-once behavior: the claim CAS and post-submission UNKNOWN
  paths remain unchanged.
- User-funded Circle payment: the same signed payload and durable intent are
  reused for status checks; a new signature or different payer is never
  silently substituted.

## Validation evidence

- `pnpm.cmd build`: passed, including TypeScript and generated subgraph build.
- `pnpm.cmd --filter @oneshot/worker test`: 52 passed.
- `pnpm.cmd --filter @oneshot/storage-postgres test`: 13 passed.
- `pnpm.cmd --filter @oneshot/supplier-adapter test`: 20 passed.
- `pnpm.cmd --filter @oneshot/api test`: 71 passed.
- `pnpm.cmd --filter @oneshot/web test`: 81 passed.
- `pnpm.cmd test`: 82 files / 1081 tests passed.
- `pnpm.cmd typecheck`: passed.
- `pnpm.cmd lint`: passed.
- `pnpm.cmd format:check`: passed.
- `pnpm.cmd check:generated`: passed.
- Recorded base: `origin/develop` at `8f07bba648d9d270b3f3a2a99a5064237ffd8bd2`.
- Candidate is being prepared on `fix/circle-x402-persistence`; recompute
  `git write-tree` after the final staging and bind Gate A to that resulting
  tree.
- PostgreSQL integration remains gated by `TEST_POSTGRES=1` and requires a
  container runtime; the new integration assertion is included but not run
  locally in this environment.
- No Google Cloud deployment was performed during this implementation; the
  currently live API and worker revisions therefore do not contain these
  changes yet.
- Read-only Cloud Run verification on 2026-09-12 showed API revision
  `oneshot-api-00021-cdd` at 100% traffic and worker revision
  `oneshot-worker-00033-7lj` at 100% traffic. API request logs still show HTTP
  400 for `POST /v1/activity/refresh`; the frontend bodyless-request fix is
  therefore not live until the web asset deployment is updated.

## Provider/reference findings

- The installed Circle batching SDK signs `TransferWithAuthorization` payloads
  with `validAfter = now - 600` and a validity window of at least 604900
  seconds; the server validator mirrors that bounded window.
- Circle Gateway batching is a gasless buyer rail backed by a payer Gateway
  balance; the website must not present it as a plain direct ERC-20 transfer.
