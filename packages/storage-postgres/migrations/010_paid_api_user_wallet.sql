ALTER TABLE paid_api_requests
  ADD COLUMN payment_mode text NOT NULL DEFAULT 'SERVER_PRIVY'
    CHECK (payment_mode IN ('SERVER_PRIVY', 'USER_WALLET')),
  ADD COLUMN payer_wallet text
    CHECK (payer_wallet IS NULL OR payer_wallet ~ '^0x[0-9a-fA-F]{40}$');

ALTER TABLE paid_api_requests
  ADD CONSTRAINT paid_api_payment_binding_check
  CHECK (
    (payment_mode = 'SERVER_PRIVY' AND payer_wallet IS NULL)
    OR (payment_mode = 'USER_WALLET' AND payer_wallet IS NOT NULL)
  );
