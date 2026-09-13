ALTER TABLE outbox_jobs
  DROP CONSTRAINT outbox_jobs_task_identifier_check;

ALTER TABLE outbox_jobs
  ADD CONSTRAINT outbox_jobs_task_identifier_check
  CHECK (task_identifier IN (
    'authorize_intent',
    'submit_settlement',
    'reconcile_intent',
    'fulfill_supplier_order',
    'capture_graph_evidence'
  ));

CREATE UNIQUE INDEX evidence_observations_intent_source_digest_idx
  ON evidence_observations (business_intent_id, source, digest)
  WHERE source = 'THE_GRAPH' AND digest LIKE 'graph-capture:%';
