CREATE TABLE business_intents (
  business_intent_id text PRIMARY KEY,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  recipient text NOT NULL CHECK (recipient ~ '^0x[0-9a-f]{40}$'),
  amount_atomic text NOT NULL CHECK (amount_atomic ~ '^(0|[1-9][0-9]{0,77})$'),
  asset text NOT NULL CHECK (asset = 'USDC'),
  network text NOT NULL CHECK (network = 'eip155:5042002'),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 256),
  state text NOT NULL CHECK (state IN ('AUTHORIZING', 'READY', 'SUBMITTING', 'COMMITTED', 'FAILED_SAFE', 'UNKNOWN', 'REJECTED')),
  version integer NOT NULL CHECK (version >= 1),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE attempts (
  attempt_id text PRIMARY KEY,
  business_intent_id text NOT NULL REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
  attempt_sequence integer NOT NULL CHECK (attempt_sequence >= 1),
  stage text NOT NULL CHECK (stage IN ('AUTHORIZING', 'READY', 'SUBMITTING', 'COMMITTED', 'FAILED_SAFE', 'UNKNOWN', 'REJECTED')),
  correlation_id text NOT NULL,
  request_body_fingerprint text NOT NULL CHECK (request_body_fingerprint ~ '^[0-9a-f]{64}$'),
  token_contract text NOT NULL CHECK (token_contract = '0x3600000000000000000000000000000000000000'),
  method text NOT NULL CHECK (method = 'transfer'),
  native_value_atomic text NOT NULL CHECK (native_value_atomic = '0'),
  privy_idempotency_key text,
  privy_reference_id text,
  wallet_id text,
  policy_id text,
  sanitized_error text,
  created_at timestamptz NOT NULL,
  UNIQUE (business_intent_id, attempt_sequence)
);

CREATE TABLE settlements (
  business_intent_id text PRIMARY KEY REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
  provider_reference_id text NOT NULL,
  provider_transaction_id text,
  transaction_hash text NOT NULL UNIQUE CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_nonce text CHECK (transaction_nonce IS NULL OR transaction_nonce ~ '^(0|[1-9][0-9]{0,77})$'),
  block_number text NOT NULL CHECK (block_number ~ '^(0|[1-9][0-9]{0,77})$'),
  receipt_block_hash text CHECK (receipt_block_hash IS NULL OR receipt_block_hash ~ '^0x[0-9a-f]{64}$'),
  receipt_status text CHECK (receipt_status IS NULL OR receipt_status IN ('SUCCESS', 'REVERT')),
  memo_id text CHECK (memo_id IS NULL OR memo_id ~ '^0x[0-9a-f]{64}$'),
  call_data_hash text CHECK (call_data_hash IS NULL OR call_data_hash ~ '^0x[0-9a-f]{64}$'),
  transfer_transaction_hash text CHECK (transfer_transaction_hash IS NULL OR transfer_transaction_hash ~ '^0x[0-9a-f]{64}$'),
  transfer_log_index integer NOT NULL CHECK (transfer_log_index >= 0),
  verified_memo_transfer_same_transaction boolean,
  committed_at timestamptz NOT NULL
);

CREATE TABLE evidence_observations (
  evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_intent_id text NOT NULL REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('ONESHOT', 'PRIVY', 'ARC', 'THE_GRAPH', 'LLM')),
  authority_class text NOT NULL CHECK (authority_class IN ('AUTHORITATIVE', 'OBSERVATION', 'ADVISORY')),
  retrieved_at timestamptz NOT NULL,
  digest text NOT NULL CHECK (char_length(digest) BETWEEN 1 AND 128),
  block_number text CHECK (block_number IS NULL OR block_number ~ '^(0|[1-9][0-9]{0,77})$'),
  freshness text CHECK (freshness IS NULL OR freshness IN ('FRESH', 'LAGGING', 'UNHEALTHY', 'UNAVAILABLE', 'UNKNOWN_FRESHNESS'))
);

CREATE TABLE outbox_jobs (
  outbox_job_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_intent_id text NOT NULL REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
  job_key text NOT NULL UNIQUE,
  task_identifier text NOT NULL CHECK (task_identifier IN ('authorize_intent', 'reconcile_intent')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'DISABLED')),
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);
