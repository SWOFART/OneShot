# MCP user-wallet payment flow

## Goal

Make personal Arc Testnet payments non-custodial: OneShot prepares a durable
intent and quote, the connected Privy/MetaMask wallet sends USDC directly to
the recipient, and OneShot verifies the returned transaction hash against the
Arc receipt and exact USDC Transfer log.

## Scope

- Active MCP tools are `arc_payment` (prepare) and `arc_payment_submit`
  (bind/verify hash).
- The active MCP path uses `USER_WALLET` jobs and never a server signer.
- The web workspace refuses to fall back to the server-wallet payment path when
  no browser wallet is connected.
- The old corporate autonomous-agent server-wallet configuration is retained
  with `НЕ УДАЛЯТЬ` comments but is not wired into the active personal flow.

## Safety invariants

- The payer wallet is durably bound before a hash is accepted.
- The returned calldata pins Arc Testnet USDC, recipient, amount, and payer.
- A transaction hash is recorded once; a different hash is rejected.
- Receipt verification checks chain, token contract, payer, recipient, amount,
  receipt status, and the matching Transfer log.
- UNKNOWN is reconciled with the same hash; no replacement transaction is
  submitted by OneShot.

## Acceptance

- MCP prepare returns a quote, payer-bound job, exact ERC-20 calldata, and
  `next_action: SIGN`.
- MCP submit returns COMMITTED only after exact receipt verification.
- Duplicate prepare and submit calls replay the same durable payment.
- Focused API and web tests, typecheck, lint, formatting, and diff checks pass.
- No live payment or production deployment is performed in this change.
