# OneShot Security Invariants

These rules fail closed. A feature, demo, or deadline does not override them.

## Settlement safety

- One Business Intent produces at most one committed Settlement.
- Persist a stable `business_intent_id` before any external effect.
- Use durable, atomic, concurrency-safe transitions for settlement ownership.
- A timeout, crash, disconnect, lost response, or provider error after possible
  submission creates `UNKNOWN`; reconcile before any payment retry.
- Never infer non-payment from an empty or delayed Graph result.
- Preserve a successful payment result even if a later supplier or API step
  fails.
- Do not offer a normal code path that bypasses OneShot state controls or Privy
  authorization.

## Money and authorization

- Store, compare, calculate, and serialize money as integer atomic units or
  `bigint`. Never use JavaScript floating point for monetary values.
- Validate asset, network, recipient, amount, and policy scope before signing or
  submitting.
- Privy denial, expired authorization, or an amount above policy produces no
  settlement.
- Default to testnet. A non-testnet operation requires explicit user
  authorization for that operation.

## Secrets and privacy

- Never log, display, persist in context files, commit, or transmit private keys,
  seed phrases, access tokens, API secrets, wallet credentials, signing material,
  or sensitive runtime configuration.
- Keep secrets in approved runtime secret stores or ignored local environment
  files. Commit only safe examples with placeholder values.
- Review staged and untracked files for secret material before every commit.
- FreePi receives only code, intended diffs, tests, public documentation, and
  non-sensitive validation evidence. It must not read or receive `.env*`, local
  credentials, wallet files, ignored files, or sensitive runtime configuration.
- If a review cannot be completed without sensitive data, the review fails. Do
  not send the data.

## Dependencies and boundaries

- Prefer official SDKs and primary documentation for Privy, Arc, and The Graph.
- Pin and review dependencies in line with repository conventions.
- Validate all untrusted external data at adapter boundaries.
- Treat provider and indexer output as evidence with explicit freshness and
  finality limits, not as implicit authorization.

## Required response to doubt

Stop external effects when identity, authorization, amount, network, prior
submission, or settlement state is ambiguous. Persist evidence, enter a safe
state, and reconcile or request human input.
