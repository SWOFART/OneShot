import type { AuthorizationResult, SettlementResult } from '@oneshot/contracts';
import { formatStateTransitionLog } from '@oneshot/domain';
import { RECOVERY_JOB_VERSION, type RecoveryJob } from '@oneshot/reconciliation';
import type { TaskList } from 'graphile-worker';
import type { WorkerOptions } from './types.js';

export async function executeAuthorizeIntent(
  businessIntentId: string,
  options: WorkerOptions,
): Promise<AuthorizationResult | undefined> {
  const intent = await options.ledger.getIntent(businessIntentId);
  if (!intent || intent.state !== 'AUTHORIZING') return undefined;

  const authResult: AuthorizationResult = options.authorizationPort
    ? await options.authorizationPort.authorize(intent)
    : { kind: 'AUTHORIZED' };

  await options.ledger.completeAuthorization(businessIntentId, intent.version, authResult);
  return authResult;
}

export async function executeSubmitSettlement(
  businessIntentId: string,
  options: WorkerOptions,
): Promise<boolean> {
  // A04.2 — Safe disable: audited configuration switch that stops new submission ownership
  if (options.config?.submissionsDisabled || process.env.ONESHOT_SUBMISSIONS_DISABLED === 'true') {
    formatStateTransitionLog({
      correlationId: `audit-disable-${businessIntentId}`,
      businessIntentId,
      fromState: 'READY',
      toState: 'READY',
      reason: 'Submission ownership paused by safe disable configuration switch',
      timestamp: new Date().toISOString(),
    });
    return false;
  }

  // A03.2 — Submission ownership CAS: READY -> SUBMITTING
  // The database transaction ends before calling the port!
  const claim = await options.ledger.claimSubmission(businessIntentId);
  if (!claim.claimed) return true;

  formatStateTransitionLog({
    correlationId: claim.correlationId,
    businessIntentId,
    fromState: 'READY',
    toState: 'SUBMITTING',
    attemptId: claim.attemptId,
    timestamp: new Date().toISOString(),
  });

  // Persist the exact provider request identity before crossing the external
  // effect boundary. Recovery must reuse it after a lost response or restart.
  if (options.settlementPort.getSubmissionIdentity) {
    try {
      const identity = options.settlementPort.getSubmissionIdentity(claim.intent);
      await options.ledger.persistProviderRequestIdentity(claim.attemptId, identity);
    } catch {
      await options.ledger.completeSubmission(businessIntentId, claim.attemptId, {
        kind: 'DEFINITELY_NOT_SUBMITTED',
        reason: 'Provider request identity could not be persisted before submission',
      });
      return true;
    }
  }

  // A03.3 — Call settlement port outside database transaction
  let result: SettlementResult;
  try {
    result = await options.settlementPort.submit(claim.intent, {
      attemptId: claim.attemptId,
      correlationId: claim.correlationId,
    });
  } catch (error) {
    // Failure during submission enters UNKNOWN to prevent blind retries
    result = {
      kind: 'POSSIBLY_SUBMITTED',
      reason: error instanceof Error ? error.message : 'Unknown settlement failure',
    };
  }

  // Result persistence: COMMITTED, FAILED_SAFE, or UNKNOWN
  await options.ledger.completeSubmission(businessIntentId, claim.attemptId, result);

  const targetState =
    result.kind === 'CONFIRMED'
      ? 'COMMITTED'
      : result.kind === 'DEFINITELY_NOT_SUBMITTED'
        ? 'FAILED_SAFE'
        : 'UNKNOWN';

  formatStateTransitionLog({
    correlationId: claim.correlationId,
    businessIntentId,
    fromState: 'SUBMITTING',
    toState: targetState,
    attemptId: claim.attemptId,
    reason: result.kind !== 'CONFIRMED' ? result.reason : undefined,
    timestamp: new Date().toISOString(),
  });
  return true;
}

function submissionsDisabled(options: WorkerOptions): boolean {
  return (
    options.config?.submissionsDisabled === true ||
    process.env.ONESHOT_SUBMISSIONS_DISABLED === 'true'
  );
}

function authorizationRetryDelayMs(options: WorkerOptions): number {
  const configured = options.config?.authorizationRetryDelayMs ?? 5_000;
  return Number.isFinite(configured) && configured >= 0 ? configured : 5_000;
}

export async function runStartupRecovery(
  options: WorkerOptions,
  leaseDurationMs = options.config?.submissionLeaseMs ?? 30000,
): Promise<number> {
  const staleBefore = new Date(Date.now() - leaseDurationMs);
  const recovered = await options.ledger.recoverOrphanedSubmissions(staleBefore);
  for (const orphan of recovered) {
    formatStateTransitionLog({
      correlationId: `recovery-${orphan.businessIntentId}`,
      businessIntentId: orphan.businessIntentId,
      fromState: 'SUBMITTING',
      toState: 'UNKNOWN',
      reason: 'Orphaned SUBMITTING detected on startup recovery or lease expiry',
      timestamp: new Date().toISOString(),
    });
  }
  return recovered.length;
}

export async function resumeSafeJobs(
  options: WorkerOptions,
  maxJobs = 100,
): Promise<{ readonly recoveredOrphans: number; readonly drainedJobs: number }> {
  const recoveredOrphans = await runStartupRecovery(options);
  const drainedJobs = await drainOutboxJobs(options, maxJobs);
  return { recoveredOrphans, drainedJobs };
}

export async function executeReconcileIntent(
  businessIntentId: string,
  options: WorkerOptions,
  eventId?: string,
): Promise<void> {
  const intent = await options.ledger.getIntent(businessIntentId);
  if (!intent) return;
  if (intent.state !== 'UNKNOWN' && intent.state !== 'SUBMITTING') return;

  if (options.recoveryService) {
    const job: RecoveryJob = {
      schemaVersion: RECOVERY_JOB_VERSION,
      eventId: eventId ?? `reconcile:${businessIntentId}:${intent.version}`,
      businessIntentId,
      requestedAt: new Date().toISOString(),
    };
    const result = await options.recoveryService.handle(job);
    const updatedIntent = await options.ledger.getIntent(businessIntentId);
    const toState = updatedIntent?.state ?? intent.state;
    formatStateTransitionLog({
      correlationId: `reconcile-${businessIntentId}`,
      businessIntentId,
      fromState: intent.state,
      toState,
      reason: `Reconciliation result: ${result.status}, disposition: ${result.pack?.reconciliationCommand.commandType ?? 'HELD'}`,
      timestamp: new Date().toISOString(),
    });
  }
}

/** Supplier fulfillment is deliberately reachable only from a committed job.
 * It cannot change payment state or construct a replacement settlement. */
export async function executeFulfillSupplierOrder(
  jobId: string,
  deliveryAttempt: number,
  options: WorkerOptions,
): Promise<void> {
  if (!options.jobLedger || !options.supplier) return;
  const work = await options.jobLedger.deliveryWork(jobId, deliveryAttempt);
  if (!work) return;
  try {
    const existing = await options.supplier.getResult(work.orderReference);
    const result = existing ?? (await options.supplier.fulfillOrder(work.orderReference));
    await options.jobLedger.completeDelivery(jobId, deliveryAttempt, result);
  } catch {
    // Preserve COMMITTED and make recovery explicit. A later resume may only
    // retrieve/fulfill this original supplier order, never pay again.
    await options.jobLedger.failDelivery(jobId, deliveryAttempt);
  }
}

export function createTaskList(options: WorkerOptions): TaskList {
  return {
    authorize_intent: async (payload) => {
      const { business_intent_id } = payload as { business_intent_id: string };
      const result = await executeAuthorizeIntent(business_intent_id, options);
      if (result?.kind === 'UNAVAILABLE') {
        throw new Error('Authorization unavailable; queue retry required');
      }
    },
    submit_settlement: async (payload) => {
      const { business_intent_id } = payload as { business_intent_id: string };
      const processed = await executeSubmitSettlement(business_intent_id, options);
      if (!processed) throw new Error('Settlement submission is disabled; queue retry required');
    },
    reconcile_intent: async (payload) => {
      const { business_intent_id, event_id } = (payload ?? {}) as {
        business_intent_id?: string;
        event_id?: string;
      };
      if (business_intent_id) {
        await executeReconcileIntent(business_intent_id, options, event_id);
      }
    },
    fulfill_supplier_order: async (payload) => {
      const { job_id, delivery_attempt } = payload as {
        job_id?: string;
        delivery_attempt?: number;
      };
      if (
        job_id &&
        typeof delivery_attempt === 'number' &&
        Number.isSafeInteger(delivery_attempt) &&
        delivery_attempt > 0
      ) {
        await executeFulfillSupplierOrder(job_id, delivery_attempt, options);
      }
    },
  };
}

export async function drainOutboxJobs(options: WorkerOptions, maxJobs = 100): Promise<number> {
  let processed = 0;
  while (processed < maxJobs) {
    const client = await options.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        outbox_job_id: string;
        business_intent_id: string;
        task_identifier: string;
      }>(
        `SELECT outbox_job_id, business_intent_id, task_identifier
        FROM outbox_jobs
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY available_at ASC, outbox_job_id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      );
      const job = result.rows[0];
      if (!job) {
        await client.query('COMMIT');
        break;
      }

      // Leave submission work pending while paused. A disabled handler must
      // never be acknowledged as delivered or the intent can be stranded in
      // READY after the pause is lifted.
      if (job.task_identifier === 'submit_settlement' && submissionsDisabled(options)) {
        await client.query('COMMIT');
        break;
      }

      // Keep the row lock until the handler has completed. A process kill or
      // thrown handler rolls this transaction back, leaving the job PENDING
      // for restart recovery instead of losing it as falsely DELIVERED.
      let authorizationResult: AuthorizationResult | undefined;
      if (job.task_identifier === 'authorize_intent') {
        authorizationResult = await executeAuthorizeIntent(job.business_intent_id, options);
      } else if (job.task_identifier === 'submit_settlement') {
        await executeSubmitSettlement(job.business_intent_id, options);
      } else if (job.task_identifier === 'reconcile_intent') {
        await executeReconcileIntent(job.business_intent_id, options);
      } else if (job.task_identifier === 'fulfill_supplier_order') {
        const payload = await client.query<{
          payload: { job_id?: string; delivery_attempt?: number };
        }>('SELECT payload FROM outbox_jobs WHERE outbox_job_id = $1', [job.outbox_job_id]);
        const { job_id: jobId, delivery_attempt: deliveryAttempt } = payload.rows[0]?.payload ?? {};
        if (
          jobId &&
          typeof deliveryAttempt === 'number' &&
          Number.isSafeInteger(deliveryAttempt) &&
          deliveryAttempt > 0
        ) {
          await executeFulfillSupplierOrder(jobId, deliveryAttempt, options);
        }
      } else {
        throw new Error(`Unsupported outbox task: ${job.task_identifier}`);
      }
      if (authorizationResult?.kind === 'UNAVAILABLE') {
        const retryAt = new Date(Date.now() + authorizationRetryDelayMs(options));
        await client.query(
          "UPDATE outbox_jobs SET available_at = $1 WHERE outbox_job_id = $2 AND status = 'PENDING'",
          [retryAt, job.outbox_job_id],
        );
      } else {
        await client.query("UPDATE outbox_jobs SET status = 'DELIVERED' WHERE outbox_job_id = $1", [
          job.outbox_job_id,
        ]);
      }
      await client.query('COMMIT');
      processed += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return processed;
}
