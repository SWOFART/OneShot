import type { AuthorizationResult, SettlementResult } from '@oneshot/contracts';
import { formatStateTransitionLog } from '@oneshot/domain';
import { RECOVERY_JOB_VERSION, type RecoveryJob } from '@oneshot/reconciliation';
import type { TaskList } from 'graphile-worker';
import type { WorkerOptions } from './types.js';

export async function executeAuthorizeIntent(
  businessIntentId: string,
  options: WorkerOptions,
): Promise<void> {
  const intent = await options.ledger.getIntent(businessIntentId);
  if (!intent || intent.state !== 'AUTHORIZING') return;

  const authResult: AuthorizationResult = options.authorizationPort
    ? await options.authorizationPort.authorize(intent)
    : { kind: 'AUTHORIZED' };

  await options.ledger.completeAuthorization(businessIntentId, intent.version, authResult);
}

export async function executeSubmitSettlement(
  businessIntentId: string,
  options: WorkerOptions,
): Promise<void> {
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
    return;
  }

  // A03.2 — Submission ownership CAS: READY -> SUBMITTING
  // The database transaction ends before calling the port!
  const claim = await options.ledger.claimSubmission(businessIntentId);
  if (!claim.claimed) return;

  formatStateTransitionLog({
    correlationId: claim.correlationId,
    businessIntentId,
    fromState: 'READY',
    toState: 'SUBMITTING',
    attemptId: claim.attemptId,
    timestamp: new Date().toISOString(),
  });

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

export function createTaskList(options: WorkerOptions): TaskList {
  return {
    authorize_intent: async (payload) => {
      const { business_intent_id } = payload as { business_intent_id: string };
      await executeAuthorizeIntent(business_intent_id, options);
    },
    submit_settlement: async (payload) => {
      const { business_intent_id } = payload as { business_intent_id: string };
      await executeSubmitSettlement(business_intent_id, options);
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

      // Keep the row lock until the handler has completed. A process kill or
      // thrown handler rolls this transaction back, leaving the job PENDING
      // for restart recovery instead of losing it as falsely DELIVERED.
      if (job.task_identifier === 'authorize_intent') {
        await executeAuthorizeIntent(job.business_intent_id, options);
      } else if (job.task_identifier === 'submit_settlement') {
        await executeSubmitSettlement(job.business_intent_id, options);
      } else if (job.task_identifier === 'reconcile_intent') {
        await executeReconcileIntent(job.business_intent_id, options);
      } else {
        throw new Error(`Unsupported outbox task: ${job.task_identifier}`);
      }
      await client.query("UPDATE outbox_jobs SET status = 'DELIVERED' WHERE outbox_job_id = $1", [
        job.outbox_job_id,
      ]);
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
