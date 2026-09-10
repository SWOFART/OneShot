# OneShot Project Context

## Product statement

`One job. Many retries. One settlement.`

Product direction: **resumable paid tools for business agents**. User-facing
message: **Resume the job, not the payment.** The revised `plan.md` defines
R0–R5 for the next increment; it does not claim those features are implemented.

OneShot executes an approved business obligation safely despite retries,
crashes, lost responses, parallel workers, or multiple agent instances.

The core cardinality is:

`1 intent / N attempts / <=1 committed settlement`

This document defines ownership and vocabulary. It is not a product
implementation plan.

## Primary production vertical

The first user is a company that lets an autonomous agent purchase a paid API
operation or digital result in USDC. The company approves one business
obligation; retries, restarts, queue redelivery, parallel workers, and multiple
agent instances must all converge on the same Business Intent and at most one
committed settlement.

The current product exposes an agent API, execution worker, reconciliation
service, operator console, and audit/recovery timeline. The next increment
adds one supplier order/result connector, stable task identity above Business
Intent, and separate delivery state. A replacement agent resumes the same job
and retrieves its existing result without another payment. Delivery guarantees
depend on supplier idempotency and retrieval support, not on payment alone.

The planned UI separates a public landing page from an authenticated cabinet
for tools, jobs/results, wallet permissions, recovery/activity and developer
access. Raw transaction details remain available as advanced evidence.
Broad treasury, pooled budgets, payroll and arbitrary supplier integrations
are deferred. Privy B2B is the primary product pitch; Arc payments and Graph
evidence-based triage support the same workflow, not separate products.

## System ownership

- OneShot is authoritative for business-intent execution state, attempt state,
  settlement state, and permission to create another external settlement.
- Privy is the corporate wallet and scoped authorization boundary. OneShot must
  use its policies and spending permissions on the normal execution path.
- Arc is the real USDC settlement rail used by the demo.
- Direct Privy lookup and Arc RPC receipt/log evidence resolve known transaction
  identities after ambiguous outcomes.
- The Graph is the selected v1 candidate-discovery layer when the transaction
  hash is missing. C01 must prove live hashless discovery and AI-track value;
  Graph results remain non-authoritative and can never authorize another payment.

When an external submission may have happened but the result is uncertain,
OneShot records `UNKNOWN` and reconciles. Missing external-index data never converts `UNKNOWN` into permission to submit again.

## Glossary

### Business Intent

The durable identity of one approved business obligation. Its
`business_intent_id` remains stable across retries, process restarts, queue
redelivery, parallel workers, and multiple agents. Payload differences do not
create a second settlement right when the identifier is the same.

### Attempt

One execution try for a Business Intent. Attempts are expendable and may fail or
repeat. Any number of Attempts can belong to one Business Intent.

### Settlement

The committed external USDC payment for a Business Intent. A Business Intent may
have zero or one committed Settlement, never more than one.

### Reconciliation

The process that resolves an ambiguous external effect using durable local
state, provider identifiers and receipts, Graph-discovered candidates, and Arc proof.
Reconciliation precedes any decision to retry payment when settlement state is
`UNKNOWN`.

### Recovery View

A derived, non-authoritative view assembled from durable OneShot records, live
Graph candidate discovery, and Arc verification. It helps operators and agents explain
and recover work but does not grant permission to create a Settlement.

## Decision test

Any design affecting retries or payments must answer:

1. What stable Business Intent does this Attempt belong to?
2. Which durable atomic transition grants the right to submit an external
   Settlement?
3. How is an ambiguous submission reconciled without a blind retry?
4. How do parallel workers converge on at most one committed Settlement?
5. Which evidence is authoritative, and which evidence is only a Recovery View?
