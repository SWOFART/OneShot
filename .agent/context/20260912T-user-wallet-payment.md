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
Privy browser transaction submission, focused tests, and migration 009 (after syncing develop's migration 008).

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

## Follow-up: live proof projection

The live user-wallet job reached `COMMITTED`, the supplier result became
available, and the public Arc explorer showed a successful 1 USDC transfer from
the connected wallet to the reviewed recipient. The API submit and subsequent
intent/recovery reads returned HTTP 200 on the active API revision.

The Payment Proof panel still displayed `Needs verification` because its
projection only accepted `ARC` authoritative evidence. The user-wallet submit
path durably inserts an `ONESHOT` authoritative observation after the direct Arc
receipt verifier confirms the exact transfer. The same response also omitted
payment mode, so the generic policy panel rendered `Policy: Not reported`.

Follow-up goal: expose the existing durable payment mode on intent reads, treat
an authoritative OneShot observation as verified only for a committed
`USER_WALLET` intent (preserving the strict Arc-evidence path for other modes),
and render user-wallet policy as not applicable. No payment or deployment action
is part of this code change.

## Follow-up implementation state

Implemented locally: generated contracts expose optional `IntentResponse.payment_mode`;
PostgreSQL intent projection loads it from the existing job binding; the
settlement proof projection recognizes the user-wallet commit's authoritative
OneShot observation; and the policy panel says `Not applicable` for direct
connected-wallet payments. Existing server-wallet verification remains
Arc-authoritative only. Added UI, contract, and PostgreSQL-gated regression
coverage; no migration or external payment behavior changed.

Validation: focused settlement UI 211/211, contracts 39/39, full suite
82 files/1075 tests, browser acceptance 8/8, typecheck, lint, format, generated
contract check, and diff check pass. The PostgreSQL-gated suite remains
environment-dependent on a container runtime as documented above.

Gate A: a fresh `npx.cmd free-pi-cli` process was started for the staged
candidate, but it emitted an unbounded interactive trace and exited without
the required structured verdict. No Gate A PASS is claimed; no push, PR, or
deployment was performed.
