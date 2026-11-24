# Session Context: B06 Privy and Arc Sponsor Evidence

## Date/time

- UTC: 2026-09-08T20:54:57Z

## User goal

Deliver milestone B06: a sanitized, repeatable evidence bundle proving Privy is
the real authorization boundary and Arc Testnet the working USDC settlement
rail, plus mainnet-readiness evidence that claims no mainnet transaction.

## Original prompt/request

"ok go on with b06", immediately after B05 passed CI, CI, and human review on
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
8. Publish the handoff artifact, run local checks, CI, PR, CI, human review.

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

## Handoff/next steps

1. Implement B06.1 through B06.6.
2. Run package-local and root checks.
3. Capture `git write-tree`, run CI, commit, push, open a PR, wait for CI,
   run human review.
