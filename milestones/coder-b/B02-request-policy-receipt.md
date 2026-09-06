# B02 — Canonical Request, Policy, and Receipt Verification

Owner: Coder B
Branch: `milestone/b02-request-policy-receipt`
Depends on: B01 only
Next: B03 immediately after closure

## Outcome

Pure adapter logic builds one byte-stable ERC-20 request, expresses the expected fail-closed Privy policy, and confirms settlement only from an exact final Arc receipt and Transfer log.

## Small tasks

### B02.1 — ERC-20 calldata builder

- Encode `transfer(address,uint256)` for the normalized recipient and `bigint` amount.
- Require exact chain/token/method, zero native transaction value, and six-decimal semantic boundary.
- Add golden calldata and request-fingerprint vectors.

### B02.2 — Privy request identity

- Build the request with persisted idempotency key, stable reference ID, deterministic body, and correlation metadata.
- Reject reuse of one key with a different body fingerprint.
- Document the 24-hour provider idempotency window as supplemental only.

### B02.3 — Policy fixture

- Define default-deny restrictions for chain, token contract, method selector, recipient, amount cap, and zero native value.
- Add deny fixtures for each wrong dimension and expired/invalid authorization.
- Produce policy identity/fingerprint expectations for readiness.

### B02.4 — Receipt verifier

- Verify transaction hash, chain, sender/wallet, token address, receipt status, block, recipient, amount, and unique Transfer log identity.
- Require exactly the expected transfer; unrelated logs do not count.
- Treat success status without matching Transfer as unresolved/failure, never confirmed.

### B02.5 — Outcome classifier skeleton

- Map official response fixtures to `CONFIRMED`, `DEFINITELY_NOT_SUBMITTED`, or `POSSIBLY_SUBMITTED` exhaustively.
- Unknown/malformed/partial response fails to `POSSIBLY_SUBMITTED`.
- Keep pure classification free of network and durable-state behavior.

## Acceptance evidence

- Golden inputs produce byte-identical calldata, body fingerprint, idempotency/reference identity, and expected receipt result.
- Wrong chain/token/method/recipient/value/amount is rejected before submission.
- `status: 0` is final revert; `status: 1` without exact Transfer is not confirmed.
- Timeout/lost/truncated/malformed fixtures never become safe retry.

## Handoff artifact

Publish `settlement-adapter-contract-v1`, policy fixture/digest, canonical request fixtures, receipt corpus, classifier simulator, and verification command.

## No-wait continuation

Start B03 in offline mode. Human provisioning may happen asynchronously.

## Non-goals

No production credentials, domain state mutation, Graph query, or frontend.
