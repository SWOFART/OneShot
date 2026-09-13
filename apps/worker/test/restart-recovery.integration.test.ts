import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { IntentLedger, migrate } from '@oneshot/storage-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  executeAuthorizeIntent,
  executeSubmitSettlement,
  RestartRunner,
  runStartupRecovery,
} from '../src/index.js';

const describePostgres = process.env.TEST_POSTGRES === '1' ? describe : describe.skip;

const sampleRequest = {
  business_intent_id: 'intent-restart-recovery-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '5000000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Restart recovery invoice',
};

describePostgres('Startup recovery and restart safety (A04.1, A04.2)', () => {
  let container!: StartedPostgreSqlContainer;
  let pool!: Pool;
  let attemptCounter = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 20 });
    await migrate(pool);
  });

  afterEach(async () => {
    await pool.query(
      'TRUNCATE operational_metric_events, outbox_jobs, evidence_observations, settlements, attempts, resumable_jobs, paid_api_requests, business_intents RESTART IDENTITY',
    );
    attemptCounter = 0;
  });

  afterAll(async () => {
    if (typeof pool !== 'undefined') await pool.end();
    if (typeof container !== 'undefined') await container.stop();
  });

  const newLedger = () =>
    new IntentLedger(pool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `attempt-restart-${++attemptCounter}`,
    });

  it('detects orphaned SUBMITTING intent, routes to UNKNOWN, and enqueues reconciliation', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-recov-1');

    const workerOptions = {
      pool,
      ledger,
      settlementPort: {
        async submit() {
          return {
            kind: 'CONFIRMED' as const,
            provider_reference_id: 'ref-1',
            transaction_hash: `0x${'a'.repeat(64)}`,
            block_number: '1',
            transfer_log_index: 0,
          };
        },
      },
    };

    // Step 1: Authorize to READY
    await executeAuthorizeIntent(sampleRequest.business_intent_id, workerOptions);
    const readyIntent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(readyIntent?.state).toBe('READY');

    // Step 2: Atomic CAS claim sets state to SUBMITTING
    const claim = await ledger.claimSubmission(sampleRequest.business_intent_id);
    expect(claim.claimed).toBe(true);
    const submittingIntent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(submittingIntent?.state).toBe('SUBMITTING');

    // Step 3: Simulated crash happens right here! (Port is not called or result lost)
    // On reboot/startup recovery, recover orphaned submissions with lease expired:
    const recoveredCount = await runStartupRecovery(workerOptions, 0); // 0ms lease expiry
    expect(recoveredCount).toBe(1);

    // Step 4: Verify intent transitioned to UNKNOWN
    const recoveredIntent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(recoveredIntent?.state).toBe('UNKNOWN');

    // Step 5: Verify reconciliation outbox job was enqueued
    const outboxJobs = await pool.query<{ task_identifier: string; status: string }>(
      'SELECT task_identifier, status FROM outbox_jobs WHERE business_intent_id = $1',
      [sampleRequest.business_intent_id],
    );
    expect(outboxJobs.rows.some((j) => j.task_identifier === 'reconcile_intent')).toBe(true);

    // Step 6: Invariant proof: Lease expiry never grants a new settlement submission
    const secondClaim = await ledger.claimSubmission(sampleRequest.business_intent_id);
    expect(secondClaim.claimed).toBe(false);

    const settlements = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM settlements WHERE business_intent_id = $1',
      [sampleRequest.business_intent_id],
    );
    expect(settlements.rows[0]?.count).toBe('0');
  });

  it('safe disable stops new submission ownership while read and health remain active', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-disable-1');

    let portCalled = false;
    const disabledOptions = {
      pool,
      ledger,
      config: {
        submissionsDisabled: true,
      },
      settlementPort: {
        async submit() {
          portCalled = true;
          return {
            kind: 'CONFIRMED' as const,
            provider_reference_id: 'ref-dis',
            transaction_hash: `0x${'b'.repeat(64)}`,
            block_number: '2',
            transfer_log_index: 0,
          };
        },
      },
    };

    // Step 1: Authorize to READY
    await executeAuthorizeIntent(sampleRequest.business_intent_id, disabledOptions);
    const readyIntent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(readyIntent?.state).toBe('READY');

    // Step 2: Attempt submit settlement with safe disable active
    await executeSubmitSettlement(sampleRequest.business_intent_id, disabledOptions);

    // Port must NOT have been called, and state must remain READY without claim
    expect(portCalled).toBe(false);
    const stateAfterDisable = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(stateAfterDisable?.state).toBe('READY');

    // Status reads, recovery view, and DB ping remain fully functional
    const recoveryView = await ledger.getRecoveryView(sampleRequest.business_intent_id);
    expect(recoveryView).toBeDefined();
    await expect(ledger.ping()).resolves.toBeUndefined();
  });

  it('RestartRunner manages lifecycle and periodic recovery sweep', async () => {
    const ledger = newLedger();
    const runner = new RestartRunner({
      workerOptions: {
        pool,
        ledger,
        settlementPort: {
          async submit() {
            return {
              kind: 'CONFIRMED' as const,
              provider_reference_id: 'ref-rr',
              transaction_hash: `0x${'c'.repeat(64)}`,
              block_number: '3',
              transfer_log_index: 0,
            };
          },
        },
      },
      leaseExpiryIntervalMs: 50,
      maxJobsPerCycle: 10,
    });

    expect(runner.isRunning).toBe(false);
    const { startupRecovered } = await runner.start();
    expect(runner.isRunning).toBe(true);
    expect(startupRecovered).toBe(0);

    await runner.stop();
    expect(runner.isRunning).toBe(false);
  });
});
