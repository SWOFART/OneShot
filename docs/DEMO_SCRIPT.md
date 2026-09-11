# Resumable paid-job demonstration

Status: target walkthrough for plan gates R4/R5, not a completed live demo.
The supplier/job/cabinet increment must pass R0–R3 first. The existing payment
baseline and its checked-in evidence remain useful but do not prove this flow.

For the first Arc transfer rehearsal, configure the API's
`ONESHOT_SUPPLIER_RECIPIENT` and `ONESHOT_SUPPLIER_AMOUNT_ATOMIC` to a small
testnet invoice (for example `10000` atomic USDC / `0.01 USDC`) and configure
the same recipient in the worker's `ONESHOT_RECIPIENT_ALLOWLIST`. Use a second
team-controlled Arc Testnet wallet. The transfer is a real Privy-authorized
settlement, but the result remains labelled as a team-operated demo until an
external supplier is integrated.

The second, separately labelled mode is **Paid API purchase via Circle x402**.
Run `pnpm demo:x402` against one Circle Arc nanopayments sample endpoint after
funding the wallet's Gateway testnet balance. It uses Privy EIP-712 signing and
one paid request; an ambiguous response remains `UNKNOWN` and is not retried.
This demonstrates the x402 supplier rail, not the direct Arc transfer proof.

## Existing offline rehearsal

Run `pnpm demo:e2e` to build, run invariant scenarios and validate sanitized
evidence. It does not send a transaction or query fresh live providers.
Do not present fixture playback as a live Graph/model demonstration.

## Before recording

- Confirm approved Arc Testnet wallet, supplier, recipient and small amount.
  No mainnet execution or new external policy changes are authorized here.
- Select one actual paid report tool with an idempotent supplier order and
  retrievable result. Label a team-operated testnet supplier accurately.
- Establish the stable task key and exact order-to-payment binding. Never
  attribute an old unrelated transfer to the demo job.
- Validate actual Privy policy denial on the execution path, including signing
  fallback. Local rejection alone is not remote Privy enforcement evidence.
- Check Studio deployment identity and freshness, provider lookup, RPC and
  advisor availability. Prepare an explicitly labelled degraded scenario.
- Enable only the reviewed testnet fault hook: drop the post-broadcast response
  before its hash is durably recorded. Do not delete existing durable evidence,
  rewrite chain history, or suppress a working provider lookup.

The hook is enabled only for the live drill process:

```text
ONESHOT_R4_LIVE=true
ONESHOT_R4_CONFIRM_TESTNET=true
ONESHOT_DEMO_RESPONSE_LOSS_AFTER_BROADCAST=true
ONESHOT_DEMO_CONFIRM_TESTNET=true
ONESHOT_R4_API_URL=https://<api-host>
ONESHOT_R4_API_BEARER_TOKEN=<runtime-secret>
ONESHOT_R4_TASK_KEY=<stable-demo-task-key>
pnpm demo:r4
```

`pnpm demo:r4` is offline unless `ONESHOT_R4_LIVE=true`. It never retries a
job-create, resume, or payment request after an ambiguous HTTP response; it
reads the existing task by identity and records a sanitized `HOLD` when the
original settlement or Studio evidence cannot be proven.

## Four-minute target walkthrough

1. **Purpose and permission (0:00–0:35).** Show the public landing page, then
   sign in to the cabinet. Enter a company/domain and show the generated task
   key. Request the live quote, inspect amount, recipient, network and expiry,
   then explicitly approve payment. State the scope: at-most-once payment,
   supplier-supported resumable delivery, not exactly-once execution of
   arbitrary tools.
2. **Start and interrupt (0:35–1:15).** Agent A approves one job. A real testnet
   payment broadcasts. Show the labelled response-loss fault and durable
   Payment uncertain status. Keep the original task/order identity visible.
3. **Resume and investigate (1:15–2:30).** Agent B resumes the same task.
   No replacement payment occurs. Try provider lookup normally. If it resolves
   the payment, show that honestly; demonstrate hashless recovery in a separate,
   clearly labelled provider-unavailable fault scenario. Show the live Studio
   query, deployment, _meta freshness, candidates and exact Arc verification.
   Advisor output cites evidence; the deterministic core records the original
   settlement only when attribution and receipt proof are sufficient.
4. **Finish the job (2:30–3:10).** Retrieve the supplier's existing result using
   the original order reference. Both agents obtain the same result. Show Paid
   separately from Result available and inspect the receipt as advanced detail.
5. **Fail safely (3:10–3:45).** Show Graph-unavailable or ambiguous evidence on
   an unresolved job. It remains held with zero replacement payments. Show the
   advisor explaining the missing evidence, not inventing a transaction match.
6. **Outcome (3:45–4:00).** Show the measured payment/order/result counts.
   Explain Privy authorization, Arc settlement and Graph-assisted investigation.
   End on the completed business result, not a raw transaction hash.

A real live run may exceed the video window because of indexing/provider
latency. Preserve a complete trace and label any time compression; do not
manufacture instantaneous Graph indexing.

## Evidence and acceptance

Record exact commit, network, query/deployment identity, retrieval time,
freshness/coverage, candidate references, advisor recommendation, deterministic
disposition, verified transaction/log, stable job/intent/order and result.
Count external payments and supplier executions independently. Record observed
recovery duration without invented performance comparisons.

Multiple or insufficiently bound candidates remain unresolved. The successful
recovery segment requires real evidence that binds the transfer to this order;
if unavailable, report the limitation rather than stage a false success.

Public artifacts must contain no credentials, private result data or sensitive
runtime configuration. Demo and video do not qualify a sponsor without all
current requirements and the correct event pool. Mainnet and Circle Agent
Stack are not claimed. No recorded video is delivered by this documentation PR.
