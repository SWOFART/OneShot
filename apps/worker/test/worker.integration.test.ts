import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { IntentLedger, migrate } from '@oneshot/storage-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  drainOutboxJobs,
  executeAuthorizeIntent,
  executeSubmitSettlement,
  runConcurrencyTest,
  type SettlementPort,
} from '../src/index.js';

const childWorkerScript = resolve(fileURLToPath(import.meta.url), '../child-worker-process.mjs');

const describePostgres = process.env.TEST_POSTGRES === '1' ? describe : describe.skip;

const sampleRequest = {
  business_intent_id: 'intent-worker-integration-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '2000000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Integration worker invoice',
};

describePostgres('Atomic at-most-once worker (A03)', () => {
  let container!: StartedPostgreSqlContainer;
  let pool!: Pool;
  let attemptCounter = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 25 });
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
      nextAttemptId: () => `attempt-w-${++attemptCounter}`,
    });

  it('normal job: transitions AUTHORIZING -> READY -> SUBMITTING -> COMMITTED with exactly 1 settlement', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-test-1');

    let portSubmissions = 0;
    const settlementPort: SettlementPort = {
      async submit() {
        portSubmissions += 1;
        return {
          kind: 'CONFIRMED',
          provider_reference_id: 'provider-ref-int-1',
          transaction_hash: `0x${'a'.repeat(64)}`,
          block_number: '12345',
          transfer_log_index: 0,
        };
      },
    };

    const workerOptions = { pool, ledger, settlementPort };

    // Step 1: Authorize
    await executeAuthorizeIntent(sampleRequest.business_intent_id, workerOptions);
    const readyState = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(readyState?.state).toBe('READY');

    // Step 2: Submit settlement
    await executeSubmitSettlement(sampleRequest.business_intent_id, workerOptions);
    const committedState = await ledger.getIntent(sampleRequest.business_intent_id);

    expect(committedState?.state).toBe('COMMITTED');
    expect(committedState?.settlement?.transaction_hash).toBe(`0x${'a'.repeat(64)}`);
    expect(portSubmissions).toBe(1);

    const counts = await pool.query<{ settlements: string }>(
      'SELECT count(*)::text AS settlements FROM settlements WHERE business_intent_id = $1',
      [sampleRequest.business_intent_id],
    );
    expect(counts.rows[0]?.settlements).toBe('1');
  });

  it('concurrency storm: 10 parallel workers converge on exactly 1 submission and 1 settlement', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-storm-1');

    let portCallCount = 0;
    const settlementPort: SettlementPort = {
      async submit() {
        portCallCount += 1;
        // Simulate real asynchronous execution
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          kind: 'CONFIRMED',
          provider_reference_id: 'provider-ref-storm',
          transaction_hash: `0x${'b'.repeat(64)}`,
          block_number: '99999',
          transfer_log_index: 0,
        };
      },
    };

    const workerOptions = { pool, ledger, settlementPort };
    await executeAuthorizeIntent(sampleRequest.business_intent_id, workerOptions);

    const result = await runConcurrencyTest(sampleRequest.business_intent_id, workerOptions, 10);

    expect(result.success).toBe(true);
    expect(result.finalState).toBe('COMMITTED');
    expect(portCallCount).toBe(1);
    expect(result.committedSettlementCount).toBe(1);
  });

  it('two worker processes: separate OS processes race to claim and commit at most 1 settlement', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-proc-1');

    const workerOptions = {
      pool,
      ledger,
      settlementPort: {
        async submit() {
          return {
            kind: 'CONFIRMED' as const,
            provider_reference_id: 'dummy',
            transaction_hash: '0x1',
            block_number: '1',
            transfer_log_index: 0,
          };
        },
      },
    };
    await executeAuthorizeIntent(sampleRequest.business_intent_id, workerOptions);

    const connectionUri = container.getConnectionUri();
    const runChild = (workerId: number) =>
      new Promise<{ workerId: number; calledPort: boolean; success: boolean }>(
        (resolvePromise, rejectPromise) => {
          const child = fork(childWorkerScript, {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          });
          child.on(
            'message',
            (msg: { workerId: number; calledPort: boolean; success: boolean; error?: string }) => {
              if (msg.error) {
                rejectPromise(new Error(msg.error));
              } else {
                resolvePromise(msg);
              }
            },
          );
          child.on('error', rejectPromise);
          child.send({
            connectionString: connectionUri,
            intentId: sampleRequest.business_intent_id,
            workerId,
          });
        },
      );

    const [res1, res2] = await Promise.all([runChild(1), runChild(2)]);

    const calledCount = (res1.calledPort ? 1 : 0) + (res2.calledPort ? 1 : 0);
    expect(calledCount).toBe(1);

    const committedState = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(committedState?.state).toBe('COMMITTED');

    const settlements = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM settlements WHERE business_intent_id = $1',
      [sampleRequest.business_intent_id],
    );
    expect(settlements.rows[0]?.count).toBe('1');
  });

  it('sequential retry storm: 10 deliveries create at most 1 settlement', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-seq-1');

    let portCallCount = 0;
    const settlementPort: SettlementPort = {
      async submit() {
        portCallCount += 1;
        return {
          kind: 'CONFIRMED',
          provider_reference_id: 'provider-ref-seq',
          transaction_hash: `0x${'c'.repeat(64)}`,
          block_number: '88888',
          transfer_log_index: 0,
        };
      },
    };

    const workerOptions = { pool, ledger, settlementPort };
    await executeAuthorizeIntent(sampleRequest.business_intent_id, workerOptions);

    for (let i = 0; i < 10; i++) {
      await executeSubmitSettlement(sampleRequest.business_intent_id, workerOptions);
    }

    expect(portCallCount).toBe(1);
    const intent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(intent?.state).toBe('COMMITTED');
  });

  it('crash/uncertainty after submission enters UNKNOWN without blind retry', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-fail-1');

    let portCallCount = 0;
    const failingPort: SettlementPort = {
      async submit() {
        portCallCount += 1;
        throw new Error('Connection reset by peer during settlement submission');
      },
    };

    const workerOptions = { pool, ledger, settlementPort: failingPort };
    await executeAuthorizeIntent(sampleRequest.business_intent_id, workerOptions);
    await executeSubmitSettlement(sampleRequest.business_intent_id, workerOptions);

    const intent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(intent?.state).toBe('UNKNOWN');
    expect(intent?.settlement).toBeUndefined();

    // Verify reconciliation job is enqueued in outbox
    const outboxJobs = await pool.query<{ task_identifier: string }>(
      "SELECT task_identifier FROM outbox_jobs WHERE business_intent_id = $1 AND task_identifier = 'reconcile_intent'",
      [sampleRequest.business_intent_id],
    );
    expect(outboxJobs.rowCount).toBe(1);

    // Verify subsequent execution attempt does NOT blindly retry
    await executeSubmitSettlement(sampleRequest.business_intent_id, workerOptions);
    expect(portCallCount).toBe(1);
  });

  it('drains outbox jobs end-to-end to COMMITTED state', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-drain-1');

    let portCalls = 0;
    const workerOptions = {
      pool,
      ledger,
      settlementPort: {
        async submit() {
          portCalls += 1;
          return {
            kind: 'CONFIRMED' as const,
            provider_reference_id: 'provider-ref-drain',
            transaction_hash: `0x${'d'.repeat(64)}`,
            block_number: '77777',
            transfer_log_index: 0,
          };
        },
      },
    };

    // First drain with maxJobs=1 processes authorize_intent -> creates submit_settlement outbox job
    const processedFirst = await drainOutboxJobs(workerOptions, 1);
    expect(processedFirst).toBe(1);

    const readyIntent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(readyIntent?.state).toBe('READY');

    // Second drain with maxJobs=1 processes submit_settlement -> commits settlement
    const processedSecond = await drainOutboxJobs(workerOptions, 1);
    expect(processedSecond).toBe(1);

    const committedIntent = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(committedIntent?.state).toBe('COMMITTED');
    expect(portCalls).toBe(1);

    // Third drain confirms all outbox jobs are drained
    const processedThird = await drainOutboxJobs(workerOptions, 1);
    expect(processedThird).toBe(0);
  });

  it('safe disable leaves submission work pending and re-enable settles exactly once', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-safe-disable');

    let portCalls = 0;
    const settlementPort: SettlementPort = {
      async submit() {
        portCalls += 1;
        return {
          kind: 'CONFIRMED',
          provider_reference_id: 'provider-safe-disable',
          transaction_hash: `0x${'f'.repeat(64)}`,
          block_number: '88888',
          transfer_log_index: 0,
        };
      },
    };

    const enabledOptions = { pool, ledger, settlementPort };
    expect(await drainOutboxJobs(enabledOptions, 1)).toBe(1);
    expect((await ledger.getIntent(sampleRequest.business_intent_id))?.state).toBe('READY');

    const disabledOptions = {
      ...enabledOptions,
      config: { submissionsDisabled: true },
    };
    expect(await drainOutboxJobs(disabledOptions, 1)).toBe(0);
    expect(portCalls).toBe(0);
    await expect(
      pool.query<{ status: string }>(
        'SELECT status FROM outbox_jobs WHERE business_intent_id = $1 AND task_identifier = $2',
        [sampleRequest.business_intent_id, 'submit_settlement'],
      ),
    ).resolves.toMatchObject({ rows: [{ status: 'PENDING' }] });

    expect(await drainOutboxJobs(enabledOptions, 1)).toBe(1);
    expect((await ledger.getIntent(sampleRequest.business_intent_id))?.state).toBe('COMMITTED');
    expect(portCalls).toBe(1);
  });

  it('authorization UNAVAILABLE remains pending and retries after the backoff window', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(sampleRequest, 'corr-auth-unavailable');

    let available = false;
    const workerOptions = {
      pool,
      ledger,
      authorizationPort: {
        async authorize() {
          return available
            ? ({ kind: 'AUTHORIZED' as const } as const)
            : ({ kind: 'UNAVAILABLE' as const, reason: 'Privy unavailable' } as const);
        },
      },
      settlementPort: {
        async submit() {
          return {
            kind: 'CONFIRMED' as const,
            provider_reference_id: 'provider-auth-retry',
            transaction_hash: `0x${'1'.repeat(64)}`,
            block_number: '99999',
            transfer_log_index: 0,
          };
        },
      },
      config: { authorizationRetryDelayMs: 60_000 },
    };

    expect(await drainOutboxJobs(workerOptions, 1)).toBe(1);
    const unavailable = await ledger.getIntent(sampleRequest.business_intent_id);
    expect(unavailable?.state).toBe('AUTHORIZING');
    expect(unavailable?.attempts[0]?.sanitized_error).toBe('Privy unavailable');
    await expect(
      pool.query<{ status: string }>(
        'SELECT status FROM outbox_jobs WHERE business_intent_id = $1 AND task_identifier = $2',
        [sampleRequest.business_intent_id, 'authorize_intent'],
      ),
    ).resolves.toMatchObject({ rows: [{ status: 'PENDING' }] });

    await pool.query(
      'UPDATE outbox_jobs SET available_at = now() WHERE business_intent_id = $1 AND task_identifier = $2',
      [sampleRequest.business_intent_id, 'authorize_intent'],
    );
    available = true;
    expect(await drainOutboxJobs(workerOptions, 1)).toBe(1);
    expect((await ledger.getIntent(sampleRequest.business_intent_id))?.state).toBe('READY');
  });
});
