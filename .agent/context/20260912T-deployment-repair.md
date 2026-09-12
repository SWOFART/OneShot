# Deployment repair handoff — 2026-09-12

## Goal

Repair the OneShot deployment and Privy submission boundary without creating
another payment; restore database/auth/config health; preserve and reconcile
ambiguous durable requests safely.

## Evidence

- Project `oneshot-508002`, region `europe-west1`.
- Worker `oneshot-worker-00033-7lj` is Ready with 100% traffic.
- API `oneshot-api-00014-4cv` is Ready.
- Worker revision `00025-5j7` logged PostgreSQL password authentication failure
  for user `postgres` during `migrate()` and then failed its startup probe.
- Current API and worker use the same Cloud SQL connection, `DB_USER`,
  `DB_NAME`, and `ONESHOT_DB_PASS/latest` reference; secret values were not
  printed or persisted.
- Revisions `00029-ddf` and `00028-4lq` have no settlement configuration
  changes; only demo flags differ.
- The supplied `/v1/jobs` request returned HTTP 500; no new request was sent
  during this session.

## Deployment result

- The active account received the required Cloud Build and Cloud Storage
  permissions.
- Cloud Build `1e7c61ed-3b75-4aa3-8c13-5239553b683d` succeeded.
- The worker image was pushed as digest
  `sha256:cd3782fb9d2f41b8a53b50e60c1fe1e6a300d2b3da754050416fa69fb780e280`.
- Cloud Run deployed revision `oneshot-worker-00033-7lj` with 100% traffic,
  preserving the service's existing environment, secret references, and Cloud
  SQL attachment.
- The revision is Ready; its startup TCP probe passed and the worker health
  server reported listening on port 8080.

## Repair evidence

- Permissions propagated. Cloud SQL `oneshot-postgres` is RUNNABLE and has the
  built-in `postgres` user.
- Cloud SQL `postgres` password was synchronized to the trimmed runtime value
  of `ONESHOT_DB_PASS`; the secret value was never printed or persisted.
- Worker revisions `00030` and `00031` failed first on the database password,
  then on the Privy baseline gate. The live Privy identity showed only
  `policyDigest` drift, but the live policy was unsafe: it allowed three
  unrelated methods and lacked recipient/amount constraints.
- Privy policy was repaired to two constrained direct-transfer ALLOW rules
  (`eth_sendTransaction`, `eth_signTransaction`) plus wildcard DENY. It pins
  Arc Testnet chain/token, zero native value, transfer function, the documented
  team recipient, and the 1,000,000-atomic-unit cap.
- Worker revision `oneshot-worker-00032-kqk` and API revision
  `oneshot-api-00014-4cv` are Ready with 100% traffic. `/health/ready` returned
  HTTP 200 and neither current revision has recent ERROR logs.
- New test task `report-matvii-3c171c4b` reached `AUTHORIZING` and then
  `UNKNOWN` with `MALFORMED_RESPONSE`, without a durable transaction hash or
  provider reference. Privy read-only wallet history showed zero USDC
  transactions for the wallet; no matching recent Arc Transfer log was found.
- The live Privy wallet and policy are reachable. The policy has two
  constrained ALLOW rules (`eth_sendTransaction`, `eth_signTransaction`) plus
  wildcard DENY, and the worker startup identity gate passes.
- The staged code fix is deployed: nested Privy REST response envelopes are
  normalized, and nested Privy HTTP status fields are classified as
  pre-broadcast rejection only for explicit 4xx statuses. All
  unrecognized/ambiguous responses remain `UNKNOWN` fail-closed.
- Local implementation gates pass: focused Arc adapter 199/199 tests,
  Privy adapter 131/131 tests, worker 49/49 tests, typechecks, full build,
  lint, and formatting.
- Deployment completed without submitting or approving a payment.
- Gate A review was attempted with a fresh `free-pi-cli` process, but it did
  not return an explicit structured verdict and was terminated; no PASS is
  claimed.
- The authoritative job list does not contain
  `report-teammate-wallet-f7b0ecb7`. Three other teammate keys exist, but they
  are distinct `UNKNOWN` intents with no committed settlement and must not be
  substituted for the requested key.

## Safety state

- Do not POST `/v1/jobs`.
- Do not approve another payment or create a new task key.
- Treat the existing task key `report-teammate-wallet-f7b0ecb7` as the same
  durable intent and reconcile before any settlement retry.
- Do not approve or submit another payment until the adapter fix is deployed
  and a human authorizes one final Arc Testnet validation.
- The active account now has project-level Cloud Build Editor, Storage Admin,
  Service Usage Admin, Cloud Run Admin, and Secret Manager access needed for
  this deployment path.
