# Session Context: Arc transfer demo lane

## Goal

Make the first end-to-end demo visibly settle a small Arc Testnet USDC invoice
from the existing Privy-controlled execution wallet to a configured second
wallet, then expose the transaction and result in the job flow. Circle/x402 is
deferred to a later supplier adapter.

## Scope

- Make the team-operated supplier quote recipient and amount explicit runtime
  configuration; no production wallet or secret is committed.
- Keep the existing Privy policy, OneShot Business Intent, and Arc settlement
  path unchanged.
- Generate a stable task key in the UI so users do not invent idempotency keys.
- Add a non-chargeable quote endpoint and require the cabinet to show amount,
  recipient, network, and expiry before the approval request.
- Project committed settlement identity into JobView and show a validated Arc
  Testnet explorer link in Jobs.
- Add focused supplier/config/ledger/UI tests and documentation.

## Non-goals

- No Circle Gateway/x402 integration in this branch.
- No mainnet activation, arbitrary recipient input, or browser-controlled
  payment signing.
- No claim of a third-party production supplier; the receiver is a labelled
  team-operated testnet wallet until a later supplier is selected.

## Safety assumptions

- `ONESHOT_SUPPLIER_RECIPIENT` must equal an address in the worker's
  `ONESHOT_RECIPIENT_ALLOWLIST`.
- The demo amount is integer atomic USDC and must remain below the Privy policy
  cap; the deployment operator chooses the actual testnet amount.
- A committed settlement remains authoritative even if result delivery fails;
  retries only retrieve the original result.

## Validation and gates

- Applicable matrix cases: normal job, duplicate request, conflicting task
  payload, payment denial/amount boundary, downstream delivery failure, and
  resume with zero additional settlement.
- Gate A required before commit; Gate B required after the PR head is green.
- Live Arc payment requires human deployment configuration and an explicitly
  authorized testnet run; local tests must not broadcast funds.
