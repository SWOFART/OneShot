ALTER TABLE outbox_jobs
  DROP CONSTRAINT outbox_jobs_task_identifier_check;

ALTER TABLE outbox_jobs
  ADD CONSTRAINT outbox_jobs_task_identifier_check
  CHECK (task_identifier IN (
    'authorize_intent',
    'submit_settlement',
    'reconcile_intent',
    'fulfill_supplier_order'
  ));

CREATE TABLE resumable_jobs (
  job_id text PRIMARY KEY CHECK (job_id ~ '^job_[0-9a-f]{64}$'),
  workspace_id text NOT NULL CHECK (char_length(workspace_id) BETWEEN 1 AND 128),
  tool_id text NOT NULL CHECK (tool_id = 'team-report-v1'),
  task_key text NOT NULL CHECK (char_length(task_key) BETWEEN 1 AND 128),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  business_intent_id text NOT NULL UNIQUE REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
  supplier_order_reference text NOT NULL UNIQUE CHECK (char_length(supplier_order_reference) BETWEEN 1 AND 128),
  supplier_quote jsonb NOT NULL,
  delivery_state text NOT NULL CHECK (delivery_state IN ('NOT_REQUESTED', 'PENDING', 'AVAILABLE', 'RETRIEVAL_FAILED')),
  delivery_attempt integer NOT NULL DEFAULT 0 CHECK (delivery_attempt >= 0),
  result_reference text,
  result_payload jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (workspace_id, tool_id, task_key)
);

CREATE INDEX resumable_jobs_workspace_updated_idx
  ON resumable_jobs (workspace_id, updated_at DESC);

ALTER TABLE settlements
  ADD CONSTRAINT settlements_transaction_log_unique UNIQUE (transaction_hash, transfer_log_index);

CREATE TABLE wallet_activity_observations (
  observation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id text NOT NULL CHECK (char_length(workspace_id) BETWEEN 1 AND 128),
  source text NOT NULL CHECK (source = 'THE_GRAPH'),
  freshness text NOT NULL CHECK (freshness IN ('FRESH', 'LAGGING', 'UNHEALTHY', 'UNAVAILABLE', 'UNKNOWN_FRESHNESS')),
  coverage_note text NOT NULL CHECK (char_length(coverage_note) BETWEEN 1 AND 256),
  observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX wallet_activity_observations_workspace_idx
  ON wallet_activity_observations (workspace_id, observation_id DESC);
