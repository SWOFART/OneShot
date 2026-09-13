# OneShot Reconciliation & Escalation Runbook (v1)

## 1. Core Rule: NEVER "Just Retry"

> [!IMPORTANT]
> **Cardinal Invariant**: A human operator or automated script must NEVER trigger a blind retry, initiate a new payment submission, or treat an expired submission lease as permission to pay.
>
> If an intent is in `UNKNOWN`, funds may have already moved on Arc. Issuing a replacement payment without definitive on-chain proof will cause a duplicate disbursement!

---

## 2. Intent Age Buckets & Severity Levels

| Age              | Bucket     | Severity         | Required Operator Action                                                                                                |
| ---------------- | ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `< 5 minutes`    | `FRESH`    | Low              | Monitor outbox runner. No manual intervention required; Subgraph MCP and Arc polling cycle automatically.               |
| `5 - 60 minutes` | `STALE`    | Warning          | Check Subgraph MCP health and RPC latency. Trigger read-only reconciliation via `POST /v1/intents/{id}/reconcile`.      |
| `> 60 minutes`   | `CRITICAL` | Alert / Critical | On-call investigation required. Inspect blockchain explorer for the corporate wallet address and intent transfer tuple. |

---

## 3. Standard Investigation Workflow

When an alert fires for an intent stranded in `UNKNOWN`:

1. **Query Authoritative State**:

   Execute a read-only query against the OneShot API:

   ```bash
   curl -s -H "Authorization: Bearer $ONESHOT_API_KEY" \
     https://api.oneshot.invalid/v1/intents/$INTENT_ID/recovery-view
   ```

   Inspect `authoritative_state`, `core_disposition`, `evidence`, and `contradiction_codes`.

2. **Verify Arc On-Chain State**:
   - Check the configured Arc explorer (`eip155:5042002`) for the sender wallet address.
   - Search for ERC-20 Transfer events matching the exact tuple:
     - `token`: configured USDC contract (`0x3600000000000000000000000000000000000000`)
     - `recipient`: intent recipient address
     - `amount`: exact atomic amount string

3. **Determine Resolution Path**:
   - **Case A: Transfer Confirmed on Chain**:
     - Provide the transaction hash and block number to the reconciliation engine.
     - The engine will verify the Arc receipt and transition the intent to `COMMITTED`.
   - **Case B: Transaction Definitely Reverted**:
     - Provide the reverted transaction hash.
     - The engine verifies the revert and transitions the intent to `FAILED_SAFE`.
   - **Case C: Ambiguous or Contradictory**:
     - Keep the intent held in `UNKNOWN`.
     - Contact the counterparty to verify whether funds were received before closing the ticket.
