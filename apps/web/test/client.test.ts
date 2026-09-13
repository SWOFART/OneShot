import type { CreateIntentRequest, IntentResponse, RequestListResponse } from '@oneshot/contracts';
import { describe, expect, it } from 'vitest';

import { OneShotApiClient } from '../src/api/client.js';
import { JobApiClient } from '../src/api/job-client.js';

const request: CreateIntentRequest = {
  business_intent_id: 'intent-web-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '1000000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Paid API job',
};

const intent: IntentResponse = {
  ...request,
  payload_fingerprint: 'fingerprint',
  state: 'READY',
  version: 1,
  attempts: [],
  evidence: [],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OneShotApiClient', () => {
  it('distinguishes accepted intents from identical replays', async () => {
    let status = 202;
    const calls: RequestInit[] = [];
    const client = new OneShotApiClient({
      getAuthToken: () => 'demo-token',
      fetchFn: async (_input, init) => {
        calls.push(init ?? {});
        return json(status, intent);
      },
    });

    await expect(client.createOrReplayIntent(request)).resolves.toMatchObject({ kind: 'ACCEPTED' });
    status = 200;
    await expect(client.createOrReplayIntent(request)).resolves.toMatchObject({ kind: 'REPLAYED' });
    expect(new Headers(calls[0]?.headers).get('authorization')).toBe('Bearer demo-token');
  });

  it.each([
    [409, 'INTENT_PAYLOAD_CONFLICT', 'PAYLOAD_CONFLICT'],
    [401, 'UNAUTHORIZED', 'UNAUTHORIZED'],
    [429, 'RATE_LIMITED', 'RATE_LIMITED'],
    [503, 'NOT_READY', 'NOT_READY'],
  ] as const)('maps HTTP %s to %s', async (status, code, kind) => {
    const client = new OneShotApiClient({
      fetchFn: async () => json(status, { code, message: code, correlation_id: 'corr-1' }),
    });
    await expect(client.createOrReplayIntent(request, 'corr-1')).resolves.toMatchObject({ kind });
  });

  it('fails closed on a network error', async () => {
    const client = new OneShotApiClient({
      fetchFn: async () => {
        throw new Error('offline');
      },
    });
    await expect(client.createOrReplayIntent(request)).resolves.toMatchObject({
      kind: 'ERROR',
      code: 'NETWORK_ERROR',
    });
  });
});

describe('JobApiClient durable request listing', () => {
  it('loads team-report and paid-API requests from the unified request endpoint', async () => {
    const body: RequestListResponse = {
      requests: [
        {
          business_intent_id: 'intent-paid-api-list',
          task_key: 'circle-api-list',
          tool_id: 'circle-x402-api-v1',
          resource_url: 'https://supplier.example.test/api/dataset',
          payment_state: 'UNKNOWN',
          quote: {
            supplier_id: 'circle-x402-v1',
            resource_url: 'https://supplier.example.test/api/dataset',
            recipient: '0x1111111111111111111111111111111111111111',
            amount_atomic: '10000',
            asset: 'USDC',
            network: 'eip155:5042002',
            x402_version: 2,
            max_timeout_seconds: 60,
          },
          created_at: '2026-09-13T00:00:00.000Z',
          updated_at: '2026-09-13T00:00:00.000Z',
        },
      ],
    };
    const calls: string[] = [];
    const client = new JobApiClient({
      baseUrl: 'https://oneshot.example.test',
      fetchFn: async (input) => {
        calls.push(String(input));
        return json(200, body);
      },
    });

    await expect(client.listRequests()).resolves.toEqual(body.requests);
    expect(calls).toEqual(['https://oneshot.example.test/v1/requests']);
  });

  it('falls back to the legacy job list when the unified endpoint is unavailable', async () => {
    const calls: string[] = [];
    const client = new JobApiClient({
      baseUrl: 'https://oneshot.example.test',
      fetchFn: async (input) => {
        calls.push(String(input));
        return calls.length === 1 ? json(404, {}) : json(200, { jobs: [] });
      },
    });

    await expect(client.listRequests()).resolves.toEqual([]);
    expect(calls).toEqual([
      'https://oneshot.example.test/v1/requests',
      'https://oneshot.example.test/v1/jobs',
    ]);
  });
});
