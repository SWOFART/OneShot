# Live settlement evidence

B03 handoff artifact.

## Status

`LIVE_NOT_RUN`

No real Arc Testnet settlement has been executed. No Privy application,
execution wallet, policy, or funded testnet account has been provisioned for
this build.

This is the expected state. B03 closes on its offline criteria, and
`milestones/coder-b/B03-live-settlement-harness.md` states that live
availability does not block packet closure. Live execution is tracked as
project Gate P4 evidence.

## Why it has not run

Provisioning requires a human: creating a Privy application, holding an app
secret, attaching a wallet policy, and funding a testnet account are all
actions an agent must not perform. `docs/settlement/PROVIDER_SETUP.md` is the
procedure; nobody has run it yet.

## What is proven without it

The offline harness exercises the complete adapter workflow against simulated
providers with a deterministic broadcast counter:

- Every policy denial family produces **zero** external broadcasts.
- Duplicate delivery, ten sequential retries, and ten parallel workers sharing
  durable state each produce **exactly one** broadcast.
- Process restart is exercised against file-backed durable state: an attempt is
  written to disk before the provider is called, and a restarted worker reading
  that file is refused a second submission right, including after an outcome
  that was never learned.
- An ambiguous outcome does not grant a fresh submission right, so the
  dangerous retry after a possible payment cannot happen.
- Every ambiguous or unrecognized provider response classifies as
  `POSSIBLY_SUBMITTED`.
- Sanitized fixtures reproduce the same verifier and classifier results as the
  raw responses they were captured from.

Command:

```bash
cd packages/testkit-settlement && npm run check
```

## What is not proven

Simulators prove the adapter's logic, not the provider's behaviour. Still
unverified against reality:

- That a Privy policy configured as `buildExpectedPolicy` describes actually
  denies each wrong dimension. The policy shape is modelled from Privy's
  documentation, not observed.
- That Arc Testnet receipts and Transfer logs have the exact shape the verifier
  expects.
- That the documented Privy wallet and policy identifier formats match the
  conservative shape check in the readiness probe.
- Real latency, rate limits, and error bodies.

Per `.agents/skills/sponsor-qualification/SKILL.md`, no sponsor or
qualification claim may be made from fixtures alone. Until this file records a
sanitized live transaction, the Privy and Arc integration claims are
`NOT VERIFIED`.

## To update this file

Run `docs/settlement/PROVIDER_SETUP.md`, execute one allowed settlement, then
replace the status above with `LIVE_RUN` plus the sanitized transaction hash,
block number, explorer URL, and the observed denial counts. Capture the
responses through `captureReceiptFixture` so no credential reaches the
repository.
