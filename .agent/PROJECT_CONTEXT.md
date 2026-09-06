# OneShot Project Context

## Product statement

`One job. Many retries. One settlement.`

OneShot executes an approved business obligation safely despite retries,
crashes, lost responses, parallel workers, or multiple agent instances.

The core cardinality is:

`1 intent / N attempts / <=1 committed settlement`

This document defines ownership and vocabulary. It is not a product
implementation plan.

## System ownership

- OneShot is authoritative for business-intent execution state, attempt state,
  settlement state, and permission to create another external settlement.
- Privy is the corporate wallet and scoped authorization boundary. OneShot must
  use its policies and spending permissions on the normal execution path.
- Arc is the real USDC settlement rail used by the demo.
- The Graph supplies live indexed recovery/history context and agent decision
  support after ambiguous outcomes. It can corroborate or locate activity, but
  cannot authorize a duplicate payment.

When an external submission may have happened but the result is uncertain,
OneShot records `UNKNOWN` and reconciles. Missing Graph data never converts
`UNKNOWN` into permission to submit again.

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
state, provider identifiers and receipts, Arc state, and indexed evidence.
Reconciliation precedes any decision to retry payment when settlement state is
`UNKNOWN`.

### Recovery View

A derived, non-authoritative view assembled from durable OneShot records and
live indexed history, including The Graph. It helps operators and agents explain
and recover work but does not grant permission to create a Settlement.

## Decision test

Any design affecting retries or payments must answer:

1. What stable Business Intent does this Attempt belong to?
2. Which durable atomic transition grants the right to submit an external
   Settlement?
3. How is an ambiguous submission reconciled without a blind retry?
4. How do parallel workers converge on at most one committed Settlement?
5. Which evidence is authoritative, and which evidence is only a Recovery View?
