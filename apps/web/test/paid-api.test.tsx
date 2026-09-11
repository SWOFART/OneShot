import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CircleX402DemoPanel } from '../src/components/JobWorkspace.js';
import { PaidApiClient } from '../src/api/paid-api-client.js';

afterEach(cleanup);

const quote = {
  supplier_id: 'circle-x402-v1' as const,
  resource_url: 'https://x402.example.test/api/dataset',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '10000',
  asset: 'USDC' as const,
  network: 'eip155:5042002' as const,
  x402_version: 2,
  max_timeout_seconds: 60,
};

const approved = {
  business_intent_id: 'intent_paid-api-test',
  task_key: 'circle-api-test',
  tool_id: 'circle-x402-api-v1' as const,
  resource_url: quote.resource_url,
  payment_state: 'SUBMITTING' as const,
  quote,
  provider_transaction_hash: `0x${'a'.repeat(64)}`,
  created_at: '2026-09-11T12:00:00.000Z',
  updated_at: '2026-09-11T12:00:00.000Z',
};

describe('Circle x402 paid API workspace flow', () => {
  it('uses the site API quote, approval, and read-only refresh endpoints', async () => {
    const calls: string[] = [];
    const client = new PaidApiClient({
      baseUrl: 'https://oneshot.example.test',
      getAuthToken: () => 'operator-token',
      fetchFn: async (input, init) => {
        calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
        return new Response(JSON.stringify(calls.length === 1 ? quote : approved), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await expect(
      client.quote({ task_key: 'circle-api-test', tool_id: 'circle-x402-api-v1' }),
    ).resolves.toEqual(quote);
    await expect(
      client.start({ task_key: 'circle-api-test', tool_id: 'circle-x402-api-v1' }),
    ).resolves.toEqual(approved);
    await expect(client.get(approved.business_intent_id)).resolves.toEqual(approved);
    expect(calls).toEqual([
      'POST https://oneshot.example.test/v1/paid-api/quote',
      'POST https://oneshot.example.test/v1/paid-api',
      'GET https://oneshot.example.test/v1/paid-api/intent_paid-api-test',
    ]);
  });

  it('quotes and approves one stable task key, then links the provider hash to ArcScan', async () => {
    const user = userEvent.setup();
    const start = vi.fn(async () => approved);
    const onSelectIntent = vi.fn();
    const client = {
      quote: vi.fn(async () => quote),
      start,
      get: vi.fn(async () => approved),
    };
    render(<CircleX402DemoPanel client={client} onSelectIntent={onSelectIntent} />);

    await user.click(screen.getByRole('button', { name: 'Check live quote' }));
    expect(await screen.findByText('Review x402 quote')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Approve and buy API result' }));

    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(onSelectIntent).toHaveBeenCalledWith(approved.business_intent_id);
    expect((await screen.findByText('View on ArcScan')).getAttribute('href')).toBe(
      `https://testnet.arcscan.app/tx/${approved.provider_transaction_hash}`,
    );
    expect(screen.getByText(/do not approve a new task key/u)).toBeTruthy();
  });
});
