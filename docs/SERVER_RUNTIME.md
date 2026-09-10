# Server Runtime

## Runtime boundary

`@oneshot/api` is a runnable Fastify service. On startup it connects to PostgreSQL,
applies the append-only migrations, builds the durable intent ledger, and starts the
HTTP API. On `SIGTERM` or `SIGINT` it stops accepting requests and closes the database
pool.

Build and start it locally:

```powershell
Copy-Item .env.example .env
pnpm build
pnpm --filter @oneshot/api start:local
```

The service requires `SERVICE_BEARER_TOKEN` (at least 16 characters; provide it
through a secret store) and one database configuration:

- `DATABASE_URL` for local PostgreSQL, CI, or a managed TCP endpoint.
- `INSTANCE_CONNECTION_NAME`, `DB_USER`, `DB_PASS`, and `DB_NAME` for Cloud Run with
  Cloud SQL. The runtime derives the Unix socket path at
  `/cloudsql/INSTANCE_CONNECTION_NAME`.
- `INSTANCE_UNIX_SOCKET` may be supplied directly instead of the instance connection
  name.

Privy operator authentication is allowlisted by `did:privy:*` subject. A wildcard
allowlist is disabled unless `PRIVY_AUTH_ALLOW_ALL_SUBJECTS=true` is explicitly
configured for a public/demo deployment.

`GET /health/live` proves the process is running. `GET /health/ready` also checks the
database and frozen network/contract identity. Schema migrations must succeed before
the server binds a port.

## Production target

The production target is one private Cloud SQL for PostgreSQL instance used by the API
and worker, with the API running on Cloud Run. Store `DB_PASS` and
`SERVICE_BEARER_TOKEN` in Google Secret Manager and expose them to the Cloud Run
revision. Grant the Cloud Run service account Cloud SQL Client access and attach the
Cloud SQL instance to the service.

Provisioning the Google Cloud project, IAM, secrets, container image, and rollout is a
deployment task. This milestone establishes the executable process and its database
contract without embedding cloud credentials or requiring Google-specific code in the
domain.

## Frontend gate

This server does not unlock A05, B05, or C05. Those milestones remain blocked until
Gate P4 composes the reviewed Arc, Privy, and Subgraph MCP packages, revalidates the
OpenAPI and recovery semantics, and publishes the frozen mock server.
