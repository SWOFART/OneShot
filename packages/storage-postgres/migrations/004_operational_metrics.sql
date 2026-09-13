CREATE TABLE operational_metric_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_intent_id text NOT NULL REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN (
      'DUPLICATE_REQUEST',
      'CAS_CONFLICT',
      'POLICY_DENIAL',
      'PROVIDER_ERROR',
      'RECONCILIATION_OUTCOME'
    )
  ),
  outcome text,
  created_at timestamptz NOT NULL
);

CREATE INDEX operational_metric_events_type_idx
  ON operational_metric_events (event_type, outcome, created_at);
