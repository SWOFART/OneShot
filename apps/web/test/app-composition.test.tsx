import { createInMemoryRecoveryClient, recoveryScenarioPages } from '@oneshot/recovery-ui';
import {
  createInMemorySettlementClient,
  SETTLEMENT_SCENARIO_INTENTS,
} from '@oneshot/settlement-ui';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App.js';
import { OneShotApiClient } from '../src/api/client.js';
import type { JobApiClient } from '../src/api/job-client.js';
import { signedInSession } from './support/fake-session.js';

afterEach(cleanup);

describe('Gate P5 shell composition', () => {
  it('separates the public landing page from the authenticated cabinet route', () => {
    const landing = render(<App route="/" />);
    expect(screen.getByRole('heading', { name: /Resume the job, not the payment/u })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Open workspace/u })[0]?.getAttribute('href')).toBe(
      '/app',
    );
    landing.unmount();

    render(
      <App
        route="/app"
        useOperatorSession={() => signedInSession()}
        apiClient={
          new OneShotApiClient({
            fetchFn: async () =>
              new Response(JSON.stringify({ status: 'ok' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
          })
        }
        settlementClient={createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS)}
        recoveryClient={createInMemoryRecoveryClient('lagging')}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Your payment workspace', level: 1 })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'API services' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Requests' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Payment protection' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Spending rules' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Team & access' })).toBeTruthy();
  });

  it('gives API services and Requests distinct responsibilities', async () => {
    const user = userEvent.setup();
    const jobClient = {
      async list() {
        return [];
      },
      async start() {
        throw new Error('not used');
      },
      async resume() {
        throw new Error('not used');
      },
      async result() {
        return null;
      },
      async refreshActivity() {
        return {
          recorded_settlement_count: 0,
          uncertain_job_count: 0,
          unmatched_transfer_count: 0,
          transfers: [],
        };
      },
    } as unknown as JobApiClient;
    render(
      <App
        route="/app"
        useOperatorSession={() => signedInSession()}
        jobClient={jobClient}
        apiClient={
          new OneShotApiClient({
            fetchFn: async () =>
              new Response(JSON.stringify({ status: 'ok' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
          })
        }
        settlementClient={createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS)}
        recoveryClient={createInMemoryRecoveryClient('lagging')}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'API services' }));
    expect(screen.getByRole('heading', { name: 'Company research service' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Requests and results', level: 2 })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Requests' }));
    expect(
      await screen.findByRole('heading', { name: 'Requests and results', level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText(/Open API services to start/u)).toBeTruthy();
  });

  it('mounts A05, B05, and C05 without a settlement bypass', async () => {
    const settlementIntent = Object.values(SETTLEMENT_SCENARIO_INTENTS)[0];
    if (!settlementIntent) throw new Error('Settlement fixture missing');
    const apiClient = new OneShotApiClient({
      fetchFn: async () =>
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const user = userEvent.setup();
    render(
      <App
        apiClient={apiClient}
        settlementClient={createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS)}
        recoveryClient={createInMemoryRecoveryClient('lagging')}
        useOperatorSession={() => signedInSession()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Your payment workspace', level: 2 })).toBeTruthy();

    await user.type(
      screen.getByLabelText('Request identifier'),
      settlementIntent.business_intent_id,
    );
    await user.click(screen.getByRole('tab', { name: 'Payment proof' }));
    expect(await screen.findByText('Authorization')).toBeTruthy();

    await user.clear(screen.getByLabelText('Request identifier'));
    await user.type(
      screen.getByLabelText('Request identifier'),
      recoveryScenarioPages.lagging[0]?.businessIntentId ?? '',
    );
    await user.click(screen.getByRole('tab', { name: 'Protection checks' }));
    expect(await screen.findByText('Subgraph MCP')).toBeTruthy();
    expect(screen.getByText('LAGGING')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /force|pay|submit settlement/iu })).toBeNull();
  });
});
