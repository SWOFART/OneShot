import type { IntentResponse, IntentState } from '@oneshot/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OneShotApiClient } from '../src/api/client.js';
import { IntentForm } from '../src/components/IntentForm.js';
import { IntentStatusView } from '../src/components/IntentStatusView.js';
import { JobList, JobWorkspace } from '../src/components/JobWorkspace.js';

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

    const id = screen.getByLabelText(/Request key/u) as HTMLInputElement;
    const stableId = id.value;
    await user.type(
      screen.getByLabelText(/Service destination/u),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Create request/u }));

    expect(await screen.findByText(/Existing request reused/u)).toBeTruthy();
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
    const id = screen.getByLabelText(/Request key/u) as HTMLInputElement;
    const stableId = id.value;
    await user.type(
      screen.getByLabelText(/Service destination/u),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Create request/u }));

    expect(await screen.findByText(/Request details changed/u)).toBeTruthy();
    expect(id.value).toBe(stableId);
  });

  it.each([
    [403, 'Request not approved'],
    [503, 'Service unavailable'],
  ] as const)('names safe create failure %s without offering a bypass', async (status, title) => {
    const client = new OneShotApiClient({
      fetchFn: async () => json(status, { message: 'safe failure' }),
    });
    const user = userEvent.setup();
    render(<IntentForm client={client} />);
    await user.type(
      screen.getByLabelText(/Service destination/u),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Create request/u }));

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
  ] as const)('renders user-facing status for %s state', async (state) => {
    const labels: Record<IntentState, string> = {
      AUTHORIZING: 'Authorizing payment',
      READY: 'Ready to pay',
      SUBMITTING: 'Payment in progress',
      COMMITTED: 'Paid and confirmed',
      FAILED_SAFE: 'Stopped safely',
      UNKNOWN: 'Checking payment',
      REJECTED: 'Not approved',
    };
    const client = new OneShotApiClient({ fetchFn: async () => json(200, intent(state)) });
    render(<IntentStatusView client={client} initialIntentId="intent-web-1" />);
    await waitFor(() => expect(screen.getByText(labels[state])).toBeTruthy());
  });

  it('holds an unresolved payment and only offers evidence checks', async () => {
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

    const reconcile = await screen.findByRole('button', { name: /Check payment status/u });
    expect(screen.queryByRole('button', { name: /^(?:pay|retry settlement)$/iu })).toBeNull();
    await user.click(reconcile);
    expect(await screen.findByText(/Payment check queued/u)).toBeTruthy();
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

    await user.type(screen.getByLabelText('Payment purpose'), 'acme.com');
    await user.type(
      screen.getByLabelText('Service destination wallet'),
      '0x2222222222222222222222222222222222222222',
    );
    await user.type(screen.getByLabelText('Amount (USDC)'), '1.25');
    await user.click(screen.getByRole('button', { name: 'Review payment details' }));

    await waitFor(() =>
      expect(quotedRequest).toEqual({
        task_key: expect.stringMatching(/^report-acme-com-/u),
        tool_id: 'team-report-v1',
        report_subject: 'acme.com',
        recipient: '0x2222222222222222222222222222222222222222',
        amount_atomic: '1250000',
      }),
    );
  });

  it('pays the reviewed report through the selected browser wallet', async () => {
    const user = userEvent.setup();
    const payerWallet = '0x3333333333333333333333333333333333333333';
    const paymentHash = `0x${'a'.repeat(64)}`;
    const request = {
      task_key: 'report-214124-850d9a80',
      tool_id: 'team-report-v1' as const,
      report_subject: '214124',
      recipient: '0x292d3FCA76142E0C6136B934563f3A0750b633eb',
      amount_atomic: '1000000',
    };
    const supplier = {
      supplier_id: 'team-report-v1' as const,
      order_reference: 'team-report-214124',
      recipient: request.recipient,
      amount_atomic: request.amount_atomic,
      asset: 'USDC' as const,
      network: 'eip155:5042002' as const,
      expires_at: '2099-09-13T02:00:00.000Z',
    };
    const payment = {
      chain_id: 5042002 as const,
      network: 'eip155:5042002' as const,
      token_contract: '0x3600000000000000000000000000000000000000',
      payer_wallet: payerWallet,
      recipient: request.recipient,
      amount_atomic: request.amount_atomic,
    };
    const preparedJob = {
      job_id: 'job-report-214124',
      ...request,
      business_intent_id: 'intent-report-214124',
      supplier,
      payment_state: 'READY' as const,
      payment_mode: 'USER_WALLET' as const,
      user_payment: payment,
      delivery_state: 'PENDING' as const,
      created_at: '2026-09-13T01:30:00.000Z',
      updated_at: '2026-09-13T01:30:00.000Z',
    };
    const committedJob = {
      ...preparedJob,
      payment_state: 'COMMITTED' as const,
      user_payment: { ...payment, transaction_hash: paymentHash },
    };
    const sendTransfer = vi.fn(async () => paymentHash);
    const client = {
      quote: vi.fn(async () => supplier),
      start: vi.fn(),
      prepareUserWalletJob: vi.fn(async () => preparedJob),
      submitUserWalletPayment: vi.fn(async () => committedJob),
    };

    render(
      <JobWorkspace
        client={client as never}
        userWallet={{
          address: payerWallet,
          connect: vi.fn(async () => payerWallet),
          getGatewayBalance: vi.fn(async () => '0'),
          getGatewayPendingDeposits: vi.fn(async () => []),
          fundGateway: vi.fn(),
          sendTransfer,
          signX402Payment: vi.fn(),
        }}
        onSelectIntent={() => undefined}
      />,
    );
    await user.type(screen.getByLabelText('Payment purpose'), request.report_subject);
    await user.type(screen.getByLabelText('Service destination wallet'), request.recipient);
    await user.type(screen.getByLabelText('Amount (USDC)'), '1');
    await user.type(screen.getByLabelText('Custom request key (optional)'), request.task_key);
    await user.click(screen.getByRole('button', { name: 'Review payment details' }));
    await user.click(await screen.findByRole('button', { name: 'Approve and pay from my wallet' }));

    await waitFor(() =>
      expect(client.prepareUserWalletJob).toHaveBeenCalledWith({
        ...request,
        payer_wallet: payerWallet,
      }),
    );
    expect(sendTransfer).toHaveBeenCalledWith(payment);
    expect(client.submitUserWalletPayment).toHaveBeenCalledWith(
      preparedJob.job_id,
      paymentHash,
    );
    expect(client.start).not.toHaveBeenCalled();
  });

  it('does not request a replacement transfer when the durable job already has a hash', async () => {
    const user = userEvent.setup();
    const paymentHash = `0x${'a'.repeat(64)}`;
    const job = {
      job_id: 'job-user-wallet-existing',
      task_key: 'report-existing',
      tool_id: 'team-report-v1' as const,
      business_intent_id: 'intent-user-wallet-existing',
      supplier: {
        supplier_id: 'team-report-v1' as const,
        order_reference: 'team-report-existing',
        recipient: '0x2222222222222222222222222222222222222222',
        amount_atomic: '1000000',
        asset: 'USDC' as const,
        network: 'eip155:5042002' as const,
        expires_at: '2026-09-12T22:00:00.000Z',
      },
      payment_state: 'UNKNOWN' as const,
      payment_mode: 'USER_WALLET' as const,
      user_payment: {
        chain_id: 5042002 as const,
        network: 'eip155:5042002' as const,
        token_contract: '0x3600000000000000000000000000000000000000',
        payer_wallet: '0x3333333333333333333333333333333333333333',
        recipient: '0x2222222222222222222222222222222222222222',
        amount_atomic: '1000000',
        transaction_hash: paymentHash,
      },
      delivery_state: 'PENDING' as const,
      created_at: '2026-09-12T19:00:00.000Z',
      updated_at: '2026-09-12T19:00:00.000Z',
    };
    const sendTransfer = vi.fn();
    const client = {
      quote: vi.fn(async () => job.supplier),
      prepareUserWalletJob: vi.fn(async () => job),
      submitUserWalletPayment: vi.fn(),
    };
    render(
      <JobWorkspace
        client={client as never}
        userWallet={{
          address: job.user_payment.payer_wallet,
          connect: vi.fn(async () => job.user_payment.payer_wallet),
          getGatewayBalance: vi.fn(async () => '0'),
          getGatewayPendingDeposits: vi.fn(async () => []),
          fundGateway: vi.fn(),
          sendTransfer,
          signX402Payment: vi.fn(),
        }}
        onSelectIntent={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('Payment purpose'), 'existing');
    await user.type(screen.getByLabelText('Service destination wallet'), job.supplier.recipient);
    await user.type(screen.getByLabelText('Amount (USDC)'), '1');
    await user.click(screen.getByRole('button', { name: 'Review payment details' }));
    await user.click(screen.getByRole('button', { name: 'Approve and pay from my wallet' }));

    expect(
      await screen.findByText(/original wallet transaction is already recorded/u),
    ).toBeTruthy();
    expect(sendTransfer).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /Check payment \(same transaction\)/u }),
    ).toBeTruthy();
  });

  it('rechecks only the stored user-wallet transaction from Requests', async () => {
    const user = userEvent.setup();
    const paymentHash = `0x${'b'.repeat(64)}`;
    const unknownJob = {
      job_id: 'job-user-wallet-unknown',
      task_key: 'report-unknown',
      tool_id: 'team-report-v1' as const,
      business_intent_id: 'intent-user-wallet-unknown',
      supplier: {
        supplier_id: 'team-report-v1' as const,
        order_reference: 'team-report-unknown',
        recipient: '0x2222222222222222222222222222222222222222',
        amount_atomic: '1000000',
        asset: 'USDC' as const,
        network: 'eip155:5042002' as const,
        expires_at: '2026-09-12T22:00:00.000Z',
      },
      payment_state: 'UNKNOWN' as const,
      payment_mode: 'USER_WALLET' as const,
      user_payment: {
        chain_id: 5042002 as const,
        network: 'eip155:5042002' as const,
        token_contract: '0x3600000000000000000000000000000000000000',
        payer_wallet: '0x3333333333333333333333333333333333333333',
        recipient: '0x2222222222222222222222222222222222222222',
        amount_atomic: '1000000',
        transaction_hash: paymentHash,
      },
      delivery_state: 'PENDING' as const,
      created_at: '2026-09-12T19:00:00.000Z',
      updated_at: '2026-09-12T19:00:00.000Z',
    };
    const client = {
      list: vi.fn(async () => [unknownJob]),
      submitUserWalletPayment: vi.fn(async () => unknownJob),
    };
    render(<JobList client={client as never} onSelectIntent={() => undefined} />);

    await user.click(await screen.findByRole('button', { name: /Check recorded transaction/u }));
    await waitFor(() =>
      expect(client.submitUserWalletPayment).toHaveBeenCalledWith(unknownJob.job_id, paymentHash),
    );
    expect(client.list).toHaveBeenCalledTimes(2);
  });
});
