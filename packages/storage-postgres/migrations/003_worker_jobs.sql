ALTER TABLE outbox_jobs
  DROP CONSTRAINT outbox_jobs_task_identifier_check;

ALTER TABLE outbox_jobs
  ADD CONSTRAINT outbox_jobs_task_identifier_check
  CHECK (task_identifier IN ('authorize_intent', 'submit_settlement', 'reconcile_intent'));
