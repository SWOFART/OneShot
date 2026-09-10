# Recovery Hardening

This document describes the production contracts implemented by the recovery-
hardening milestone. It covers hashless recovery, provider identity, receipt
evidence, Subgraph MCP admission, operator authentication, and operational
metrics.

## Recovery authority

The Graph and Subgraph MCP are discovery and evidence sources only. A candidate
transfer is not authoritative until the deterministic recovery core verifies it
against Arc RPC evidence. For a candidate to support `MARK_COMMITTED`, the core
requires:

- the candidate transaction hash, block number, and verified Transfer log index
  to match the authoritative receipt;
- the receipt to be on the configured Arc chain and contain exactly one matching
  token Transfer to the expected recipient for the exact amount; and
- the durable intent to retain the provider request identity and valid Arc
  settlement reference.

Zero candidates, failed queries, multiple candidates, contradictory evidence,
and unverifiable receipts remain `UNKNOWN` or escalate. They never authorize a
new submission. Recovery is read-only with respect to the external chain.

## Durable provider and receipt identity

The worker derives the provider request identity before calling the external
provider and persists it on the owned `SUBMITTING` attempt. If persistence
fails, the provider call is not made. Restart and reconciliation paths reload
that identity from PostgreSQL rather than reconstructing it from transient
state. The deterministic per-intent idempotency key prevents a retry from
becoming a second provider request.

Confirmed settlements bind the verified transaction hash, block number, and
Transfer log index through a guarded ledger transition. Existing settlement
identity is not overwritten by recovery or duplicate delivery.

## Production Graph boundary

Production composition requires an explicit read-only Graph recovery port. The
runtime requires either `ONESHOT_SUBGRAPH_MCP_ENDPOINT` for a supported remote
MCP server or `ONESHOT_SUBGRAPH_QUERY_URL` for the Studio-only Arc deployment.
It does not silently fall back to an unavailable Network Gateway. Direct Studio
GraphQL is operational recovery evidence, not official MCP qualification.

## Operator authentication

The API requires a service bearer token of at least 16 characters and compares
it in constant time. Optional Privy operator authentication verifies ES256 JWTs
with the configured issuer, audience, expiry, and `did:privy:` subject shape.
Subjects are allowlisted explicitly. A wildcard subject—whether standalone or
mixed into a list—requires `PRIVY_AUTH_ALLOW_ALL_SUBJECTS=true`; otherwise the
configuration is rejected. Tokens and credentials are never written to logs,
errors, metrics, or documentation.

## Operational metrics

Migration `004_operational_metrics.sql` adds the constrained,
non-sensitive `operational_metric_events` table. It records:

- duplicate replay and payload-conflict requests;
- failed submission-ownership claims (CAS conflicts);
- authorization policy denials;
- ambiguous provider outcomes such as `POSSIBLY_SUBMITTED`; and
- reconciliation outcomes: `COMMITTED`, `FAILED_SAFE`, or `UNKNOWN`.

`GET /v1/metrics` combines these durable counters with the existing state,
`UNKNOWN`, and outbox queue gauges. Metric writes are observational: failures
are swallowed and metric data never grants settlement permission or changes a
ledger transition. The table stores only the business-intent foreign key,
bounded event type/outcome, and timestamp; request bodies, tokens, wallet
credentials, and provider secrets are excluded.

The PostgreSQL integration suite runs with `TEST_POSTGRES=1` and provisions
PostgreSQL through Testcontainers. A container-enabled environment or CI is
required for that portion of validation.
