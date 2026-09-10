# Mainnet Readiness Package

## Status line

```text
STATUS: DEPLOYMENT-READY
```

OneShot delivers a verified, working integration on **Arc Testnet** and an
explicit **Mainnet-ready deployment path**. Arc has not published official
production network parameters at this time; OneShot claims deployment-readiness,
not an unverified mainnet deployment. Real-value execution remains strictly
disabled until official values are pinned, verified, and explicitly authorized
by a human operator.

## 1. Profile configuration and network parameters

The settlement profile configuration is codified in
[`packages/arc-adapter/src/profiles.ts`](../packages/arc-adapter/src/profiles.ts).

### Pinned vs unpublished comparison

| Field                   | Arc Testnet (`arc-testnet`)                  | Arc Mainnet (`arc-mainnet`)   |
| :---------------------- | :------------------------------------------- | :---------------------------- |
| **Profile ID**          | `arc-testnet`                                | `arc-mainnet`                 |
| **Verification**        | `PINNED` (verified at docs.arc.io)           | `UNPUBLISHED`                 |
| **Enabled**             | `true`                                       | `false` (fails closed)        |
| **isMainnet**           | `false`                                      | `true`                        |
| **Chain ID**            | `5042002`                                    | _Awaiting launch publication_ |
| **CAIP-2**              | `eip155:5042002`                             | _Awaiting launch publication_ |
| **USDC Contract**       | `0x3600000000000000000000000000000000000000` | _Awaiting launch publication_ |
| **USDC Decimals**       | `6` (settlement precision)                   | `6` (standard ERC-20)         |
| **Native Gas Decimals** | `18` (gas precision)                         | `18` (gas precision)          |
| **Activation Gate**     | Testnet default                              | Human authorization required  |

### Strict fail-closed policy (zero guessed constants)

OneShot strictly forbids guessing or embedding placeholder values for mainnet
chain IDs, RPC endpoints, explorers, or token contracts:

- The `arc-mainnet` profile structurally carries no values by design.
- Attempting to load `ONESHOT_ARC_PROFILE=arc-mainnet` immediately fails with
  `PROFILE_UNPUBLISHED`.
- Activation requires three independent gates:
  1. Official parameters published by Arc and pinned with
     `verification: 'PINNED'`.
  2. The profile marked `enabled: true`.
  3. Explicit human operator flag `ONESHOT_ALLOW_MAINNET_ACTIVATION=true`.

## 2. Readiness probe evidence

The readiness probe in `@oneshot/arc-adapter` enforces compile-time and runtime
invariants against the profile configuration.

### Invariant probe execution

When evaluated against the disabled mainnet profile, the probe enforces
fail-closed behavior:

```text
profile : arc-mainnet (unpinned)
token   : absent
settle  : 6 decimals
gas     : 18 decimals

PASS      decimals-distinct: ERC-20 USDC (6) and native gas USDC (18) are 10^12 apart
PASS      fail-closed-check: unpinned profile refuses to load or settle
PASS      zero-guessed-check: no guessed RPC, token, or chain constants present
PASS      human-gate-check: ONESHOT_ALLOW_MAINNET_ACTIVATION required

READY: Configuration structurally complete and fail-closed.
```

## 3. Production deployment manifest and commands

The production runtime target consists of:

1. **API Service**: Fastify application running in Google Cloud Run.
2. **Worker Service**: Graphile Worker background runner running in Google Cloud Run (or Cloud Run Job).
3. **Database**: Managed Google Cloud SQL for PostgreSQL 16+ instance.
4. **Secret Store**: Google Secret Manager.
5. **Operator Console**: Vite SPA deployed on Cloudflare Workers / Pages.

### Step 1: Secret provisioning (Google Secret Manager)

```bash
# Create and populate production secrets
gcloud secrets create oneshot-db-pass --replication-policy="automatic"
echo -n "YOUR_STRONG_DB_PASSWORD" | gcloud secrets versions add oneshot-db-pass --data-file=-

gcloud secrets create oneshot-bearer-token --replication-policy="automatic"
openssl rand -hex 32 | gcloud secrets versions add oneshot-bearer-token --data-file=-
```

### Step 2: Cloud SQL instance provisioning

```bash
gcloud sql instances create oneshot-postgres \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-7680 \
  --region=us-central1 \
  --storage-auto-increase \
  --availability-type=REGIONAL

gcloud sql databases create oneshot --instance=oneshot-postgres
gcloud sql users create oneshot_user --instance=oneshot-postgres --password="YOUR_STRONG_DB_PASSWORD"
```

### Step 3: Database bootstrap and migration

```bash
# Run schema bootstrap from CI or deployment runner
DATABASE_URL="postgres://oneshot_user:YOUR_STRONG_DB_PASSWORD@/oneshot?host=/cloudsql/PROJECT_ID:us-central1:oneshot-postgres" \
pnpm db:bootstrap
```

### Step 4: Cloud Run API deployment

```bash
# Build and deploy Fastify API container
gcloud run deploy oneshot-api \
  --image="gcr.io/PROJECT_ID/oneshot-api:latest" \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances="PROJECT_ID:us-central1:oneshot-postgres" \
  --set-env-vars="HOST=0.0.0.0,PORT=8080,DB_NAME=oneshot,DB_USER=oneshot_user,INSTANCE_CONNECTION_NAME=PROJECT_ID:us-central1:oneshot-postgres,ONESHOT_API_RATE_LIMIT_MAX_REQUESTS=60,ONESHOT_API_RATE_LIMIT_WINDOW_MS=60000" \
  --set-secrets="DB_PASS=oneshot-db-pass:latest,SERVICE_BEARER_TOKEN=oneshot-bearer-token:latest"
```

### Step 5: Cloud Run Worker deployment

```bash
# Deploy settlement and reconciliation worker
gcloud run deploy oneshot-worker \
  --image="gcr.io/PROJECT_ID/oneshot-worker:latest" \
  --region=us-central1 \
  --platform=managed \
  --no-allow-unauthenticated \
  --add-cloudsql-instances="PROJECT_ID:us-central1:oneshot-postgres" \
  --set-env-vars="HOST=0.0.0.0,PORT=8080,DB_NAME=oneshot,DB_USER=oneshot_user,INSTANCE_CONNECTION_NAME=PROJECT_ID:us-central1:oneshot-postgres,ONESHOT_ARC_PROFILE=arc-testnet,ONESHOT_ARC_RPC_URL=https://ARC_RPC_HOST,ONESHOT_PRIVY_APP_ID=PRIVY_APP_ID,ONESHOT_PRIVY_WALLET_ID=PRIVY_WALLET_ID,ONESHOT_PRIVY_WALLET_ADDRESS=PRIVY_WALLET_ADDRESS,ONESHOT_PRIVY_POLICY_ID=PRIVY_POLICY_ID,ONESHOT_PRIVY_POLICY_DIGEST=PRIVY_POLICY_DIGEST,ONESHOT_RECIPIENT_ALLOWLIST=RECIPIENT_ADDRESS,ONESHOT_SETTLEMENT_CAP_ATOMIC=1000000,ONESHOT_SUBGRAPH_SOURCE=STUDIO_GRAPHQL,ONESHOT_SUBGRAPH_QUERY_URL=https://api.studio.thegraph.com/query/STUDIO_ID/SUBGRAPH/VERSION,ONESHOT_SUBGRAPH_DEPLOYMENT_ID=SUBGRAPH_DEPLOYMENT_ID,ONESHOT_SUBGRAPH_MANIFEST_CID=SUBGRAPH_MANIFEST_CID,ONESHOT_SUBGRAPH_MAX_LAG_BLOCKS=5,ONESHOT_RECOVERY_FROM_BLOCK=0,ONESHOT_RECOVERY_TO_BLOCK=RECOVERY_TO_BLOCK,ONESHOT_VERTEX_PROJECT_ID=PROJECT_ID,ONESHOT_VERTEX_LOCATION=europe-west1,ONESHOT_VERTEX_MODEL=gemini-2.5-flash" \
  --set-secrets="DB_PASS=oneshot-db-pass:latest,ONESHOT_PRIVY_APP_SECRET=privy-secret:latest,ONESHOT_GRAPH_API_KEY=graph-api-key:latest"
```

## 4. Safe disable and emergency pause

If anomalous market conditions, provider outages, or contract pauses occur:

```bash
# Expose disabled state through API readiness
gcloud run services update oneshot-api \
  --update-env-vars="ONESHOT_SUBMISSIONS_DISABLED=true"

# Stop workers from acquiring new settlement ownership
gcloud run services update oneshot-worker \
  --update-env-vars="ONESHOT_SUBMISSIONS_DISABLED=true"
```

Operational effects:

- `POST /v1/intents` may still persist idempotent intents, but they cannot cross
  the worker's `READY -> SUBMITTING` gate while disabled.
- Read APIs (`GET /v1/intents/:id`) and reconciliation
  (`POST /v1/intents/:id/reconcile`) remain live.
- A settlement already in flight when the disabled worker revision becomes
  active may complete normally or transition to `UNKNOWN` for reconciliation.
- No new settlement ownership or settlement-port call begins after the disabled
  worker revision is active.

## 5. Rollback runbook

### Cloud Run application rollback

To instantly revert to the previously verified revision without downtime:

```bash
# List previous revisions
gcloud run revisions list --service=oneshot-api --region=us-central1

# Route 100% traffic to prior revision
gcloud run services update-traffic oneshot-api \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

### Database migration safety

All OneShot database migrations are strictly append-only and backward-compatible:

- Table modifications only add nullable columns or new tables.
- An older application revision operates safely alongside the updated database
  schema without requiring a database downgrade or restore.

## 6. Human gate for mainnet activation

Once Arc publishes official Mainnet network parameters, the following human
procedure unlocks production settlement without changing application or domain
code:

1. **Verify Official Documentation**: Obtain Chain ID, CAIP-2, RPC URL, block
   explorer URL, and verified USDC ERC-20 contract address from official Arc
   sources.
2. **Pin Values in Repository**:
   - Update `packages/arc-adapter/src/profiles.ts` to populate `ARC_MAINNET` with
     `verification: 'PINNED'` and `enabled: true`.
   - Update contract fixtures and run `pnpm test` and
     `pnpm scenarios:invariants`.
3. **Execute Independent Review**:
   - Pass FreePi Gate A and Gate B on the update.
   - Human owner merges PR to `develop` and `main`.
4. **Deploy with Human Authorization**:
   - Set `ONESHOT_ARC_PROFILE=arc-mainnet`.
   - Set `ONESHOT_ALLOW_MAINNET_ACTIVATION=true`.
   - Set `ONESHOT_SETTLEMENT_CAP_ATOMIC` to the initial pilot cap (e.g. $100
     USDC).
   - Verify deployment using the read-only probe:
     `pnpm --filter @oneshot/arc-adapter probe`.
