# OneShot Dashboards and Alert Definitions

## Overview

Structured telemetry and durable operational metrics for the OneShot settlement control plane (Milestone A04.3).

`GET /v1/metrics` reads state gauges and non-sensitive event counters from
PostgreSQL. Metric event writes are best-effort and never participate in a
ledger transition or grant settlement permission.

## Key Metrics

| Metric Name                        | Type    | Description                                                                                                                   |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `oneshot_intents_total`            | Gauge   | Number of Business Intents categorized by state (`AUTHORIZING`, `READY`, `SUBMITTING`, `COMMITTED`, `FAILED_SAFE`, `UNKNOWN`) |
| `oneshot_unknown_count`            | Gauge   | Current count of intents in `UNKNOWN` state                                                                                   |
| `oneshot_oldest_unknown_age_ms`    | Gauge   | Age in milliseconds of the oldest un-reconciled intent in `UNKNOWN` state                                                     |
| `oneshot_cas_conflicts_total`      | Counter | Total count of atomic CAS claim collisions                                                                                    |
| `oneshot_outbox_queue_lag_ms`      | Gauge   | Maximum latency in milliseconds between `available_at` and current execution                                                  |
| `oneshot_duplicate_requests_total` | Counter | Total count of duplicate replay requests received and durably recorded                                                        |
| `oneshot_policy_denials_total`     | Counter | Total count of intents rejected by authorization policy                                                                       |
| `oneshot_provider_errors_total`    | Counter | Total count of ambiguous external submission failures durably recorded                                                        |

## Alert Definitions

### 1. High `UNKNOWN` State Count (`HIGH_UNKNOWN_COUNT`)

- **Condition**: `oneshot_unknown_count > 5`
- **Severity**: Critical
- **Action**: Alert on-call. Indicates repeated provider timeouts or worker crashes during settlement. Verify network connectivity to Arc RPC and Privy.

### 2. Stale `UNKNOWN` Intent (`STALE_UNKNOWN_INTENT`)

- **Condition**: `oneshot_oldest_unknown_age_ms > 300000` (5 minutes)
- **Severity**: High
- **Action**: Check the configured Graph recovery source (Studio GraphQL for
  Arc Testnet, or the optional MCP/indexer path). Intents must not linger in
  `UNKNOWN` indefinitely.

### 3. Elevated Outbox Queue Lag (`HIGH_QUEUE_LAG`)

- **Condition**: `oneshot_outbox_queue_lag_ms > 60000` (1 minute)
- **Severity**: Warning
- **Action**: Scale up worker instances. Outbox delivery is falling behind generation rate.

### 4. High CAS Conflicts (`HIGH_CAS_CONFLICTS`)

- **Condition**: `oneshot_cas_conflicts_total > 50` within 1 minute
- **Severity**: Warning
- **Action**: Investigate upstream calling agent duplicate storm. Normal idempotency controls are absorbing the load, but queue efficiency is impacted.

## Privacy & Redaction Policy

All logs and metric labels must pass through `redactSensitiveData()`. Metrics and logs never include:

- Private keys or wallet credentials
- Authorization bearer tokens or API keys
- Raw request/response payloads
- Customer signature hex data
