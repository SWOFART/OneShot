import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { IntentLedger, migrate, migrationDigest } from '../src/index.js';

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
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let nextAttempt = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 20 });
    await migrate(pool);
  });

  afterEach(async () => {
    await pool.query(
      'TRUNCATE operational_metric_events, outbox_jobs, evidence_observations, settlements, attempts, business_intents RESTART IDENTITY',
    );
    nextAttempt = 0;
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
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
    expect(versions.rows.map((row) => row.version)).toEqual([1, 2, 3, 4]);
    expect(await migrationDigest()).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rolls back a failed forward migration transaction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oneshot-migration-'));
    try {
      await writeFile(
        join(directory, '005_broken.sql'),
        'CREATE TABLE must_rollback (id integer); SELECT missing_function();',
        'utf8',
      );
      await expect(migrate(pool, directory)).rejects.toThrow();
      const table = await pool.query<{ name: string | null }>(
        "SELECT to_regclass('public.must_rollback')::text AS name",
      );
      expect(table.rows[0]?.name).toBeNull();
      const version = await pool.query('SELECT 1 FROM schema_versions WHERE version = 5');
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
