# B03 — Offline-Complete and Live-Ready Settlement Harness

Owner: Coder B
Forecast: 3 working days
Branch: `milestone/b03-live-settlement-harness`
Depends on: B02 only
Next: B04 immediately after offline closure

## Outcome

A standalone harness proves the complete adapter workflow with sanitized fixtures and, when a human provides approved credentials/funds, captures one real policy-constrained Arc Testnet settlement. Live availability does not block offline packet closure.

## Small tasks

### B03.1 — Human setup guide

- Guide a human through Privy application, execution wallet, owner/key quorum, policy attachment, recipient/cap choice, Arc funding, and approved secret storage.
- Confirm before external mutation; hide secret input.
- Add a read-only verification mode and cleanup/rotation notes.

### B03.2 — Standalone harness

- Accept a frozen SettlementPort request fixture.
- Persist/request exact identity locally in ignored test runtime state before submission.
- Emit only normalized, sanitized port results and evidence.

### B03.3 — Policy negative suite

- Exercise wrong chain, contract, method, recipient, above cap, non-zero native value, and expired/invalid authorization.
- Count external committed transfers and prove every denial is zero.

### B03.4 — Allowed settlement

- Submit one approved ERC-20 USDC transfer on Arc Testnet through Privy.
- Poll provider/Arc evidence, verify final receipt and Transfer, and capture sanitized IDs/explorer URL.
- Ensure rerunning the same intent/key/body does not create another settlement.

### B03.5 — Live-to-fixture conversion

- Convert safe response shapes into synthetic/sanitized fixtures.
- Strip headers, credentials, signatures, private metadata, and unnecessary payload fields.
- Verify fixtures reproduce classifier and receipt results offline.

## Acceptance evidence

Offline closure:

- Full harness flow and all allow/deny/error families pass with checked fixtures and deterministic call counter.
- Setup guide, redaction checks, and live command dry-run pass.

Additional Gate P4 evidence when available:

- One real allowed Arc Testnet transfer is final and verified.
- Every real policy denial produces zero settlement.

## Handoff artifact

Publish harness version, sanitized fixture pack, exact offline command, human-only live procedure, and a `LIVE_NOT_RUN` or sanitized live-evidence statement.

## No-wait continuation

Mark B03 `DONE` when offline criteria pass, even if live setup is pending. Start B04; track live execution as Gate P4 evidence.

## Non-goals

No mainnet, automatic funding, unattended policy mutation, domain database write, or qualification claim from fixtures alone.
