CREATE INDEX attempts_intent_order_idx
  ON attempts (business_intent_id, attempt_sequence);

CREATE INDEX evidence_intent_order_idx
  ON evidence_observations (business_intent_id, evidence_id);

CREATE INDEX outbox_pending_idx
  ON outbox_jobs (status, available_at, outbox_job_id);
