INSERT INTO outbox_jobs (
  business_intent_id, job_key, task_identifier, payload, available_at, created_at
)
SELECT
  settlements.business_intent_id,
  'graph-evidence:' || settlements.business_intent_id || ':backfill',
  'capture_graph_evidence',
  jsonb_build_object(
    'business_intent_id', settlements.business_intent_id,
    'transaction_hash', settlements.transaction_hash,
    'block_number', settlements.block_number
  ),
  now(),
  now()
FROM settlements
WHERE NOT EXISTS (
  SELECT 1
  FROM evidence_observations
  WHERE evidence_observations.business_intent_id = settlements.business_intent_id
    AND evidence_observations.source = 'THE_GRAPH'
)
AND NOT EXISTS (
  SELECT 1
  FROM outbox_jobs existing
  WHERE existing.business_intent_id = settlements.business_intent_id
    AND existing.task_identifier = 'capture_graph_evidence'
)
ON CONFLICT (job_key) DO NOTHING;
