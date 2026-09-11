import type { IntentResponse, IntentState } from '@oneshot/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { OneShotApiClient } from '../src/api/client.js';
import { IntentForm } from '../src/components/IntentForm.js';
import { IntentStatusView } from '../src/components/IntentStatusView.js';
import { JobWorkspace } from '../src/components/JobWorkspace.js';

afterEach(cleanup);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function intent(state: IntentState): IntentResponse {
  return {
    business_intent_id: 'intent-web-1',
    recipient: '0x1111111111111111111111111111111111111111',
    amount_atomic: '1000000',
    asset: 'USDC',
    network: 'eip155:5042002',
    purpose: 'Paid API job',
    payload_fingerprint: 'fingerprint',
    state,
    version: 1,
    attempts: [],
    evidence: [],
  };
}

describe('IntentForm', () => {
  it('preserves the stable ID and explains an identical replay', async () => {
    const client = new OneShotApiClient({
      fetchFn: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { business_intent_id: string };
        return json(200, { ...intent('READY'), business_intent_id: body.business_intent_id });
      },
    });
    const user = userEvent.setup();
    render(<IntentForm client={client} />);

    const id = screen.getByLabelText(/Business Intent ID/u) as HTMLInputElement;
    const stableId = id.value;
    await user.type(
      screen.getByLabelText(/Recipient/u),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Submit Intent/u }));

    expect(await screen.findByText(/REPLAYED/u)).toBeTruthy();
    expect(id.value).toBe(stableId);
  });

  it('shows payload conflict without generating another ID', async () => {
    const client = new OneShotApiClient({
      fetchFn: async () =>
        json(409, {
          code: 'INTENT_PAYLOAD_CONFLICT',
          message: 'different payload',
          correlation_id: 'corr-1',
        }),
    });
    const user = userEvent.setup();
    render(<IntentForm client={client} />);
    const id = screen.getByLabelText(/Business Intent ID/u) as HTMLInputElement;
    const stableId = id.value;
    await user.type(
      screen.getByLabelText(/Recipient/u),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Submit Intent/u }));

    expect(await screen.findByText(/PAYLOAD CONFLICT/u)).toBeTruthy();
    expect(id.value).toBe(stableId);
  });

  it.each([
    [403, 'AUTHORIZATION DENIED'],
    [503, 'SERVICE UNAVAILABLE'],
  ] as const)('names safe create failure %s without offering a bypass', async (status, title) => {
    const client = new OneShotApiClient({
      fetchFn: async () => json(status, { message: 'safe failure' }),
    });
    const user = userEvent.setup();
    render(<IntentForm client={client} />);
    await user.type(
      screen.getByLabelText(/Recipient/u),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Submit Intent/u }));

    expect(await screen.findByText(new RegExp(title, 'u'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: /force|bypass|pay/iu })).toBeNull();
  });

  it('has no detectable structural accessibility violations', async () => {
    const client = new OneShotApiClient({ fetchFn: async () => json(503, {}) });
    const { container } = render(<IntentForm client={client} />);
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([]);
  });
});

describe('IntentStatusView', () => {
  it.each([
    'AUTHORIZING',
    'READY',
    'SUBMITTING',
    'COMMITTED',
    'FAILED_SAFE',
    'UNKNOWN',
    'REJECTED',
  ] as const)('renders authoritative %s state', async (state) => {
    const client = new OneShotApiClient({ fetchFn: async () => json(200, intent(state)) });
    render(<IntentStatusView client={client} initialIntentId="intent-web-1" />);
    await waitFor(() => expect(screen.getByText(state)).toBeTruthy());
  });

  it('holds UNKNOWN and only offers reconciliation', async () => {
    const client = new OneShotApiClient({
      fetchFn: async (input, init) => {
        if (String(input).endsWith('/reconcile') && init?.method === 'POST') {
          return json(202, { business_intent_id: 'intent-web-1', queued: true, state: 'UNKNOWN' });
        }
        return json(200, intent('UNKNOWN'));
      },
    });
    const user = userEvent.setup();
    render(<IntentStatusView client={client} initialIntentId="intent-web-1" />);

    const reconcile = await screen.findByRole('button', { name: /Enqueue Reconciliation/u });
    expect(screen.queryByRole('button', { name: /pay|retry settlement/iu })).toBeNull();
    await user.click(reconcile);
    expect(await screen.findByText(/job enqueued/u)).toBeTruthy();
  });
});

describe('JobWorkspace payment inputs', () => {
  it('sends the entered recipient and integer atomic amount to the quote boundary', async () => {
    const user = userEvent.setup();
    let quotedRequest: unknown;
    const client = {
      async quote(request: unknown) {
        quotedRequest = request;
        return {
          supplier_id: 'team-report-v1' as const,
          order_reference: 'team_report_order_ui',
          recipient: '0x2222222222222222222222222222222222222222',
          amount_atomic: '1250000',
          asset: 'USDC' as const,
          network: 'eip155:5042002' as const,
          expires_at: '2026-09-11T12:15:00.000Z',
        };
      },
    };
    render(<JobWorkspace client={client as never} onSelectIntent={() => undefined} />);

    await user.type(screen.getByLabelText('Company or domain'), 'acme.com');
    await user.type(
      screen.getByLabelText('Recipient wallet'),
      '0x2222222222222222222222222222222222222222',
    );
    await user.type(screen.getByLabelText('Amount (USDC)'), '1.25');
    await user.click(screen.getByRole('button', { name: 'Get live quote' }));

    await waitFor(() => expect(quotedRequest).toEqual({
      task_key: expect.stringMatching(/^report-acme-com-/u),
      tool_id: 'team-report-v1',
      report_subject: 'acme.com',
      recipient: '0x2222222222222222222222222222222222222222',
      amount_atomic: '1250000',
    }));
  });
});
