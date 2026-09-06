# B04 — Provider Ambiguity and Production Adapter Pack

Owner: Coder B
Effort: L — roughly one to two focused weeks
Branch: `milestone/b04-ambiguity-integration`
Depends on: B03 only
Next: hold B05 until project Gate P4

## Outcome

Production-ready adapter entry points conservatively classify realistic provider/RPC failures, support idempotent evidence lookup, and pass A’s composition contract through a simulator-hosted integration test.

## Small tasks

### B04.1 — Submission failure taxonomy

- Inject DNS failure, refusal, TLS/network interruption, timeout, 429/5xx, truncated/malformed response, and lost success response.
- Mark only documented pre-broadcast proof as `DEFINITELY_NOT_SUBMITTED`.
- Route every doubtful case to `POSSIBLY_SUBMITTED`.

### B04.2 — Transaction lifecycle lookup

- Implement Privy transaction lookup and Arc receipt/log lookup using persisted identities.
- Return `FINAL_SUCCESS`, `FINAL_REVERT`, `PENDING`, `NOT_FOUND`, or `UNAVAILABLE` with sanitized evidence.
- Never treat `NOT_FOUND` as resubmission permission.

### B04.3 — Pending/evicted/mismatch cases

- Cover long pending, replaced/evicted visibility, wrong nonce/hash, wrong chain/token/wallet, multiple/mismatched Transfer logs, and contradictory provider/RPC states.
- Preserve ambiguity when evidence cannot be bound to the exact request.

### B04.4 — Policy/readiness hardening

- Recheck expected policy identity/fingerprint and Arc identity at startup and before sensitive use as appropriate.
- Fail closed on changed policy, wallet, network, token, or cap.
- Keep optional webhooks disabled unless plan availability and signature verification are proven; polling remains complete.

### B04.5 — Production entry point

- Export only frozen port interfaces and sanitized errors.
- Add simulator-hosted contract integration tests and compatibility metadata.
- Ensure no import reaches A/C internal packages.

## Acceptance evidence

- Every injected failure has an explicit result and no ambiguous case is safe retry.
- Repeated lookup is idempotent and causes zero submissions.
- Adapter restarts preserve request identity supplied by the caller.
- Package-local lint/type/test/build and contract compatibility pass without A/C implementations.
- Live-only gaps are listed for P4 and do not masquerade as completed evidence.

## Handoff artifact

Publish production package version, error taxonomy, lookup fixture pack, compatibility manifest, redaction report, and P4 replacement instructions.

## No-wait continuation

B04 closes against the contract host. Do not start production frontend until P4. While held, strengthen provider fixtures, upgrade tests, and live evidence as focused tasks.

## Non-goals

No reconciliation decision, Graph authority, automatic transaction replacement, or UI.
