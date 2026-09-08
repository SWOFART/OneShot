// @vitest-environment jsdom

import type { IntentResponse } from '@oneshot/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  SettlementClientError,
  createInMemorySettlementClient,
  createMockSettlementClient,
  createSettlementClient,
  type SettlementClient,
} from '../src/client.js';
import { SETTLEMENT_SCENARIOS, SETTLEMENT_SCENARIO_INTENTS } from '../src/fixtures.js';
import { SettlementDetailsRoute } from '../src/SettlementDetailsRoute.js';

afterEach(cleanup);

const COMMITTED_ID = '018f-ui-committed-001';

function renderRoute(businessIntentId: string, client: SettlementClient) {
  return render(createElement(SettlementDetailsRoute, { businessIntentId, client }));
}

describe('settlement details route', () => {
  it('renders the loading state before the read resolves', () => {
    const client: SettlementClient = { readIntent: () => new Promise<IntentResponse>(() => {}) };
    const { container } = renderRoute(COMMITTED_ID, client);
    expect(screen.getByText('Loading settlement details…')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the composed slice once the intent resolves', async () => {
    const client = createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS);
    renderRoute(COMMITTED_ID, client);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Transaction' })).toBeTruthy();
    });
    expect(screen.getByRole('heading', { level: 1, name: COMMITTED_ID })).toBeTruthy();
  });

  it.each([
    ['INTENT_NOT_FOUND', 'Business Intent not found'],
    ['EVIDENCE_UNAVAILABLE', 'Evidence unavailable'],
    ['UNAUTHORIZED', 'Not authorized'],
    ['TRANSPORT_UNAVAILABLE', 'Service unavailable'],
  ] as const)('renders the %s failure as %s', async (failure, heading) => {
    const client = createInMemorySettlementClient({}, { [COMMITTED_ID]: failure });
    renderRoute(COMMITTED_ID, client);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });

  it('says unavailable evidence is not proof that no payment happened', async () => {
    const client = createInMemorySettlementClient({}, { [COMMITTED_ID]: 'EVIDENCE_UNAVAILABLE' });
    renderRoute(COMMITTED_ID, client);
    await waitFor(() => {
      expect(
        screen.getByText(/unavailable evidence is not proof that no payment happened/u),
      ).toBeTruthy();
    });
  });

  it('withholds a response that carries a sensitive field', async () => {
    const client: SettlementClient = {
      readIntent: () =>
        Promise.resolve({
          ...(SETTLEMENT_SCENARIOS['authorized-committed']?.intent as IntentResponse),
          wallet_private_key: '0xdeadbeef',
        } as unknown as IntentResponse),
    };
    const { container } = renderRoute(COMMITTED_ID, client);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Response withheld' })).toBeTruthy();
    });
    expect(container.innerHTML).not.toContain('0xdeadbeef');
  });

  it('exposes no interactive control in any failure state', async () => {
    const client = createInMemorySettlementClient({}, { [COMMITTED_ID]: 'EVIDENCE_UNAVAILABLE' });
    const { container } = renderRoute(COMMITTED_ID, client);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(container.querySelectorAll('button, a, input')).toHaveLength(0);
  });
});

describe('settlement client', () => {
  it('reads an intent through the frozen mock server', async () => {
    const client = createMockSettlementClient();
    const intent = await client.readIntent(COMMITTED_ID);
    expect(intent.business_intent_id).toBe(COMMITTED_ID);
    expect(intent.state).toBe('COMMITTED');
  });

  it('maps HTTP status codes to failure kinds', async () => {
    const statuses = [
      [404, 'INTENT_NOT_FOUND'],
      [401, 'UNAUTHORIZED'],
      [403, 'UNAUTHORIZED'],
      [503, 'EVIDENCE_UNAVAILABLE'],
      [500, 'TRANSPORT_UNAVAILABLE'],
    ] as const;

    for (const [status, failure] of statuses) {
      const client = createSettlementClient({
        baseUrl: 'https://api.test',
        fetcher: () => Promise.resolve(new Response('{}', { status })),
      });
      await expect(client.readIntent(COMMITTED_ID)).rejects.toMatchObject({ failure });
    }
  });

  it('reports a transport failure when the request throws', async () => {
    const client = createSettlementClient({
      baseUrl: 'https://api.test',
      fetcher: () => Promise.reject(new Error('offline')),
    });
    await expect(client.readIntent(COMMITTED_ID)).rejects.toBeInstanceOf(SettlementClientError);
  });

  it('sends the bearer token only when one is supplied', async () => {
    const seen: Array<Record<string, string>> = [];
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push((init?.headers ?? {}) as Record<string, string>);
      return Promise.resolve(
        new Response(JSON.stringify(SETTLEMENT_SCENARIO_INTENTS[COMMITTED_ID]), { status: 200 }),
      );
    };

    await createSettlementClient({ baseUrl: 'https://api.test', fetcher }).readIntent(COMMITTED_ID);
    await createSettlementClient({
      baseUrl: 'https://api.test',
      fetcher,
      getAuthToken: () => 'demo-token',
    }).readIntent(COMMITTED_ID);

    expect(seen[0]?.authorization).toBeUndefined();
    expect(seen[1]?.authorization).toBe('Bearer demo-token');
  });

  it('escapes the identifier in the request path', async () => {
    const urls: string[] = [];
    const client = createSettlementClient({
      baseUrl: 'https://api.test',
      fetcher: (input) => {
        urls.push(String(input));
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
    });
    await expect(client.readIntent('../../admin?x=1')).rejects.toBeInstanceOf(
      SettlementClientError,
    );
    expect(urls[0]).toBe('https://api.test/v1/intents/..%2F..%2Fadmin%3Fx%3D1');
  });
});
