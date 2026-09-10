# settlement-adapter-contract-v1

B04 handoff artifact. The production surface Coder A composes against, and the
list of things it deliberately does not do.

Implemented by `@oneshot/privy-adapter` and `@oneshot/arc-adapter`. Both build
and test with no implementation from the A or C lanes present; an automated
test asserts that no import reaches an A- or C-owned package.

## 1. Provided ports

| Port | Results |
| --- | --- |
| `AuthorizationPort.evaluate` | `AUTHORIZED`, `DENIED`, `UNAVAILABLE` |
| `SettlementPort.submit` | `CONFIRMED`, `DEFINITELY_NOT_SUBMITTED`, `POSSIBLY_SUBMITTED` |
| `EvidencePort.lookup` | `FINAL_SUCCESS`, `FINAL_REVERT`, `PENDING`, `NOT_FOUND`, `UNAVAILABLE` |

## 2. Required from the host

The adapter is stateless about settlement rights. A must supply:

- durable Business Intent and Attempt state;
- an atomic submission-ownership grant;
- request identity persisted across restarts.

## 3. Not provided

- Reconciliation decisions. The adapter reports; it does not decide to retry.
- External-index authority. Hashless discovery belongs to the provider-neutral
  recovery service. The current Arc Testnet runtime uses the configured
  `STUDIO_GRAPHQL` path; `SUBGRAPH_MCP` is optional when an officially served
  deployment exists. Both paths remain non-authoritative.
- Automatic transaction replacement.
- User interface.

## 4. Error taxonomy

The taxonomy turns on one question: **did the request reach the network?**

### Proven pre-broadcast, retry permitted

| Signal | Why it proves nothing was sent |
| --- | --- |
| `ENOTFOUND`, `EAI_AGAIN` | DNS never resolved; no connection opened |
| `ECONNREFUSED` | Peer refused the TCP handshake |
| TLS handshake failures | Failed before any application data was transmitted |
| HTTP 4xx except 429 | Provider rejected on its own terms without acting |

### Possibly submitted, retry never permitted

`ECONNRESET`, `ETIMEDOUT`, `EPIPE`, premature stream close, HTTP 429, HTTP 5xx,
truncated or malformed responses, lost success responses, process termination,
**and every unrecognized error**.

Two boundaries worth stating explicitly:

- **429 is ambiguous**, not a rejection. A rate limiter may reject before or
  after queuing the work.
- **A failed TLS handshake is pre-broadcast; an interrupted TLS connection is
  not.** The first cannot have delivered a request; the second may have.

An error this build has never seen is classified post-send. An unknown failure
cannot be proof that nothing happened, and treating it as proof is the mistake
that pays twice.

## 5. `NOT_FOUND` is not permission

Absent evidence can mean the transaction was never broadcast, or sits in a
mempool this node cannot see, or that the node is behind, or that it was
replaced. `permitsResubmission` returns `false` for every observation, and
there is no code path that turns an absent result into a settlement right.

Only bound, final evidence terminates an intent. A receipt that exists for our
hash but does not prove our settlement is contradictory and stays unbound
rather than being resolved by guess.

## 6. Drift hardening

The settlement boundary depends on values living outside this repository: a
Privy policy, a wallet, a chain, a token, a cap. Any can change with no commit
and no review.

`detectDrift` compares observed identity against a reviewed baseline across
`policyDigest`, `policyId`, `walletId`, `walletAddress`, `chainId`,
`tokenContract`, and `settlementCapAtomic`. Any difference fails closed, and
`assertNoDrift` throws rather than returning a value a caller could ignore.

A **lowered** cap is reported as drift too. Judging whether a change is benign
is not this module's job; detecting that the deployment no longer matches what
was reviewed is.

## 7. Webhooks

Disabled. A webhook is an unauthenticated inbound claim about a payment.
Signature verification against Privy's scheme is unproven here, and polling
through `EvidencePort` is complete on its own, so enabling one would add attack
surface without adding capability.

## 8. Redaction report

- Provider error text never crosses the package boundary. Callers receive an
  `AdapterError` code and a sanitized message.
- Evidence detail strings are truncated to 200 characters, because provider
  errors can embed whole response bodies.
- Redaction is deny-by-default on key name and on value shape, with named
  hash-bearing fields exempt from the 32-byte-hex rule so transaction hashes,
  block hashes, topics, and fingerprints survive as evidence.
- No module in either package reads `ONESHOT_PRIVY_APP_SECRET`.

## 9. Current qualification status

The historical B04 fixture gaps below are resolved for the current testnet
evidence bundle:

- Privy is `QUALIFIED` for the recorded testnet policy denials and allowed
  settlement.
- Arc is `QUALIFIED` for the recorded testnet USDC settlement and bound receipt
  evidence.
- The Graph is `NOT VERIFIED`: the live Studio path exists, but a fresh trace
  showing meaningful data use by the model and deterministic core is pending.

Per `.agents/skills/sponsor-qualification/SKILL.md`, the Privy and Arc claims
are backed by the sanitized records in
[`LIVE_EVIDENCE.md`](LIVE_EVIDENCE.md) and the
[C06 qualification report](../../packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md).

## 10. Evidence refresh instructions

For a future evidence refresh:

1. Follow `docs/settlement/PROVIDER_SETUP.md` and verify the reviewed Privy and
   Arc identities.
2. Execute the negative policy suite and confirm zero broadcasts and zero
   settlements before any allowed testnet settlement.
3. Capture only sanitized evidence and update
   [`LIVE_EVIDENCE.md`](LIVE_EVIDENCE.md) and the C06 qualification report.
4. Keep The Graph `NOT VERIFIED` unless a fresh Studio trace proves meaningful
   model/core use through the active `STUDIO_GRAPHQL` path.

Replacing fixtures must not change any classifier or verifier result. If it
does, the model was wrong and the difference is the finding.
