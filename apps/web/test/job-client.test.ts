import type { SupplierQuote } from '@oneshot/contracts';
import { describe, expect, it } from 'vitest';

import { JobApiClient } from '../src/api/job-client.js';

const request = {
  task_key: 'report-acme-demo',
  tool_id: 'team-report-v1' as const,
  report_subject: 'acme.com',
};

const quote: SupplierQuote = {
  supplier_id: 'team-report-v1',
  order_reference: 'team_report_order_demo',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '10000',
  asset: 'USDC',
  network: 'eip155:5042002',
  expires_at: '2026-09-11T12:15:00.000Z',
};

describe('JobApiClient quote flow', () => {
  it('requests a non-chargeable quote with the authenticated task payload', async () => {
    let calledUrl = '';
    let calledBody = '';
    const client = new JobApiClient({
      getAuthToken: () => 'demo-token',
      fetchFn: async (input, init) => {
        calledUrl = String(input);
        calledBody = String(init?.body);
        return new Response(JSON.stringify(quote), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await expect(client.quote(request)).resolves.toEqual(quote);
    expect(calledUrl).toBe('/v1/jobs/quote');
    expect(JSON.parse(calledBody)).toEqual(request);
  });
});
