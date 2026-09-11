# C06 recovery demo runbook

## Mode label

Announce the mode before starting:

- `SYNTHETIC REVIEW`: public/local fixture viewer and deterministic tests only.
- `LIVE QUALIFICATION`: only after every live capture preflight item passes.

Never describe the synthetic viewer as a live Graph, Privy, Arc, or model demo.

## Synthetic review (about three minutes)

1. Open the recovery viewer and select **Aged Unknown**. Show the stable Business
   Intent ID, missing settlement certainty, separate authority classes, and the
   absence of any payment/retry action.
2. Select fresh, lagging, unavailable, empty, multiple, contradictory, hostile,
   and invalid-agent scenarios. Show that only refresh and escalation exist and
   the deterministic disposition stays read-only/fail-closed.
3. Select the verified-existing-result fixture. Explain that the index only
   discovers a candidate; exact Arc evidence is what permits the core to return
   an already-existing result. No new settlement call is available.
4. Run the reconciliation and UI verification commands from the bundle index.
   Point to zero external submissions in both recovery matrix reports.

Local viewer:

```bash
pnpm --filter @oneshot/recovery-ui dev
```

Open `http://localhost:5173/?scenario=aged-unknown`.

## Live qualification flow

Run this only after `LIVE_CAPTURE_CHECKLIST.md` is complete:

1. Create a new Business Intent and record its identity before submission.
2. Use the reviewed Privy-constrained normal path. Inject the fault after the
   real Arc broadcast and before the adapter returns; do not delete persisted
   state or a hash already known to OneShot.
3. Show durable `UNKNOWN`, one Attempt, and no stored transaction hash. Query the
   original Privy request and exercise the branch where it returns no hash.
4. Query the pinned deployment using the native Studio GraphQL path
   `execute_query_by_deployment_id`. Capture the sanitized call identity,
   arguments digest, deployment/manifest, `_meta`, chain head, lag, health, and
   candidate count.
5. Give the sanitized result to the configured recovery model. Capture only its
   allowed structured recommendation and evidence references—never chain of thought.
6. Independently verify the selected hash through exact Arc Testnet receipt and
   ERC-20 Transfer log checks. Then show the deterministic core disposition,
   unchanged Business Intent ID, and external submission count `0` during recovery.
7. Repeat the degraded cases. Every inconclusive case must remain `UNKNOWN` or
   escalate and must create no new Attempt or settlement call.

## Safe reset

- Use a new Business Intent ID for another real-value run.
- Keep prior chain history, receipts, durable events, and evidence immutable.
- Stop/restart services normally; do not delete database rows or rewrite state.
- Clear only browser presentation state when needed.
- Never replay a provider submission merely to make a screenshot cleaner.
