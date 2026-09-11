# R5 release and submission checklist

Status: **preparation only**. This packet does not claim fresh sponsor
qualification, a live R4 run, or a completed video.

## Immutable candidate

Run from the short-lived release branch and bind the packet to one commit and
tree:

```powershell
$env:ONESHOT_RELEASE_HEAD = '<full-head-sha>'
$env:ONESHOT_RELEASE_TREE = '<full-tree-sha>'
pnpm release:check
```

The command checks the branch, exact optional identities, public release
artifacts, and required package scripts. It does not read secrets, deploy, or
replace Gate A, required CI, Gate B, sponsor evidence, or human review.

## Automated evidence

- [x] R0–R3 product code and tests are carried by the stacked parent branches.
- [x] R4 response-loss hook is default-off, Arc Testnet-only, and covered by
      the durable UNKNOWN/no-second-submit tests.
- [x] `demo:r4` is offline by default and sanitizes its output.
- [ ] A fresh authorized R4 Arc Testnet run captures a real supplier result,
      receipt, and Studio GraphQL recovery trace.
- [ ] PostgreSQL Testcontainers integration is rerun in an environment with a
      container runtime.

## Required review evidence

- [x] R4 PR #79 is open and ready for human review with green required CI and
      FreePi Gate A/B evidence.
- [ ] This R5 branch receives its own FreePi Gate A and Gate B verdicts bound to
      the same exact tree.
- [ ] A human reviews the packet and performs any merge; agents do not merge.

## Sponsor-facing status

| Sponsor   | Current status                           | What may be claimed now                                                                                                   | Still required                                               |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Privy     | `QUALIFIED` for documented testnet claim | Corporate wallet authorization, scoped policy denials, and the normal settlement path documented in the existing evidence | Keep the production/mainnet boundary fail-closed             |
| Arc       | `QUALIFIED` for documented testnet claim | Real Arc Testnet USDC settlement and receipt verification in existing evidence                                            | Fresh R4 purchase/recovery capture if used in the submission |
| The Graph | `NOT VERIFIED`                           | Studio GraphQL implementation and historical observations                                                                 | Fresh live Studio trace showing material agent/core use      |

Do not call the R4 offline rehearsal live evidence. Do not claim Subgraph MCP
for the Arc deployment when Studio GraphQL is the active transport. See the
[sponsor qualification report](../packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md).

## Public submission packet

- [x] Public README, architecture diagram, API contract, operations runbook,
      and demo instructions are linked from the repository.
- [x] Mainnet readiness remains disabled and fail-closed.
- [ ] Verify the current ETHOnline prize pool, registration mode, and deadline
      immediately before submission.
- [ ] Add a short 2–4 minute video only when the team is ready to record it;
      this branch intentionally ships no video artifact.
- [ ] Attach only sanitized live evidence; never attach tokens, wallet
      credentials, private URLs, or unredacted runtime output.

## Stop conditions

Stop the release if the exact head/tree changes, a required check is pending or
fails, Graph evidence is empty/stale/contradictory, or the supplier result is
not bound to the original intent and payment. Any such case remains
`NOT VERIFIED` or `HOLD`; it is never converted into a sponsor claim by this
checklist.
