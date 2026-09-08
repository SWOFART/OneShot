# Session Context: B06 Privy and Arc Sponsor Evidence

## Date/time

- UTC: 2026-09-08T20:54:57Z

## User goal

Deliver milestone B06: a sanitized, repeatable evidence bundle proving Privy is
the real authorization boundary and Arc Testnet the working USDC settlement
rail, plus mainnet-readiness evidence that claims no mainnet transaction.

## Original prompt/request

"ok go on with b06", immediately after B05 passed Gate A, CI, and Gate B on
pull request #36.

## Assumptions

- B06 depends on B05, which is reviewed and green but not merged. Its content is
  evidence scripts and documentation over the B01-B04 adapters, so it needs no
  code from the B05 UI slice. The branch is cut from current `develop` and
  touches no path B05 touches.
- The live Arc Testnet run has already happened. `docs/settlement/LIVE_EVIDENCE.md`
  on `develop` reads `LIVE_RUN` and `evidence/c06/sanitized-proof.json` records
  the settlement, both policy denials, and the recovery drill. B06 re-verifies
  that recorded evidence rather than executing a new live payment.
- Identifiers already committed to `develop` (Privy app, wallet, and policy ids,
  execution wallet, recipient, transaction hash) are treated as sanitized public
  testnet values. B06 adds no new provider identifiers and no secrets.
- The Graph verdict stays with Lane C. B06 supplies only Privy and Arc inputs to
  `sponsor-qualification`, per the milestone non-goals.

## Plan

1. Build a typed evidence engine in `packages/testkit-settlement` that validates
   a sanitized proof bundle and fails closed on tampering.
2. B06.1 Privy evidence: policy scope enforced on the normal path, both denial
   dimensions present, zero broadcasts and zero settlements.
3. B06.2 Arc evidence: bind request identity to transaction hash, receipt,
   exact Transfer log, token, recipient, amount, and explorer URL.
4. B06.3 Ambiguity: lost response reaches `UNKNOWN`, reconciles to the original
   transaction, and replays without a second settlement.
5. B06.4 Mainnet readiness: profile disabled and valueless, preflight and
   rollback artifacts present, human-approval gate recorded.
6. B06.5 Sanitization audit over the published bundle.
7. B06.6 Qualification input with explicit `NOT VERIFIED` where live proof is
   absent.
8. Publish the handoff artifact, run local checks, Gate A, PR, CI, Gate B.

## Finding: redaction contract vs public evidence fields

Running the adapter redaction contract over the evidence bundle surfaced two
false positives, both on fields the bundle cannot drop:

- `token_contract` matches the `token` key-name pattern but is a public ERC-20
  address.
- `explorer_url` embeds the 32-byte transaction hash, which the value rule flags
  outside its hash-bearing field list.

`packages/arc-adapter/src/redaction.ts` was left untouched rather than widened
for every caller. B06 keeps a narrow, shape-checked allowlist for exactly these
two names, so the audit still rejects a credential arriving under any other key.

## Key decisions

- B06 verifies recorded evidence; it does not execute a new live settlement. A
  second live payment would spend testnet funds to prove nothing the recorded
  run does not already prove, and executing payments is not an agent action.
- Every check fails closed. A missing field, an unbound identity, a nonzero
  broadcast count on a denial, or an enabled mainnet profile is a failure, never
  a warning.
- The evidence engine is library code with tests rather than a shell script, so
  tampered-bundle cases can be asserted directly.

## Files/components touched

- `packages/testkit-settlement/`: evidence engine, CLI entry point, tests.
- `evidence/b06/`: sanitized evidence index.
- `docs/settlement/`: B06 handoff artifact.

## Commands/checks

- `git checkout -b milestone/b06-sponsor-evidence origin/develop` - PASS
- `git rev-parse origin/develop` - `0291b684e187557e13c47869359cbab445ee4148`
- `pnpm --filter @oneshot/testkit-settlement build` - PASS
- `pnpm --filter @oneshot/testkit-settlement lint` - PASS
- `pnpm --filter @oneshot/testkit-settlement test` - PASS (132 tests, 76 new)
- `pnpm --filter @oneshot/testkit-settlement evidence:b06` - PASS (all five
  sections; Privy QUALIFIED, Arc QUALIFIED, The Graph NOT VERIFIED)
- `pnpm lint` - PASS
- `pnpm typecheck` - PASS
- `pnpm test` - PASS (50 files, 649 tests; 47 files and 605 tests on the base)
- `pnpm check:generated` - PASS
- `pnpm validate:fixtures` - PASS
- `npx markdownlint-cli2` on the added Markdown - PASS
- `npx prettier --check` over the changed paths - PASS

## External-doc findings

- `docs/settlement/LIVE_EVIDENCE.md` (`develop`): status `LIVE_RUN`, transaction
  `0x72ab1e93c95e5295b2dfa9b3abc8cc5130330f3bba07ad18af2c5b7784f57cf7`, block
  `61116056`, transfer log index `23`, explorer host `testnet.arcscan.app`.
- `.agent/SPONSOR_REQUIREMENTS.md`: Privy must constrain the normal path, Arc
  needs a real testnet settlement, and the Launch track needs a disabled
  mainnet profile with rollback artifacts.
- `.agents/skills/sponsor-qualification/SKILL.md`: report `QUALIFIED`,
  `NOT QUALIFIED`, or `NOT VERIFIED` per sponsor; never promote fixtures.

## Test matrix cases selected

From `.agent/TEST_MATRIX.md`:

- Privy denial: both recorded denial dimensions must show zero broadcasts and
  zero settlements, and a tampered nonzero count must fail the bundle.
- Lost payment response: the recorded drill must show `UNKNOWN` reconciling to
  the original transaction with zero replacement submissions.
- Same request twice: the replay record must still bind exactly one settlement.

## Unresolved questions

- None.

## Git and PR state

- Branch: `milestone/b06-sponsor-evidence`
- Base: `develop` (`0291b684e187557e13c47869359cbab445ee4148`)
- Commit: uncommitted
- PR: not created
- CI: not applicable

## Review gates

- Gate A (round 1): FAIL on tree `83d9e8091f8fe093bfdac83681187560ba1504b9`.
  Tool `free-pi-cli`, model not exposed by platform. One blocking finding, now
  fixed: the sanitization walk recursed into arrays but returned early for
  scalar elements, so a PEM key or JWT nested in an array passed the audit while
  the same value under a scalar key failed. Verified fixed: array-nested PEM,
  JWT, and bearer values now all fail, and a clean bundle still passes.
  Three non-blocking findings were also fixed rather than carried:
  1. An allowlisted URL skipped value scanning; the URL is now scanned with the
     transaction hash stripped, so a JWT in a query string fails.
  2. `receipt: null` crashed the CLI with a TypeError; every field the verifier
     reads is now validated at parse time, so a malformed receipt is a
     structured parse failure.
  3. `privy.cap-exceeded` and `privy.denied-recipient-differs` were skipped when
     a drill omitted its optional fields; those fields are now required for
     their dimension, so a tampered record cannot pass unexamined.
     The fourth non-blocking finding was addressed by renaming the check: with no
     raw receipt in the bundle, `arc.transfer-identity-recorded` states what it
     actually verified instead of claiming receipt re-verification.
- Gate A (round 2): PASS on tree `1f9f5ed88d25ae9cc18c7ad2ed4f809f72247cbc`.
  Tool `free-pi-cli`, model not exposed by platform. No blocking findings. Three
  non-blocking findings, all fixed rather than carried:
  1. Receipt validation stopped at "non-null object", so a receipt missing
     `from` or `logs` threw a TypeError from inside the adapter instead of a
     listed failure. `parseReceipt` now checks every field the verifier reads,
     and the round-one context claim above was corrected to match.
  2. `checkMainnetReadiness` read the compile-time profile, so the enabled and
     carries-values directions were unassertable. The profile is now injected
     and four tampered-profile tests cover those directions.
  3. `evidence:b06` ran the compiled output without building, so a stale `dist`
     gave an outdated answer. The script now builds first.
     The reviewer's residual risk about the allowlist accepting any short public
     value under `token_contract` is also closed: that field now requires an EVM
     address shape.
- Gate A (round 3): PASS on tree `e9f89504866075b50201814f4a5da0d494c29028`,
  committed as `310daf16703957650e6422420fddedc3b627ab59` and pushed. Tool
  `free-pi-cli`, model `deepseek-v4-flash`. No blocking findings; three
  non-blocking carried at the time.
- CI on `310daf16`: ESLint and TypeScript PASS, Markdown and Mermaid PASS,
  Workers Builds PASS, repository-policy PASS.
- Gate B (round 1): PASS on head `310daf16703957650e6422420fddedc3b627ab59`,
  head tree equal to the Gate A tree. Tool `free-pi-cli`, model
  `deepseek-v4-flash`. No blocking findings; three non-blocking, now all closed:
  1. `parseReceipt` validated receipt-level fields but not log entries. Every
     log is now checked for `address`, `data`, `logIndex`, and a string
     `topics` array, so a malformed log is a listed failure rather than a
     TypeError from inside the adapter.
  2. The permissive `isPublicIdentifier` guard would have accepted a short
     JWT-shaped string under `token_symbol` or `explorer_host`. It is deleted;
     every allowlisted field now has a specific guard (EVM address, asset
     symbol, decimal count, hostname, https URL).
  3. The `OFFLINE_PROTECTED` versus `UNPUBLISHED` terminology drift in
     `docs/settlement/LIVE_EVIDENCE.md` is fixed on its own branch, since it is
     a separate concern from this milestone.
- Gate A (round 4): PASS on tree `b1ce189b054c95e84bbb50ce8b1b1eab403bff54`.
  No blocking findings. Two non-blocking; the first is fixed:
  1. `ambiguity.replay-idempotent` matched `REPLAY` as a substring, so a
     tampered `NOT_REPLAYED` would have passed a check asserting the opposite.
     It is now an exact match against `REPLAYED` or `RETURNED_EXISTING_RESULT`,
     with tests for the tampered spellings.
  2. `isAssetSymbol` still admits up to twelve alphanumeric characters. No
     credential shape fits that (a JWT is longer and contains dots), so this is
     noted rather than tightened further.
- Gate A (round 5): NOT RUN for the tree that closes the round-four finding.
- Gate B (round 2): NOT RUN

## Handoff/next steps

1. Implement B06.1 through B06.6.
2. Run package-local and root checks.
3. Capture `git write-tree`, run Gate A, commit, push, open a PR, wait for CI,
   run Gate B.
