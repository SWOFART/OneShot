# OneShot Product Delivery Plan

Current 24-hour execution priority: [One-day rescue plan](docs/ONE_DAY_RESCUE.md)
(2026-09-12). It records current code, sponsor research, demo cutoffs and UI fixes;
the R0�R5 text below remains the historical planning baseline.

Revision: 2026-09-10. Planning baseline: `develop` at `86c8f86`.
This PR changes documentation only; new runtime and UX capabilities remain planned.

This replaces the previous roadmap, not completed code or historical evidence.
[A01–C06 packets](milestones/README.md) remain the original implementation record.
P0–P6 refer to that settlement baseline. R0–R5 below cover the new product
increment and do not replace mandatory FreePi Gate A, CI, and Gate B.

## 1. Purpose and vision

**OneShot provides resumable paid tools for business agents.**

An agent should resume an interrupted purchase, not create another payment.
A company approves an obligation; the original or replacement agent continues
the same job, resolves its financial outcome, and retrieves the existing result.

Product message: **Resume the job, not the payment.**
Core invariant: **One job. Many retries. One settlement.**

Initial customer: a developer operating business agents that buy paid API
results. Initial vertical: one company-data report from one integrated supplier.
If necessary, use a clearly labelled team-operated testnet supplier with a real
result; do not claim third-party adoption from that demonstration.

The guarantee is at-most-once settlement per stable Business Intent. Resumable
delivery requires supplier support for idempotent orders and result retrieval.
OneShot does not guarantee exactly-once execution of arbitrary external tools,
supplier quality, refunds, or commercial dispute resolution.

## 2. Current state versus planned work

Existing code includes durable intents/attempts, transactional outbox,
submission ownership, Privy signing, Arc receipt verification, recovery,
operator authentication, and a four-tab console on the marketing page.

RecoveryService already queries Graph during recovery even when known-identity
evidence exists, and verifies eligible candidates before asking the advisor.
This is not an always-on wallet audit or a multi-step investigation agent.
The Subgraph indexes transfer properties with `memoId` currently null;
amount/recipient/time-window matching does not prove business-order identity.

New work, not delivered by this planning PR:

- Stable task-to-purchase identity above the intent API.
- One supplier order/result connector and separately persisted delivery state.
- Separate public landing page and authenticated job-centered cabinet.
- Refreshable wallet reconciliation and job-aware evidence triage.
- Fresh live demonstration of an interrupted paid job returning its result.

Old P4/P5 evidence is build-specific; it does not qualify the new workflow or
prove current deployment health. See [current gaps](plan_missing_parts.md).

## 3. Smallest complete workflow

1. Operator signs in with Privy and selects the permitted execution wallet and
   supported tool. Login is not wallet authorization.
2. Operator approves the exact purchase: task, supplier, quote, recipient,
   amount, asset/network and applicable expiry. Reuse existing controls; do
   not imply pooled budgets or daily limits that are not implemented.
3. Agent supplies a stable task key. OneShot durably binds it to a supplier
   order and Business Intent before any chargeable effect.
4. Existing worker pays through Privy on Arc Testnet. Supplier fulfills the
   existing order after verified payment.
5. A repeated or replacement agent call returns the same job state/result.
   Uncertain payment triggers reconciliation, never replacement payment.
   Paid-but-undelivered work resumes only idempotent supplier fulfillment or
   retrieval using the original order reference.
6. Cabinet presents the result, receipt and any unresolved exception.

Conceptual agent operations: start approved job, get job, resume job, get result.
These are proposed capabilities, not existing endpoint names. Extend the
existing API/client additively. No new framework, SDK package or MCP server
is required.

## 4. Identity, delivery and safety contracts

- Durable uniqueness is scoped by authorized workspace, supplier/tool and
  caller task key. Bind a canonical payload and the existing intent ID.
  Changed payload under the same key is a conflict.
- Never infer task identity from amount, recipient, time or fuzzy similarity.
  Legitimate repeat purchases require an explicit new task key; agent restart
  must preserve the old one.
- Enforce workspace ownership server-side for create, resume, status, results
  and evidence. Privy login or possession of a UUID is insufficient. Start with
  one allowlisted workspace; do not claim open multi-tenant readiness.
- Freeze the supplier contract first: non-chargeable order creation, immutable
  quote, stable order reference, idempotent paid fulfillment, authenticated
  retrieval. If unsupported, stop that connector instead of promising safety.
- Payment state remains unchanged. Delivery state is separate: not requested,
  pending, available or retrieval failed are proposed concepts. Expired quotes
  cannot silently change an approved payment.
- Delivery failure never resets COMMITTED, creates a new intent or authorizes
  another payment. Persist supplier reference and result/reference across restart.
- Store minimal results with explicit retention and authorization. Validate
  supplier payloads and result URLs; prevent arbitrary URL fetching, secret
  exposure in logs/exports and cross-workspace access.
- Privy controls signing. OneShot/PostgreSQL controls submission ownership.
  Arc verifies execution. Graph/AI never grant settlement permission.
- Preserve integer atomic money, exact receipt/log checks, testnet-only scope
  and no blind retry from UNKNOWN. Resume/result retrieval cannot bypass these.

## 5. Graph and AI responsibilities

### Routine reconciliation

Add a bounded, refreshable wallet-activity view using existing Graph adapters
and provenance validation. Compare indexed transfers with recorded settlements;
surface unmatched transfers, uncertain jobs and index lag. Scope queries to
authorized wallets, implement pagination and disclose coverage before claiming
complete history. Start with manual refresh, not a new scheduled agent service.

Show RPC-verified payment separately from Graph indexing status. Graph failure
must not erase known payment success or block unrelated purchases. An unmatched
transfer is an investigation item, not fraud proof or permission to pay.

### Incident recovery and binding

Keep provider/known-hash lookup first for resolution. Graph discovers candidate
transactions when those sources cannot resolve the obligation; it may also
supply background observations. Do not disable working lookup or discard
durable evidence to make Graph necessary.

R0 must establish an order-to-transfer binding strategy: verified provider
reference, policy-compatible correlation mechanism, or hold/escalation when
association cannot be proved. Prevent one transfer/log being assigned to two
jobs. A nullable memo field is not an implemented correlation mechanism.

Identical transfer tuples can represent different orders. Neither one matching
candidate nor model confidence alone proves attribution. Multiple or
insufficiently bound candidates remain unresolved. Any memo/contract route
requires separate Privy scope and compatibility proof, not weaker policies.

### AI incident triage

Extend bounded advisor context with permitted job and supplier evidence.
Recommendations cite evidence and explain safe next steps: a verified payment
with missing delivery needs retrieval, not repurchase. Ambiguous chain data
requires explanation/escalation, not a guessed match.

Keep the four-action financial recommendation contract and
`settlementPermission: NEVER`. Supplier suggestions remain explanatory until
a reviewed versioned contract and deterministic delivery handler exist.
No arbitrary execution tools, wallet secrets or payment retry capabilities
are exposed to the advisor. Treat supplier/index data as untrusted.

Receipt truth remains deterministic. Show useful triage across job, supplier
and chain facts rather than presenting existing deterministic matching as AI.

## 6. Frontend: public landing and private cabinet

Reuse React/Vite and existing components. Separate routes/layouts, not another
frontend stack. The following routes and features are targets, not shipped APIs.

### Landing page: /

- Lead with “Resume the job, not the payment” and one concrete paid-tool example.
- Explain permissions, payment, interrupted execution and result retrieval.
  Move architecture below the user story.
- Replace mathematical-proof and unrestricted exactly-once-execution claims
  with the scoped at-most-once payment guarantee.
- Primary CTA: Open workspace. Secondary: How it works / developer docs.
  Returning users proceed directly to the cabinet after authentication.
- Keep testnet/integration labels honest. No private jobs, operational health
  details, machine-token input or embedded console on the public page.
- Label sample/demo previews; never present fixtures as live customer activity.

### Cabinet: /app

The cabinet is the working area, with shared navigation and a selected job,
not another marketing page.

| Section | User purpose | Minimum tools |
| --- | --- | --- |
| Overview | Find work needing attention | Active jobs, available results, uncertain payments; totals with explicit scope |
| Tools | Start supported paid work | One supplier tool, inputs, quote, purchase approval summary; no fictional catalog |
| Jobs | Resume and retrieve | Filterable jobs, payment/delivery badges, safe resume, saved results and receipts |
| Recovery & activity | Investigate exceptions | Graph freshness/coverage, unmatched activity, cited advice and core disposition |
| Wallet & permissions | Understand spending authority | Execution wallet, supplier/recipient scope, cap and policy status; edits only with enforced APIs |
| Developer access | Connect agents | Existing client examples for stable task identity and resume/result; no fake key issuance |

Proposed detail route: `/app/jobs/:jobId`. Carry job context across payment,
delivery and evidence tabs; do not require repeated intent-ID copy/paste.
Developer access may be a small settings section, not a new service.

### UX acceptance

- Start with tool/task inputs, not raw recipient/hash fields. Show amount,
  recipient and authorization before any chargeable action.
- Keep supplier, cost, result, human-readable status and next safe action
  prominent. IDs, hashes and raw evidence live in expandable advanced details.
- Resume reuses the job; Check payment is read-only reconciliation; Get result
  cannot pay. Explain disabled actions. No force-pay or disguised repurchase.
- Separate payment and delivery badges, e.g. Paid / Result pending, or Payment
  uncertain — investigating. Evidence absence never changes authoritative state.
- Compact loading, empty, stale, offline, denied and expired-session states.
  Preserve useful data during refresh; no giant empty evidence panels.
  Display last updated time and manual refresh.
- Keyboard navigation, visible focus, labelled fields, semantic headings,
  readable contrast, screen-reader announcements and reduced motion.
  Do not encode status only by color.
- Mobile navigation without horizontal page overflow. Preserve form input on
  recoverable errors. Test reload/deep links and post-login return paths.
- Never put credentials in URLs, analytics, browser persistence or exports.
  Raw developer machine tokens remain memory-only and outside normal UX.

## 7. Increment gates

All R gates start **NOT STARTED**. One focused implementation branch/PR per
gate or small acceptance slice. Reuse established package ownership.

| Gate | Scope and dependency | Required exit evidence |
| --- | --- | --- |
| R0: feasibility and contracts | First: supplier semantics, task identity, ownership, delivery states, chain binding and routes | Additive contracts/fixtures; supplier proof; actual Arc Privy signing/fallback controls; correlation limitations documented |
| R1: resumable job | After R0: durable job/order/result and one connector | Two agents, ten concurrent calls and restart share one intent/payment; conflicts denied; paid delivery failure resumes only delivery; isolated result access |
| R2: landing and cabinet | After R0; mock work may parallel R1, integration follows R1 | Separate public/private routes; six scoped sections; job navigation; keyboard/mobile/deep-link/auth tests; no misleading controls |
| R3: evidence and triage | After R1; cabinet integration after R2 | Live bounded activity query, coverage/freshness, job-aware citations; Graph lag cannot undo payment; ambiguous binding holds |
| R4: live failure demo | After R1–R3 | Real testnet purchase, labelled response-loss fault, live Studio evidence, verified original settlement or explicit hold, no replacement payment, supplier result |
| R5: release | After R4 | Exact-head checks, FreePi A/B, public docs/diagram, video, verified prize pool, sanitized evidence and human review |

R0 is not authorization to deploy contracts or change external wallet policy.
External configuration, live effects and mainnet activation require appropriate
human authorization. Historical packet gates do not close these new gates.

## 8. Tests and demonstration

Use [.agent/TEST_MATRIX.md](.agent/TEST_MATRIX.md): duplicate/conflicting input,
sequential/concurrent retries, two agents, restart, pre/post-submission faults,
provider denial, Graph lag/absence/ambiguity, invalid advice and downstream
failure after payment.

Add job assertions: one stable supplier order/intent, at most one payment,
independently counted supplier executions, same retrievable result, workspace
isolation, no transfer reused across jobs, and no payment on paid-job resume.

[Demo script](docs/DEMO_SCRIPT.md) separates existing offline rehearsal from
the planned live walkthrough. Never seed an old transfer into a new job and
call it live recovery. Inject faults at response boundaries without deleting
durable records or rewriting chain history. Preserve working provider lookup;
label any simulated provider unavailability separately.

Capture deployment/query identity, _meta freshness, candidates, cited advice,
core disposition, receipt/log, payment count, supplier order and result outcome.
Measure real timings; do not invent savings or latency.

## 9. Prize priorities

1. **Privy — Best B2B financial product:** primary positioning; a business-agent
   purchase constrained by actual wallet permissions.
2. **Arc — Best DeFi/Onchain Finance Application:** secondary for the eligible
   pool; real USDC purchase, conditional authorization and recovery.
3. **The Graph — Best AI Tooling or AI Use Case:** meaningful triage/automation
   over live Studio data, not just a Graph panel.
4. **Privy — Best financial flow:** additional fit from the same polished
   purchase; no separate feature roadmap.

Verify project history and registration before selecting Start Fresh or
Continuity. Graph has separate AI pools; Arc lists a separate Continuity
category. Do not assume eligibility or multiple awards.

The Arc $3,500 DeFi award includes $2,500 conditional on mainnet deployment by
September 30, not an extra bonus. Readiness documents are not deployment proof.
Mainnet remains separately authorized.

Requirements checked 2026-09-10:
[Privy](https://ethglobal.com/events/ethonline2026/prizes/privy),
[Arc](https://ethglobal.com/events/ethonline2026/prizes/arc),
[The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph).
Studio live queries are accepted; MCP is optional. Qualification for the new
workflow is **NOT VERIFIED** until live evidence and submission artifacts exist.
Follow [.agent/SPONSOR_REQUIREMENTS.md](.agent/SPONSOR_REQUIREMENTS.md).

## 10. Scope cuts and next action

Keep one supplier, one testnet network/asset and the existing Privy/API/worker/UI
stack. Defer pooled budgets, daily limits, payroll, treasury dashboards,
marketplaces, extra agent frameworks, Circle Agent Stack, multichain and generic
workflow automation until the first resumable paid job serves a real user.

Never cut identity, authorization, receipt verification, supplier feasibility,
failure tests, accessible interaction or honest evidence. Next implementation:
R0 contracts and feasibility, not another cosmetic transaction-console redesign.
