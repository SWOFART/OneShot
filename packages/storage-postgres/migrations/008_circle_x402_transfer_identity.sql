ALTER TABLE paid_api_requests
  ADD COLUMN provider_transfer_id text
    CHECK (
      provider_transfer_id IS NULL OR
      provider_transfer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );
