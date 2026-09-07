import { describe, expect, it } from 'vitest';
import type { IntentResponse, RecoveryView, ReconcileResponse } from '@oneshot/contracts';
import type { CreateIntentResult, IntentLedger } from '@oneshot/storage-postgres';
import { buildApi, staticBearerAuthenticator } from '../src/index.js';

const request = {
  business_intent_id: 'intent-api-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1250000',
  asset: 'USDC' as const,
  network: 'eip155:5042002' as const,
  purpose: 'Invoice INV-1001',
};
const intent: IntentResponse = {
  ...request,
  payload_fingerprint: 'a'.repeat(64),
  state: 'AUTHORIZING',
  version: 1,
  attempts: [
    {
      attempt_id: 'attempt-api-1',
      stage: 'AUTHORIZING',
      created_at: '2026-09-07T12:00:00.000Z',
    },
  ],
  evidence: [],
};

function createMockLedger(
  overrides: Partial<IntentLedger> = {},
): Pick<
  IntentLedger,
  'createOrReplay' | 'enqueueReconciliation' | 'getIntent' | 'getRecoveryView' | 'ping'
> {
  return {
    async createOrReplay() {
      return { kind: 'ACCEPTED', intent } as CreateIntentResult;
    },
    async enqueueReconciliation(): Promise<ReconcileResponse | undefined> {
      return { business_intent_id: intent.business_intent_id, queued: true, state: 'UNKNOWN' };
    },
    async getIntent() {
      return intent;
    },
    async getRecoveryView(): Promise<RecoveryView> {
      return {
        business_intent_id: intent.business_intent_id,
        authoritative_state: intent.state,
        recommended_action: 'WAIT',
        evidence: [],
      };
    },
    async ping() {},
    ...overrides,
  };
}

describe('API boundary controls', () => {
  it('requires service authentication and returns a sanitized error', async () => {
    const app = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-generated',
    });
    const response = await app.inject({ method: 'GET', url: '/v1/intents/intent-api-1' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Service authentication failed',
      correlation_id: 'correlation-generated',
    });
    await app.close();
  });

  it('validates schemas without echoing rejected payload material', async () => {
    const app = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-validation',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: { ...request, amount_atomic: '1.5', purpose: 'do-not-echo-this' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('do-not-echo-this');
    expect(response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    await app.close();
  });

  it('enforces the request-size and rate-limit seams', async () => {
    const sizeLimited = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      bodyLimitBytes: 32,
      nextCorrelationId: () => 'correlation-size',
    });
    const tooLarge = await sizeLimited.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(tooLarge.statusCode).toBe(400);
    await sizeLimited.close();

    const rateLimited = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
      rateLimiter: {
        async allow() {
          return false;
        },
      },
      nextCorrelationId: () => 'correlation-rate',
    });
    const blocked = await rateLimited.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ code: 'RATE_LIMITED' });
    await rateLimited.close();
  });

  it('maps payload conflict to a stable 409 body', async () => {
    const app = buildApi({
      ledger: createMockLedger({
        async createOrReplay() {
          return { kind: 'INTENT_PAYLOAD_CONFLICT', intent };
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-conflict',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'INTENT_PAYLOAD_CONFLICT',
      message: 'Business Intent already exists with a different immutable payload',
      correlation_id: 'correlation-conflict',
    });
    await app.close();
  });

  it('rejects malformed correlation IDs with 400 INVALID_REQUEST', async () => {
    const app = buildApi({
      ledger: createMockLedger(),
      authenticator: staticBearerAuthenticator('test-token'),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/intents/intent-api-1',
      headers: {
        authorization: 'Bearer test-token',
        'x-correlation-id': ' invalid correlation id',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    await app.close();
  });
});

describe('OpenAPI contract endpoints', () => {
  it('POST /v1/intents returns 202 for new intent and 200 for identical replay', async () => {
    let mode: 'ACCEPTED' | 'REPLAY_IDENTICAL' = 'ACCEPTED';
    const app = buildApi({
      ledger: createMockLedger({
        async createOrReplay() {
          return { kind: mode, intent };
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-post',
    });

    const acceptedResponse = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token', 'x-correlation-id': 'custom-cid-1' },
      payload: request,
    });
    expect(acceptedResponse.statusCode).toBe(202);
    expect(acceptedResponse.headers['x-correlation-id']).toBe('custom-cid-1');
    expect(acceptedResponse.json()).toEqual(intent);

    mode = 'REPLAY_IDENTICAL';
    const replayedResponse = await app.inject({
      method: 'POST',
      url: '/v1/intents',
      headers: { authorization: 'Bearer test-token' },
      payload: request,
    });
    expect(replayedResponse.statusCode).toBe(200);
    expect(replayedResponse.json()).toEqual(intent);
    await app.close();
  });

  it('GET /v1/intents/:id returns 200 or 404 when not found', async () => {
    const app = buildApi({
      ledger: createMockLedger({
        async getIntent(id) {
          return id === 'intent-api-1' ? intent : undefined;
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-get',
    });

    const found = await app.inject({
      method: 'GET',
      url: '/v1/intents/intent-api-1',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(intent);

    const notFound = await app.inject({
      method: 'GET',
      url: '/v1/intents/missing-id',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({
      code: 'INTENT_NOT_FOUND',
      message: 'Business Intent was not found',
    });
    await app.close();
  });

  it('POST /v1/intents/:id/reconcile returns 202, 404, or 409', async () => {
    let reconcileResult: ReconcileResponse | undefined = {
      business_intent_id: 'intent-api-1',
      queued: true,
      state: 'UNKNOWN',
    };
    const app = buildApi({
      ledger: createMockLedger({
        async enqueueReconciliation() {
          return reconcileResult;
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-reconcile',
    });

    const queued = await app.inject({
      method: 'POST',
      url: '/v1/intents/intent-api-1/reconcile',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(queued.statusCode).toBe(202);
    expect(queued.json()).toEqual(reconcileResult);

    reconcileResult = { business_intent_id: 'intent-api-1', queued: false, state: 'COMMITTED' };
    const notAllowed = await app.inject({
      method: 'POST',
      url: '/v1/intents/intent-api-1/reconcile',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notAllowed.statusCode).toBe(409);
    expect(notAllowed.json()).toMatchObject({ code: 'RECONCILIATION_NOT_ALLOWED' });

    reconcileResult = undefined;
    const notFound = await app.inject({
      method: 'POST',
      url: '/v1/intents/missing-id/reconcile',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ code: 'INTENT_NOT_FOUND' });
    await app.close();
  });

  it('GET /v1/intents/:id/recovery-view returns 200 or 404', async () => {
    const app = buildApi({
      ledger: createMockLedger({
        async getRecoveryView(id) {
          if (id !== 'intent-api-1') return undefined;
          return {
            business_intent_id: 'intent-api-1',
            authoritative_state: 'COMMITTED',
            recommended_action: 'RETURN_EXISTING_RESULT',
            evidence: [],
          };
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-recovery',
    });

    const found = await app.inject({
      method: 'GET',
      url: '/v1/intents/intent-api-1/recovery-view',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual({
      business_intent_id: 'intent-api-1',
      authoritative_state: 'COMMITTED',
      recommended_action: 'RETURN_EXISTING_RESULT',
      evidence: [],
    });

    const notFound = await app.inject({
      method: 'GET',
      url: '/v1/intents/missing/recovery-view',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ code: 'INTENT_NOT_FOUND' });
    await app.close();
  });

  it('GET /health/live and /health/ready reflect status without authentication', async () => {
    let pingHealthy = true;
    const app = buildApi({
      ledger: createMockLedger({
        async ping() {
          if (!pingHealthy) throw new Error('DB connection refused');
        },
      }),
      authenticator: staticBearerAuthenticator('test-token'),
      nextCorrelationId: () => 'correlation-health',
    });

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });

    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ok' });

    pingHealthy = false;
    const notReady = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(notReady.statusCode).toBe(503);
    expect(notReady.json()).toMatchObject({ code: 'NOT_READY' });
    await app.close();
  });
});
