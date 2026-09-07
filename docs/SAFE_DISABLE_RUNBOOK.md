# OneShot Safe Disable Runbook

## Purpose

This runbook outlines how operators immediately pause external settlement activity during incidents without degrading status inspection, evidence ingestion, or reconciliation reads.

## Trigger Scenarios

- Upstream Arc RPC degradation or consensus fork.
- Partner Privy authorization service outage.
- Unexpected surge in `UNKNOWN` state intents requiring human investigation.
- Scheduled smart contract upgrade or maintenance.

## Emergency Pause Procedure

### Option 1: Environment Variable Toggle

Set the environment variable across all worker containers:

```bash
export ONESHOT_SUBMISSIONS_DISABLED=true
```

Restart or signal the workers. The workers immediately stop claiming submission ownership for any `READY` intent.

### Option 2: Runtime Configuration Switch

When operating with dynamic configuration:

```json
{
  "submissionsDisabled": true
}
```

The worker audits the pause event via structured telemetry:

```json
{
  "type": "STATE_TRANSITION",
  "correlation_id": "audit-disable-intent-xyz",
  "business_intent_id": "intent-xyz",
  "from_state": "READY",
  "to_state": "READY",
  "reason": "Submission ownership paused by safe disable configuration switch"
}
```

## System Behavior While Disabled

| Operation | Status | Details |
| --- | --- | --- |
| Submission ownership (`READY -> SUBMITTING`) | **PAUSED** | No calls to settlement port; intents remain safely in `READY` |
| Health Liveness (`GET /health/live`) | **ACTIVE** | Returns `200 { status: "ok" }` |
| Health Readiness (`GET /health/ready`) | **ACTIVE** | Returns `200 { status: "ok", submissions_disabled: true }` |
| Intent Status (`GET /v1/intents/:id`) | **ACTIVE** | Returns current intent state |
| Recovery View (`GET /v1/intents/:id/recovery-view`) | **ACTIVE** | Returns attempts, settlements, and evidence |
| Reconciliation Ingestion (`POST /v1/intents/:id/reconcile`) | **ACTIVE** | Enqueues reconciliation for existing `UNKNOWN` intents |

## Resumption Procedure

1. Verify Arc RPC and partner dependencies are healthy.
2. Unset `ONESHOT_SUBMISSIONS_DISABLED=false`.
3. Workers will resume draining outbox jobs and claiming submissions in strict FIFO order.
