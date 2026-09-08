# B06 — Privy and Arc sponsor evidence

Lane B handoff artifact. Everything here is re-verifiable from the repository
with one command, against evidence that was captured from a real Arc Testnet
run rather than a fixture.

## Verify the bundle

```bash
pnpm --filter @oneshot/testkit-settlement evidence:b06
```

The script builds before it runs, so it cannot report a stale result from an
old `dist`.

Add `--json` for a machine-readable report. The command exits non-zero if any
section fails, so a broken claim cannot be published quietly. Its checks are
covered by `packages/testkit-settlement/test/b06-evidence.test.ts`, which
asserts the failure direction too: a tampered denial counter, a denial drill
that omits the amounts it compared, an unbound explorer link, a credential
nested inside an array or a URL query string, a replacement submission, a
malformed receipt, and an enabled or value-carrying mainnet profile all fail the
bundle.

## Evidence index

| Item                              | Location                                          |
| --------------------------------- | ------------------------------------------------- |
| Machine-readable index            | `evidence/b06/evidence-index.json`                |
| Recorded live proof               | `evidence/c06/sanitized-proof.json`               |
| Live run narrative                | `docs/settlement/LIVE_EVIDENCE.md`                |
| Verification engine               | `packages/testkit-settlement/src/b06-evidence.ts` |
| Authorization adapter             | `packages/privy-adapter/src/adapters.ts`          |
| Policy identity hardening         | `packages/privy-adapter/src/hardening.ts`         |
| Receipt and Transfer verification | `packages/arc-adapter/src/receipt.ts`             |
| Network profiles                  | `packages/arc-adapter/src/profiles.ts`            |
| Provider setup procedure          | `docs/settlement/PROVIDER_SETUP.md`               |
| Safe disable and rollback         | `docs/SAFE_DISABLE_RUNBOOK.md`                    |

## B06.1 — Privy is the authorization boundary

Privy holds the execution wallet and evaluates every settlement against a
scoped policy. The adapter never signs locally and exposes no path that skips
policy evaluation.

The denial drills are the load-bearing part. A refusal only counts here when
the broadcast and settlement counters were observed at zero, because "Privy
said no" says nothing on its own about whether a transaction reached the chain.

| Drill                  | Input                                                                          | Provider response           | Broadcasts | Settlements |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------- | ---------- | ----------- |
| Unauthorized recipient | `0x1111111111111111111111111111111111111111`, absent from the policy allowlist | HTTP 400 `policy_violation` | 0          | 0           |
| Above cap              | `2000000` atomic units against a `1000000` cap                                 | HTTP 400 `policy_violation` | 0          | 0           |
| Authorized path        | `1000000` atomic units to the allowlisted recipient                            | signed and broadcast        | 1          | 1           |

The on-chain nonce stayed at `0` across both denials, so the refusals happened
before anything reached the network.

## B06.2 — Arc Testnet is the working settlement rail

One real ERC-20 USDC transfer, bound to the request that authorized it.

| Property           | Value                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Network            | `eip155:5042002` (pinned `arc-testnet` profile)                                                     |
| Token              | `0x3600000000000000000000000000000000000000`                                                        |
| Amount             | `1000000` atomic units (1.000000 USDC)                                                              |
| Recipient          | `0xa605EE031E41f04f8e193059a39A24407f83677c`                                                        |
| Transaction        | `0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7`                                |
| Block              | `61116056`                                                                                          |
| Transfer log index | `23`                                                                                                |
| Explorer           | <https://testnet.arcscan.app/tx/0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7> |

The verifier checks the binding, not the label: network and token must equal the
pinned profile, the amount must be a canonical integer, and the explorer link
must be https, on an allowed host, and contain this exact transaction hash. When a raw receipt is present in the bundle it is re-run through `verifyReceipt`,
which requires the expected `Transfer(from, to, value)` log from the configured
token at the recorded index. The published bundle carries no raw receipt, so
that check reports honestly as a recorded-identity check rather than claiming a
chain-level re-verification it did not perform.

## B06.3 — Ambiguity resolves to the original transaction

The local success response was dropped after a possible broadcast.

| Step                          | Observed                                                    |
| ----------------------------- | ----------------------------------------------------------- |
| State after the lost response | `UNKNOWN`                                                   |
| Reconciliation                | read-only Arc receipt lookup bound the original transaction |
| Final state                   | `COMMITTED`                                                 |
| Replacement submissions       | 0                                                           |
| Replay of the same intent     | returned the existing settlement                            |
| Settlements for the intent    | exactly 1                                                   |

## B06.4 — Mainnet readiness without a mainnet transaction

**No mainnet transaction exists and none is claimed.**

The `arc-mainnet` profile is disabled, marked `UNPUBLISHED`, and carries no
chain ID, RPC URL, explorer, or token value. Readiness is proven by the absence
of usable values, not by a flag: a profile that is merely `enabled: false` while
holding a chain ID and an RPC endpoint is one config edit away from spending
real money.

Activation requires all of:

1. Official Arc mainnet values published by Circle and pinned by a human.
2. Explicit human authorization for real-value activation.
3. The readiness probe re-verifying the live chain ID before first use.

Deployment and rollback artifacts verified present: `docs/SAFE_DISABLE_RUNBOOK.md`,
`docs/SERVER_RUNTIME.md`, `docs/settlement/SETTLEMENT_CONFIG_V1.md`,
`docs/settlement/PROVIDER_SETUP.md`, and `Dockerfile.api`.

## B06.5 — Sanitization audit

The published bundle is held to the adapter's own redaction contract
(`packages/arc-adapter/src/redaction.ts`): forbidden key names, credential-shaped
values, JWTs, bearer tokens, and PEM private keys all fail the audit, at every
level of the bundle. Scalars nested inside arrays are scanned like any other
value, and an allowlisted URL is scanned beyond its host and transaction hash,
so a credential cannot ride along in a query string.

Two public fields need a narrow, documented exemption from the generic rules,
because those rules cannot tell them apart from credentials by shape alone:

- `token_contract` matches the `token` key-name pattern, but is a public ERC-20
  contract address.
- `explorer_url` embeds the 32-byte transaction hash, which the value rule flags
  outside its hash-bearing field list.

Both are load-bearing evidence — removing them would leave a bundle that no
longer proves which asset moved or where to verify it. The exemption is from the
generic rule only: each value must still hold the public shape it claims
(`explorer_url` must be an https URL with no embedded credentials), and the
explorer link is separately bound to this transaction in B06.2. The exemption
lives in `packages/testkit-settlement/src/b06-evidence.ts` rather than in the
adapter, so the shared redaction contract is not weakened for other callers.

## B06.6 — Qualification input

Input for the `sponsor-qualification` skill. Lane B publishes no final verdict.

| Sponsor   | Status         | Basis                                                                                                          |
| --------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| Privy     | `QUALIFIED`    | Policy constrains the normal path; both denial dimensions settled zero with zero broadcasts; live run recorded |
| Arc       | `QUALIFIED`    | Real ERC-20 USDC settlement on Arc Testnet with verified Transfer identity; mainnet disabled and unpinned      |
| The Graph | `NOT VERIFIED` | Lane C owns this verdict; out of scope for B06 by milestone non-goal                                           |

Both `QUALIFIED` statuses are computed, not asserted: they downgrade to
`NOT VERIFIED` automatically if any section fails or if the recorded status is
not `LIVE_RUN`.

## Limitations

- Testnet only. Arc Mainnet stays disabled and unpinned, and no mainnet
  transaction is claimed.
- The live evidence is one recorded run per drill. B06 re-verifies that record
  rather than re-executing a payment; a second live settlement would spend
  testnet funds to prove nothing new.
- Denial coverage is one drill per dimension, not a continuous suite.
- Policy identity is re-checked at startup and before sensitive use, not on
  every request.
- The Graph recovery path is `NOT VERIFIED` at the time of writing; see
  `docs/settlement/LIVE_EVIDENCE.md` for the current indexer limitation.
