ALTER TABLE attempts
  DROP CONSTRAINT attempts_method_check;

ALTER TABLE attempts
  ADD CONSTRAINT attempts_method_check CHECK (method IN ('transfer', 'x402'));

ALTER TABLE attempts
  ADD COLUMN provider_kind text NOT NULL DEFAULT 'DIRECT_ARC'
    CHECK (provider_kind IN ('DIRECT_ARC', 'CIRCLE_X402')),
  ADD COLUMN provider_transaction_hash text
    CHECK (provider_transaction_hash IS NULL OR provider_transaction_hash ~ '^0x[0-9a-f]{64}$');

CREATE TABLE paid_api_requests (
  business_intent_id text PRIMARY KEY REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
  workspace_id text NOT NULL CHECK (char_length(workspace_id) BETWEEN 1 AND 128),
  task_key text NOT NULL CHECK (char_length(task_key) BETWEEN 1 AND 128),
  tool_id text NOT NULL CHECK (tool_id = 'circle-x402-api-v1'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  resource_url text NOT NULL CHECK (char_length(resource_url) BETWEEN 1 AND 2048),
  method text NOT NULL CHECK (method = 'GET'),
  quote_payload jsonb NOT NULL,
  quote_recipient text NOT NULL CHECK (quote_recipient ~ '^0x[0-9a-fA-F]{40}$'),
  quote_amount_atomic text NOT NULL CHECK (quote_amount_atomic ~ '^(0|[1-9][0-9]{0,77})$'),
  quote_x402_version integer NOT NULL CHECK (quote_x402_version = 2),
  quote_max_timeout_seconds integer NOT NULL CHECK (quote_max_timeout_seconds BETWEEN 1 AND 604900),
  response_payload jsonb,
  provider_transaction_hash text
    CHECK (provider_transaction_hash IS NULL OR provider_transaction_hash ~ '^0x[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (workspace_id, task_key)
);

CREATE INDEX paid_api_requests_workspace_updated_idx
  ON paid_api_requests (workspace_id, updated_at DESC);
