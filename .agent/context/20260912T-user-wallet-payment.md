# User-wallet payment implementation

## Goal

Make the Team Report browser flow charge the connected Privy Ethereum wallet,
not the server-configured Privy execution wallet, while preserving OneShot's
durable one-intent/at-most-one-settlement invariant.

## Acceptance criteria

- Prepare a durable `USER_WALLET` job before any external transaction.
- Bind the reviewed payer address, token, chain, recipient, and integer amount.
- Have the browser wallet submit the exact ERC-20 transfer after explicit review.
- Verify the Arc receipt and exactly one expected Transfer log before commit.
- Persist the transaction hash before verification and refuse a different hash for
  the same attempt.
- Treat missing, delayed, or mismatched receipt evidence as non-final/UNKNOWN;
  never submit another transaction automatically.
- Keep the existing server-wallet and Circle x402 paths unchanged.
- Do not include credentials, tokens, private keys, or wallet secrets.

## Scope and non-goals

In scope: contracts/OpenAPI, Postgres job binding, API receipt verification,
Privy browser transaction submission, focused tests, and migration 008.

Out of scope: deployment, live payment submission, automatic retry of any
existing job, and changing the server-wallet path used by other demos.

## Selected test matrix

- Normal user-wallet job: prepare, submit, exact receipt, one committed settlement.
- Lost/delayed receipt: hash is durable and state is UNKNOWN; same hash can be
  checked again, but a different transaction is refused.
- Provider/RPC unavailable: no state transition to no-payment and no retry.
- Existing server-wallet delivery tests remain green.
- API boundary coverage includes UNKNOWN, receipt mismatch, different-hash,
  non-user-wallet, and payer-conflict refusals.
- PostgreSQL-gated coverage includes READY payer binding, no server authorization
  outbox, durable hash persistence, UNKNOWN transition, and hash conflict.
- Arc receipt-source coverage includes finalized receipt mapping, missing receipt,
  malformed hash, and fixed-chain enforcement.

## Branch state

Branch: `fix/privy-native-login`.

Prior hardening commit: `a8727bb` (`fix: harden Privy settlement response handling`).
The user-wallet feature is staged as a candidate delta pending fresh Gate A
review and commit. Local non-container validation passes; PostgreSQL integration
execution is unavailable on this workstation because no container runtime is
available.
