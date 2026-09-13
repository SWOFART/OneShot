import type { SupplierQuote } from '@oneshot/contracts';
import { describe, expect, it } from 'vitest';

import { JobApiClient } from '../src/api/job-client.js';

const request = {
  task_key: 'report-acme-demo',
  tool_id: 'team-report-v1' as const,
  report_subject: 'acme.com',
  recipient: '0x1111111111111111111111111111111111111111',
  amount_atomic: '10000',
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
  it('reads one job without listing the workspace jobs', async () => {
    let calledUrl = '';
    const job = { job_id: 'job-1', delivery_state: 'PENDING' };
    const client = new JobApiClient({
      fetchFn: async (input) => {
        calledUrl = String(input);
        return new Response(JSON.stringify(job), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await expect(client.get('job-1')).resolves.toEqual(job);
    expect(calledUrl).toBe('/v1/jobs/job-1');
  });

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

  it('issues a personal MCP credential with the active authorization', async () => {
    let calledUrl = '';
    let authorization = '';
    const credential = {
      bearer_token: 'personal-token',
      created_at: '2026-09-13T04:00:00.000Z',
    };
    const client = new JobApiClient({
      getAuthToken: () => 'privy-access-token',
      fetchFn: async (input, init) => {
        calledUrl = String(input);
        authorization = new Headers(init?.headers).get('authorization') ?? '';
        return new Response(JSON.stringify(credential), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await expect(client.issueMcpCredential(true)).resolves.toEqual(credential);
    expect(calledUrl).toBe('/v1/profile/mcp-token/rotate');
    expect(authorization).toBe('Bearer privy-access-token');
  });

  it('refreshes activity without sending an empty JSON body', async () => {
    let calledInit: RequestInit | undefined;
    const client = new JobApiClient({
      getAuthToken: () => 'demo-token',
      fetchFn: async (_input, init) => {
        calledInit = init;
        return new Response(JSON.stringify({ observations: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await expect(client.refreshActivity()).resolves.toEqual({ observations: [] });
    expect(calledInit?.method).toBe('POST');
    expect(new Headers(calledInit?.headers).get('content-type')).toBeNull();
    expect(calledInit?.body).toBeUndefined();
  });
});
