import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPENAPI_MOCK_SERVER_VERSION,
  UI_FIXTURES,
  createDefaultMockState,
  createOpenApiMockClient,
  createOpenApiMockFetch,
  handleOpenApiMockRequest,
} from '../src/mock-server.js';

const packageRoot = resolve(import.meta.dirname, '..');

describe('OpenAPI mock server', () => {
  it('exposes frozen mock server version 1.0.0', () => {
    expect(OPENAPI_MOCK_SERVER_VERSION).toBe('1.0.0');
  });

  it('matches all committed UI fixture files exactly', () => {
    for (const [name, fixture] of Object.entries(UI_FIXTURES)) {
      const filePath = resolve(packageRoot, 'fixtures', 'ui', 'v1', `${name}.json`);
      const fileContent = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(fixture).toEqual(fileContent);
    }
  });

  it('serves liveness and readiness health checks', async () => {
    const client = createOpenApiMockClient();
    const live = await client.getLiveness();
    const ready = await client.getReadiness();

    expect(live).toEqual({ status: 200, data: { status: 'ok' } });
    expect(ready).toEqual({ status: 200, data: { status: 'ok' } });
  });

  it('serves pre-seeded UI scenarios with version headers', async () => {
    const client = createOpenApiMockClient();
    const fetcher = createOpenApiMockFetch();

    const response = await fetcher('http://mock.local/v1/intents/018f-ui-committed-001');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-oneshot-mock-version')).toBe(OPENAPI_MOCK_SERVER_VERSION);

    const intent = await client.getIntent('018f-ui-committed-001');
    expect(intent.status).toBe(200);
    expect(intent.data.state).toBe('COMMITTED');
    expect(intent.data.policy?.status).toBe('CONFIGURED');
    expect(intent.data.attempts[0]?.authorization_status).toBe('AUTHORIZED');
    expect(intent.data.settlement?.token_contract).toBe(
      '0x3600000000000000000000000000000000000000',
    );
    expect(intent.data.settlement?.explorer_url).toContain('arcscan.io');
  });

  it('serves recovery views', async () => {
    const client = createOpenApiMockClient();
    const recovery = await client.getRecoveryView('018f-ui-unknown-007');
    expect(recovery.status).toBe(200);
    expect(recovery.data.authoritative_state).toBe('UNKNOWN');
    expect(recovery.data.recommended_action).toBe('RECONCILE');
    expect(recovery.data.evidence[0]?.source).toBe('THE_GRAPH');
  });

  it('handles create and idempotent replay semantics', async () => {
    const state = createDefaultMockState();
    const client = createOpenApiMockClient({ state });

    const newReq = {
      business_intent_id: 'test-new-intent-001',
      recipient: '0x1111111111111111111111111111111111111111',
      amount_atomic: '1000000',
      asset: 'USDC' as const,
      network: 'eip155:5042002' as const,
      purpose: 'Payment test',
    };

    // 1. Create new intent -> 202
    const created = await client.createIntent(newReq);
    expect(created.status).toBe(202);
    expect(created.data.business_intent_id).toBe('test-new-intent-001');
    expect(created.data.state).toBe('AUTHORIZING');

    // 2. Replay identical payload -> 200
    const replayed = await client.createIntent(newReq);
    expect(replayed.status).toBe(200);
    expect(replayed.data.business_intent_id).toBe('test-new-intent-001');

    // 3. Replay with conflicting payload -> 409
    const conflicting = await client.createIntent({
      ...newReq,
      amount_atomic: '2000000',
    });
    expect(conflicting.status).toBe(409);
  });

  it('supports read-only reconciliation queueing', async () => {
    const client = createOpenApiMockClient();

    // UNKNOWN intent allows reconciliation
    const reconcileUnknown = await client.reconcile('018f-ui-unknown-007');
    expect(reconcileUnknown.status).toBe(202);
    expect(reconcileUnknown.data.queued).toBe(true);
    expect(reconcileUnknown.data.state).toBe('UNKNOWN');

    // COMMITTED intent rejects reconciliation with 409
    const reconcileCommitted = await client.reconcile('018f-ui-committed-001');
    expect(reconcileCommitted.status).toBe(409);

    // Non-existent intent returns 404
    const reconcileMissing = await client.reconcile('missing-intent');
    expect(reconcileMissing.status).toBe(404);
  });

  it('strictly fails closed on retry endpoints and unexpected methods', () => {
    // Retry endpoint strictly absent
    expect(
      handleOpenApiMockRequest('http://mock.local/v1/intents/018f-ui-committed-001/retry', 'POST'),
    ).toBeNull();

    // Mutating method on read route fails closed with 405
    const deleteRes = handleOpenApiMockRequest(
      'http://mock.local/v1/intents/018f-ui-committed-001',
      'DELETE',
    );
    expect(deleteRes?.status).toBe(405);
  });
});
