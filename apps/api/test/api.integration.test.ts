import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { IntentLedger, migrate } from '@oneshot/storage-postgres';
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
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let attempts = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 20 });
    await migrate(pool);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
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
    });
    try {
      const response = await fetch(`${runtime.address}/health/ready`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ok' });
    } finally {
      await runtime.close();
    }
  });
});
