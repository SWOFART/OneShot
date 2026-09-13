# Payment prepare regression

## Goal

Restore the authenticated web console path that prepares a user-wallet payment
after quote approval, so approval reaches `POST /v1/jobs/user-wallet/prepare`
and can continue to wallet submission.

## Acceptance criteria

- Privy-authenticated console passes `usePrivyUserWallet()` into `App`.
- A connected-wallet approval uses the existing prepare and submit client
  methods; it does not fall back to `POST /v1/jobs`.
- Existing server-wallet/API composition remains available when no browser
  wallet is supplied.
- No settlement or idempotency boundary is changed.

## Evidence and assumption

- Commit `91a7744` removed the `usePrivyUserWallet()` call from
  `apps/web/src/main.tsx`.
- `JobWorkspace` intentionally calls `start()` only when `userWallet` is
  absent; otherwise it calls `prepareUserWalletJob()`.
- The fix is limited to the current repository and branch
  `fix/restore-user-wallet-prepare`.

## Non-goals

- No API, storage, settlement, or worker changes.
- No changes to payment amounts, recipients, or provider idempotency logic.
