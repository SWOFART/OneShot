import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jobFingerprint } from '@oneshot/domain';
import { IntentLedger, JobLedger, migrate, migrationDigest } from '../src/index.js';

const describePostgres = process.env.TEST_POSTGRES === '1' ? describe : describe.skip;
const request = {
  business_intent_id: 'intent-storage-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1250000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Invoice INV-1001',
};

describePostgres('PostgreSQL intent ledger', () => {
  let container!: StartedPostgreSqlContainer;
  let pool!: Pool;
  let nextAttempt = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 20 });
    await migrate(pool);
  });

  afterEach(async () => {
    if (typeof pool === 'undefined') return;
    await pool.query(
      'TRUNCATE wallet_activity_observations, operational_metric_events, outbox_jobs, evidence_observations, settlements, attempts, resumable_jobs, paid_api_requests, business_intents RESTART IDENTITY',
    );
    nextAttempt = 0;
  });

  afterAll(async () => {
    if (typeof pool !== 'undefined') await pool.end();
    if (typeof container !== 'undefined') await container.stop();
  });

  const newLedger = (targetPool = pool) =>
    new IntentLedger(targetPool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `attempt-${++nextAttempt}`,
    });

  it('bootstraps and applies the ordered migration set', async () => {
    const versions = await pool.query<{ version: number }>(
      'SELECT version FROM schema_versions ORDER BY version',
    );
    expect(versions.rows.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(await migrationDigest()).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rolls back a failed forward migration transaction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oneshot-migration-'));
    try {
      await writeFile(
        join(directory, '009_broken.sql'),
        'CREATE TABLE must_rollback (id integer); SELECT missing_function();',
        'utf8',
      );
      await expect(migrate(pool, directory)).rejects.toThrow();
      const table = await pool.query<{ name: string | null }>(
        "SELECT to_regclass('public.must_rollback')::text AS name",
      );
      expect(table.rows[0]?.name).toBeNull();
      const version = await pool.query('SELECT 1 FROM schema_versions WHERE version = 9');
      expect(version.rowCount).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('atomically accepts one of ten concurrent identical requests', async () => {
    const ledger = newLedger();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        ledger.createOrReplay(request, `correlation-${index + 1}`),
      ),
    );
    expect(results.filter((result) => result.kind === 'ACCEPTED')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'REPLAY_IDENTICAL')).toHaveLength(9);
    const counts = await pool.query<{ intents: string; attempts: string; jobs: string }>(`
      SELECT
        (SELECT count(*) FROM business_intents)::text AS intents,
        (SELECT count(*) FROM attempts)::text AS attempts,
        (SELECT count(*) FROM outbox_jobs)::text AS jobs
    `);
    expect(counts.rows[0]).toEqual({ intents: '1', attempts: '1', jobs: '1' });
  });

  it('binds ten concurrent paid API approvals to one x402 intent and one payment attempt', async () => {
    const ledger = newLedger();
    const paidRequest = { task_key: 'circle-api-2026', tool_id: 'circle-x402-api-v1' as const };
    const quote = {
      resourceUrl: 'https://x402.example.test/api/dataset',
      x402Version: 2,
      maxTimeoutSeconds: 60,
      recipient: '0x1111111111111111111111111111111111111111',
      amountAtomic: '10000',
      quotePayload: {
        url: 'https://x402.example.test/api/dataset',
        x402Version: 2,
        resourceUrl: 'https://x402.example.test/api/dataset',
        requirements: { scheme: 'exact', network: 'eip155:5042002', amount: '10000' },
      },
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        ledger.createPaidApiOrReplay({
          workspaceId: 'workspace-paid-api',
          request: paidRequest,
          quote,
          correlationId: `paid-api-correlation-${index}`,
        }),
      ),
    );
    expect(results.filter((result) => result.kind === 'ACCEPTED')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'REPLAY_IDENTICAL')).toHaveLength(9);
    const counts = await pool.query<{
      intents: string;
      paid: string;
      attempts: string;
      jobs: string;
    }>(
      `SELECT
        (SELECT count(*) FROM business_intents)::text AS intents,
        (SELECT count(*) FROM paid_api_requests)::text AS paid,
        (SELECT count(*) FROM attempts)::text AS attempts,
        (SELECT count(*) FROM outbox_jobs)::text AS jobs`,
    );
    expect(counts.rows[0]).toEqual({ intents: '1', paid: '1', attempts: '1', jobs: '1' });
  });

  it('binds ten concurrent agents to one job, one supplier order and one payment right', async () => {
    const jobs = new JobLedger(pool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `job-attempt-${++nextAttempt}`,
    });
    const request = {
      task_key: 'report-acme-2026',
      tool_id: 'team-report-v1' as const,
      report_subject: 'Acme',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
    };
    const order = {
      supplier_id: 'team-report-v1' as const,
      order_reference: 'team_report_order_123',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
      asset: 'USDC' as const,
      network: 'eip155:5042002' as const,
      expires_at: '2026-09-07T13:00:00.000Z',
      supplier_payload_fingerprint: jobFingerprint(request),
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        jobs.createOrReplay({
          workspaceId: 'workspace-test',
          request,
          supplierOrder: order,
          correlationId: `job-correlation-${index}`,
        }),
      ),
    );
    expect(results.filter((result) => result.kind === 'ACCEPTED')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'REPLAYED')).toHaveLength(9);
    const counts = await pool.query<{ jobs: string; intents: string; payments: string }>(
      'SELECT (SELECT count(*) FROM resumable_jobs)::text AS jobs, (SELECT count(*) FROM business_intents)::text AS intents, (SELECT count(*) FROM settlements)::text AS payments',
    );
    expect(counts.rows[0]).toEqual({ jobs: '1', intents: '1', payments: '0' });
  });

  it('creates a payer-bound user-wallet job without server authorization work', async () => {
    const jobs = new JobLedger(pool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `user-wallet-attempt-${++nextAttempt}`,
    });
    const jobRequest = {
      task_key: 'report-user-wallet-2026',
      tool_id: 'team-report-v1' as const,
      report_subject: 'User Wallet Acme',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1000000',
    };
    const payer = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const order = {
      supplier_id: 'team-report-v1' as const,
      order_reference: 'team_report_user_wallet_2026',
      recipient: jobRequest.recipient,
      amount_atomic: jobRequest.amount_atomic,
      asset: 'USDC' as const,
      network: 'eip155:5042002' as const,
      expires_at: '2026-09-07T13:00:00.000Z',
      supplier_payload_fingerprint: jobFingerprint(jobRequest),
    };

    const created = await jobs.createUserWalletOrReplay({
      workspaceId: 'workspace-user-wallet',
      request: { ...jobRequest, payer_wallet: payer },
      supplierOrder: order,
      correlationId: 'user-wallet-create',
    });
    expect(created.kind).toBe('ACCEPTED');
    expect(created.job).toMatchObject({
      payment_mode: 'USER_WALLET',
      payment_state: 'READY',
      user_payment: { payer_wallet: payer, amount_atomic: '1000000' },
    });

    const replay = await jobs.createUserWalletOrReplay({
      workspaceId: 'workspace-user-wallet',
      request: { ...jobRequest, payer_wallet: payer },
      supplierOrder: order,
      correlationId: 'user-wallet-replay',
    });
    expect(replay.kind).toBe('REPLAYED');

    const payerConflict = await jobs.createUserWalletOrReplay({
      workspaceId: 'workspace-user-wallet',
      request: {
        ...jobRequest,
        payer_wallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      supplierOrder: order,
      correlationId: 'user-wallet-payer-conflict',
    });
    expect(payerConflict.kind).toBe('TASK_PAYLOAD_CONFLICT');

    const durable = await pool.query<{
      intent_state: string;
      attempt_stage: string;
      payment_mode: string;
      payer_wallet: string;
      authorize_jobs: string;
    }>(
      `SELECT i.state AS intent_state, a.stage AS attempt_stage,
              j.payment_mode, j.payer_wallet,
              (SELECT count(*)::text FROM outbox_jobs o
               WHERE o.business_intent_id = i.business_intent_id
                 AND o.task_identifier = 'authorize_intent') AS authorize_jobs
       FROM business_intents i
       JOIN resumable_jobs j ON j.business_intent_id = i.business_intent_id
       JOIN attempts a ON a.business_intent_id = i.business_intent_id
       WHERE i.business_intent_id = $1`,
      [created.job.business_intent_id],
    );
    expect(durable.rows[0]).toEqual({
      intent_state: 'READY',
      attempt_stage: 'READY',
      payment_mode: 'USER_WALLET',
      payer_wallet: payer,
      authorize_jobs: '0',
    });
  });

  it('durably binds one user-wallet hash and marks delayed verification UNKNOWN', async () => {
    const jobs = new JobLedger(pool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `user-wallet-transition-${++nextAttempt}`,
    });
    const ledger = newLedger();
    const jobRequest = {
      task_key: 'report-user-wallet-transition',
      tool_id: 'team-report-v1' as const,
      report_subject: 'Transition Acme',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1000000',
    };
    const payer = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const transactionHash = `0x${'c'.repeat(64)}`;
    const differentHash = `0x${'d'.repeat(64)}`;
    const order = {
      supplier_id: 'team-report-v1' as const,
      order_reference: 'team_report_user_wallet_transition',
      recipient: jobRequest.recipient,
      amount_atomic: jobRequest.amount_atomic,
      asset: 'USDC' as const,
      network: 'eip155:5042002' as const,
      expires_at: '2026-09-07T13:00:00.000Z',
      supplier_payload_fingerprint: jobFingerprint(jobRequest),
    };

    const created = await jobs.createUserWalletOrReplay({
      workspaceId: 'workspace-user-wallet-transition',
      request: { ...jobRequest, payer_wallet: payer },
      supplierOrder: order,
      correlationId: 'user-wallet-transition-create',
    });
    expect(created.kind).toBe('ACCEPTED');

    const begun = await ledger.beginUserWalletSubmission(
      created.job.business_intent_id,
      payer,
      'user-wallet-transition-submit',
    );
    expect(begun).toMatchObject({ begun: true, state: 'SUBMITTING' });
    if (!begun.begun) return;

    await expect(
      ledger.recordUserWalletTransaction(begun.attemptId, transactionHash),
    ).resolves.toBe('RECORDED');
    await expect(
      ledger.beginUserWalletSubmission(
        created.job.business_intent_id,
        payer,
        'user-wallet-transition-recheck',
      ),
    ).resolves.toMatchObject({ begun: true, state: 'SUBMITTING', transactionHash });

    await expect(
      ledger.markUserWalletUnknown(
        created.job.business_intent_id,
        begun.attemptId,
        'receipt not indexed yet',
      ),
    ).resolves.toMatchObject({ completed: true, state: 'UNKNOWN' });
    await expect(
      ledger.markUserWalletUnknown(
        created.job.business_intent_id,
        begun.attemptId,
        'same delayed receipt',
      ),
    ).resolves.toMatchObject({ completed: true, state: 'UNKNOWN' });
    await expect(ledger.recordUserWalletTransaction(begun.attemptId, differentHash)).resolves.toBe(
      'CONFLICT',
    );

    await expect(ledger.getIntent(created.job.business_intent_id)).resolves.toMatchObject({
      state: 'UNKNOWN',
      attempts: [{ stage: 'UNKNOWN' }],
    });
    const persisted = await pool.query<{
      payment_transaction_hash: string;
      attempt_transaction_hash: string;
      reconcile_jobs: string;
      metric_events: string;
    }>(
      `SELECT j.payment_transaction_hash, a.provider_transaction_hash AS attempt_transaction_hash,
              (SELECT count(*)::text FROM outbox_jobs o
               WHERE o.business_intent_id = j.business_intent_id
                 AND o.task_identifier = 'reconcile_intent') AS reconcile_jobs,
              (SELECT count(*)::text FROM operational_metric_events m
               WHERE m.business_intent_id = j.business_intent_id
                 AND m.outcome = 'USER_WALLET_UNKNOWN') AS metric_events
       FROM resumable_jobs j
       JOIN attempts a ON a.business_intent_id = j.business_intent_id
       WHERE j.business_intent_id = $1`,
      [created.job.business_intent_id],
    );
    expect(persisted.rows[0]).toEqual({
      payment_transaction_hash: transactionHash,
      attempt_transaction_hash: transactionHash,
      reconcile_jobs: '0',
      metric_events: '1',
    });
  });

  it('resumes a failed paid delivery with a new fenced outbox task and no second settlement', async () => {
    const jobs = new JobLedger(pool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `job-attempt-${++nextAttempt}`,
    });
    const jobRequest = {
      task_key: 'report-recovery-2026',
      tool_id: 'team-report-v1' as const,
      report_subject: 'Recovery Acme',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
    };
    const order = {
      supplier_id: 'team-report-v1' as const,
      order_reference: 'team_report_order_recovery',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '2500000',
      asset: 'USDC' as const,
      network: 'eip155:5042002' as const,
      expires_at: '2026-09-07T13:00:00.000Z',
      supplier_payload_fingerprint: jobFingerprint(jobRequest),
    };
    const created = await jobs.createOrReplay({
      workspaceId: 'workspace-test',
      request: jobRequest,
      supplierOrder: order,
      correlationId: 'job-recovery-create',
    });
    expect(created.kind).toBe('ACCEPTED');
    await pool.query(
      "UPDATE business_intents SET state = 'COMMITTED' WHERE business_intent_id = $1",
      [created.job.business_intent_id],
    );

    await jobs.resumeDelivery('workspace-test', created.job.job_id);
    await jobs.failDelivery(created.job.job_id, 1);
    expect((await jobs.get('workspace-test', created.job.job_id))?.delivery_state).toBe(
      'RETRIEVAL_FAILED',
    );

    await jobs.resumeDelivery('workspace-test', created.job.job_id);
    await jobs.completeDelivery(created.job.job_id, 2, {
      order_reference: order.order_reference,
      result_reference: 'team_report_result_recovery',
      report: 'Recovered original supplier result',
    });

    await expect(jobs.get('workspace-test', created.job.job_id)).resolves.toMatchObject({
      payment_state: 'COMMITTED',
      delivery_state: 'AVAILABLE',
      result: { result_reference: 'team_report_result_recovery' },
    });
    const outbox = await pool.query<{ job_key: string }>(
      "SELECT job_key FROM outbox_jobs WHERE task_identifier = 'fulfill_supplier_order' ORDER BY outbox_job_id",
    );
    expect(outbox.rows.map((row) => row.job_key)).toEqual([
      `fulfill:${created.job.job_id}:${order.order_reference}:1`,
      `fulfill:${created.job.job_id}:${order.order_reference}:2`,
    ]);
    await expect(pool.query('SELECT * FROM settlements')).resolves.toMatchObject({ rowCount: 0 });
  });

  it('returns conflict without creating another durable right', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-original');
    const conflict = await ledger.createOrReplay(
      { ...request, amount_atomic: '1250001' },
      'correlation-conflict',
    );
    expect(conflict.kind).toBe('INTENT_PAYLOAD_CONFLICT');
    const counts = await pool.query<{ attempts: string; jobs: string; settlements: string }>(`
      SELECT
        (SELECT count(*) FROM attempts)::text AS attempts,
        (SELECT count(*) FROM outbox_jobs)::text AS jobs,
        (SELECT count(*) FROM settlements)::text AS settlements
    `);
    expect(counts.rows[0]).toEqual({ attempts: '1', jobs: '1', settlements: '0' });
  });

  it('queues one reconciliation retry after the prior job is delivered', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-recovery-retry');
    await ledger.completeAuthorization(request.business_intent_id, 1, { kind: 'AUTHORIZED' });
    const claim = await ledger.claimSubmission(request.business_intent_id);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) return;

    await ledger.completeSubmission(request.business_intent_id, claim.attemptId, {
      kind: 'POSSIBLY_SUBMITTED',
      reason: 'provider response lost',
    });
    await expect(ledger.enqueueReconciliation(request.business_intent_id)).resolves.toMatchObject({
      queued: false,
      state: 'UNKNOWN',
    });

    await pool.query(
      "UPDATE outbox_jobs SET status = 'DELIVERED' WHERE task_identifier = 'reconcile_intent'",
    );
    const retries = await Promise.all(
      Array.from({ length: 5 }, () => ledger.enqueueReconciliation(request.business_intent_id)),
    );
    expect(retries.filter((result) => result?.queued)).toHaveLength(1);

    const jobs = await pool.query<{ job_key: string; status: string }>(
      `SELECT job_key, status FROM outbox_jobs
       WHERE business_intent_id = $1 AND job_key LIKE 'reconcile:%'
       ORDER BY outbox_job_id`,
      [request.business_intent_id],
    );
    expect(jobs.rows).toEqual([
      { job_key: 'reconcile:intent-storage-1:4', status: 'DELIVERED' },
      { job_key: 'reconcile:intent-storage-1:4:2', status: 'PENDING' },
    ]);
  });

  it('preserves a ledger replay when operational metrics fail inside the transaction', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-metric-failure-create');
    await pool.query('DROP TABLE operational_metric_events');
    try {
      await expect(
        ledger.createOrReplay(request, 'correlation-metric-failure-replay'),
      ).resolves.toMatchObject({
        kind: 'REPLAY_IDENTICAL',
      });
      await expect(
        pool.query<{ state: string }>(
          'SELECT state FROM business_intents WHERE business_intent_id = $1',
          [request.business_intent_id],
        ),
      ).resolves.toMatchObject({ rows: [{ state: 'AUTHORIZING' }] });
    } finally {
      await pool.query(`
        CREATE TABLE operational_metric_events (
          event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          business_intent_id text NOT NULL REFERENCES business_intents(business_intent_id) ON DELETE RESTRICT,
          event_type text NOT NULL CHECK (event_type IN (
            'DUPLICATE_REQUEST', 'CAS_CONFLICT', 'POLICY_DENIAL',
            'PROVIDER_ERROR', 'RECONCILIATION_OUTCOME'
          )),
          outcome text,
          created_at timestamptz NOT NULL
        )
      `);
      await pool.query(
        'CREATE INDEX operational_metric_events_type_idx ON operational_metric_events (event_type, outcome, created_at)',
      );
    }
  });

  it('opens a new authorization attempt only from FAILED_SAFE', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-safe-retry-create');
    await ledger.completeAuthorization(request.business_intent_id, 1, { kind: 'AUTHORIZED' });
    await pool.query(
      "UPDATE outbox_jobs SET status = 'DELIVERED' WHERE business_intent_id = $1 AND task_identifier = 'authorize_intent'",
      [request.business_intent_id],
    );
    const claim = await ledger.claimSubmission(
      request.business_intent_id,
      'correlation-safe-retry-submit',
    );
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) return;
    await ledger.completeSubmission(request.business_intent_id, claim.attemptId, {
      kind: 'DEFINITELY_NOT_SUBMITTED',
      reason: 'Provider rejected before broadcast',
    });

    await expect(
      ledger.scheduleFailedSafeRetry(request.business_intent_id, 'correlation-safe-retry-next'),
    ).resolves.toMatchObject({ scheduled: true, version: 5 });
    const retried = await ledger.getIntent(request.business_intent_id);
    expect(retried?.state).toBe('AUTHORIZING');
    expect(retried?.attempts).toHaveLength(3);
    expect(retried?.attempts[retried.attempts.length - 1]?.stage).toBe('AUTHORIZING');
    await expect(
      ledger.scheduleFailedSafeRetry(request.business_intent_id, 'correlation-safe-retry-again'),
    ).resolves.toMatchObject({ scheduled: false, reason: 'NOT_FAILED_SAFE' });
  });

  it('reports durable operational counters without changing ledger authority', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-metrics-first');
    await ledger.createOrReplay(request, 'correlation-metrics-replay');
    await ledger.createOrReplay(
      { ...request, amount_atomic: '1250001' },
      'correlation-metrics-conflict',
    );

    const casRequest = { ...request, business_intent_id: 'intent-metrics-cas' };
    await ledger.createOrReplay(casRequest, 'correlation-metrics-cas-create');
    await ledger.completeAuthorization(casRequest.business_intent_id, 1, { kind: 'AUTHORIZED' });
    const casClaim = await ledger.claimSubmission(casRequest.business_intent_id);
    expect(casClaim.claimed).toBe(true);
    await expect(ledger.claimSubmission(casRequest.business_intent_id)).resolves.toMatchObject({
      claimed: false,
      reason: 'NOT_READY',
    });

    const providerRequest = { ...request, business_intent_id: 'intent-metrics-provider' };
    await ledger.createOrReplay(providerRequest, 'correlation-metrics-provider-create');
    await ledger.completeAuthorization(providerRequest.business_intent_id, 1, {
      kind: 'AUTHORIZED',
    });
    const providerClaim = await ledger.claimSubmission(providerRequest.business_intent_id);
    expect(providerClaim.claimed).toBe(true);
    if (providerClaim.claimed) {
      await ledger.completeSubmission(providerRequest.business_intent_id, providerClaim.attemptId, {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'provider timeout',
      });
    }

    const policyRequest = { ...request, business_intent_id: 'intent-metrics-policy' };
    await ledger.createOrReplay(policyRequest, 'correlation-metrics-policy-create');
    await ledger.completeAuthorization(policyRequest.business_intent_id, 1, {
      kind: 'DENIED',
      reason: 'recipient denied by policy',
    });

    const recoveryRequest = { ...request, business_intent_id: 'intent-metrics-recovery' };
    await ledger.createOrReplay(recoveryRequest, 'correlation-metrics-recovery-create');
    await ledger.recordRecoveryEvent(recoveryRequest.business_intent_id, 'metrics-event', {
      reconciliationCommand: { targetState: 'COMMITTED' },
    });

    await expect(ledger.getSystemMetrics()).resolves.toMatchObject({
      duplicateCount: 2,
      casConflictsCount: 1,
      providerErrorCount: 1,
      policyDenialCount: 1,
      reconciliationOutcomeCounts: { COMMITTED: 1 },
    });
  });

  it('persists and reloads provider request identity on the owned attempt', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-provider-identity');
    await ledger.completeAuthorization(request.business_intent_id, 1, { kind: 'AUTHORIZED' });
    const claim = await ledger.claimSubmission(request.business_intent_id);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) return;

    await ledger.persistProviderRequestIdentity(claim.attemptId, {
      idempotencyKey: `0x${'a'.repeat(64)}`,
      referenceId: `oneshot-${request.business_intent_id}`,
      requestFingerprint: 'b'.repeat(64),
      walletId: 'wallet-test',
      policyId: 'policy-test',
    });

    await expect(ledger.getProviderRequestIdentity(request.business_intent_id)).resolves.toEqual({
      idempotencyKey: `0x${'a'.repeat(64)}`,
      referenceId: `oneshot-${request.business_intent_id}`,
      requestFingerprint: 'b'.repeat(64),
      walletId: 'wallet-test',
      policyId: 'policy-test',
    });
  });

  it('survives a client restart and preserves evidence order', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-restart');
    await ledger.appendEvidence(request.business_intent_id, {
      source: 'ONESHOT',
      authority_class: 'AUTHORITATIVE',
      retrieved_at: '2026-09-07T12:01:00.000Z',
      digest: 'first',
    });
    await ledger.appendEvidence(request.business_intent_id, {
      source: 'ARC',
      authority_class: 'OBSERVATION',
      retrieved_at: '2026-09-07T12:02:00.000Z',
      digest: 'second',
    });
    const restartedPool = new Pool({ connectionString: container.getConnectionUri() });
    try {
      const restarted = newLedger(restartedPool);
      const loaded = await restarted.getIntent(request.business_intent_id);
      expect(loaded?.evidence.map((item) => item.digest)).toEqual(['first', 'second']);
      expect(loaded?.attempts).toHaveLength(1);
    } finally {
      await restartedPool.end();
    }
  });

  it('returns the persisted Recovery Agent and deterministic-core decision', async () => {
    const ledger = newLedger();
    await ledger.createOrReplay(request, 'correlation-recovery-view');
    await ledger.recordRecoveryEvent(request.business_intent_id, 'event-p5', {
      recoveryView: {
        recommendedAction: 'ESCALATE',
        coreDisposition: 'ESCALATE_UNKNOWN',
        indexedCandidates: [],
        indexHealth: 'UNAVAILABLE',
        contradiction: false,
        contradictionCodes: [],
        diagnostics: ['MCP_UNAVAILABLE'],
      },
      reconciliationCommand: {
        targetState: 'UNKNOWN',
        reason: 'No authoritative Arc proof exists.',
        authoritativeProofPresent: false,
        evidenceReferences: ['oneshot:state:1'],
      },
      appendCommands: [
        {
          record: {
            recordType: 'DECISION',
            source: 'LLM',
            accepted: true,
            reason: 'Escalate because discovery is unavailable.',
            evidenceReferences: ['oneshot:state:1'],
            provenance: {
              modelIdentity: {
                modelName: 'gemini',
                modelVersion: '2.5-flash',
                promptVersion: 'recovery-v1',
              },
            },
          },
        },
      ],
    });

    await expect(ledger.getRecoveryView(request.business_intent_id)).resolves.toMatchObject({
      recommended_action: 'ESCALATE',
      recommendation_source: 'RECOVERY_AGENT',
      core_disposition: 'ESCALATE_UNKNOWN',
      settlement_permission: 'NEVER',
      agent_decision: {
        accepted: true,
        model_name: 'gemini',
        model_version: '2.5-flash',
      },
    });
  });
});
