ALTER TABLE resumable_jobs
  ADD COLUMN payment_mode text NOT NULL DEFAULT 'SERVER_PRIVY'
    CHECK (payment_mode IN ('SERVER_PRIVY', 'USER_WALLET')),
  ADD COLUMN payer_wallet text
    CHECK (payer_wallet IS NULL OR payer_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  ADD COLUMN payment_transaction_hash text
    CHECK (payment_transaction_hash IS NULL OR payment_transaction_hash ~ '^0x[0-9a-fA-F]{64}$');

ALTER TABLE resumable_jobs
  ADD CONSTRAINT resumable_jobs_payment_binding_check
  CHECK (
    (payment_mode = 'SERVER_PRIVY' AND payer_wallet IS NULL)
    OR (payment_mode = 'USER_WALLET' AND payer_wallet IS NOT NULL)
  );
