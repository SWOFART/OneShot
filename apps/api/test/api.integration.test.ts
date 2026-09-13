import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { derivedBusinessIntentId } from '@oneshot/domain';
import { IntentLedger, JobLedger, migrate } from '@oneshot/storage-postgres';
import { TeamReportSupplier } from '@oneshot/supplier-adapter';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApi, startApiRuntime, staticBearerAuthenticator } from '../src/index.js';

const describePostgres = process.env.TEST_POSTGRES === '1' ? describe : describe.skip;
const request = {
  business_intent_id: 'intent-http-concurrent',
  recipient: '0x2222222222222222222222222222222222222222',
  amount_atomic: '2500000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Concurrent invoice',
};

describePostgres('durable HTTP API', () => {
  let container!: StartedPostgreSqlContainer;
  let pool!: Pool;
  let attempts = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 20 });
    await migrate(pool);
  });

  afterAll(async () => {
    if (typeof pool !== 'undefined') await pool.end();
    if (typeof container !== 'undefined') await container.stop();
  });

  const ledger = () =>
    new IntentLedger(pool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `http-attempt-${++attempts}`,
    });

  it('persists one intent across duplicate POSTs and API restart', async () => {
    const firstApp = buildApi({
      ledger: ledger(),
      authenticator: staticBearerAuthenticator('integration-token'),
      nextCorrelationId: () => 'correlation-http',
    });
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        firstApp.inject({
          method: 'POST',
          url: '/v1/intents',
          headers: { authorization: 'Bearer integration-token' },
          payload: request,
        }),
      ),
    );
    expect(responses.filter((response) => response.statusCode === 202)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(9);
    await firstApp.close();

    const restartedApp = buildApi({
      ledger: ledger(),
      authenticator: staticBearerAuthenticator('integration-token'),
      nextCorrelationId: () => 'correlation-after-restart',
    });
    const status = await restartedApp.inject({
      method: 'GET',
      url: `/v1/intents/${request.business_intent_id}`,
      headers: { authorization: 'Bearer integration-token' },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      business_intent_id: request.business_intent_id,
      state: 'AUTHORIZING',
      version: 1,
    });
    await restartedApp.close();
  });

  it('starts the executable server and reports database readiness', async () => {
    const runtime = await startApiRuntime({
      host: '127.0.0.1',
      port: 0,
      serviceBearerToken: 'integration-token',
      database: { connectionString: container.getConnectionUri() },
      submissionsDisabled: false,
      rateLimit: { maxRequests: 60, windowMs: 60_000 },
    });
    try {
      const response = await fetch(`${runtime.address}/health/ready`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ok' });
    } finally {
      await runtime.close();
    }
  });

  it('converges parallel MCP calls on one durable intent and zero direct settlements', async () => {
    const mcpToken = 'integration-mcp-token-with-32-characters';
    const requestKey = 'integration-arc-payment';
    const jobs = new JobLedger(pool, {
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      nextAttemptId: () => `http-user-wallet-attempt-${++attempts}`,
    });
    const app = buildApi({
      ledger: ledger(),
      jobs,
      supplier: new TeamReportSupplier(),
      authenticator: staticBearerAuthenticator('integration-token'),
      mcp: {
        authenticator: staticBearerAuthenticator(mcpToken),
        workspaceId: 'integration-mcp-workspace',
        waitMs: 0,
      },
    });
    const call = (amount = '1') =>
      app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${mcpToken}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'arc_payment',
            arguments: {
              request_key: requestKey,
              payer_wallet: '0x1111111111111111111111111111111111111111',
              recipient: '0x2222222222222222222222222222222222222222',
              amount_usdc: amount,
              purpose: 'One integration payment',
            },
          },
        },
      });

    const responses = await Promise.all(Array.from({ length: 10 }, () => call()));
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    const businessIntentId = derivedBusinessIntentId('integration-mcp-workspace', {
      task_key: requestKey,
      tool_id: 'team-report-v1',
      report_subject: 'One integration payment',
      recipient: '0x2222222222222222222222222222222222222222',
      amount_atomic: '1000000',
    });
    const counts = await pool.query<{
      intents: string;
      attempts: string;
      settlements: string;
    }>(
      `SELECT
        (SELECT count(*) FROM business_intents WHERE business_intent_id = $1)::text AS intents,
        (SELECT count(*) FROM attempts WHERE business_intent_id = $1)::text AS attempts,
        (SELECT count(*) FROM settlements WHERE business_intent_id = $1)::text AS settlements`,
      [businessIntentId],
    );
    expect(counts.rows[0]).toEqual({ intents: '1', attempts: '1', settlements: '0' });

    const conflict = await call('0.5');
    expect(conflict.body).toContain('different payment');
    const afterConflict = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM business_intents WHERE business_intent_id = $1',
      [businessIntentId],
    );
    expect(afterConflict.rows[0]?.count).toBe('1');
    await app.close();
  });
});
