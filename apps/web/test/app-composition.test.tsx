import { createInMemoryRecoveryClient, recoveryScenarioPages } from '@oneshot/recovery-ui';
import {
  createInMemorySettlementClient,
  SETTLEMENT_SCENARIO_INTENTS,
} from '@oneshot/settlement-ui';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { OneShotApiClient } from '../src/api/client.js';
import type { JobApiClient } from '../src/api/job-client.js';
import { signedInSession } from './support/fake-session.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('Gate P5 shell composition', () => {
  it('separates the public landing page from the authenticated cabinet route', () => {
    const landing = render(<App route="/" />);
    expect(screen.getByRole('heading', { name: /Resume the job, not the payment/u })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Open workspace/u })[0]?.getAttribute('href')).toBe(
      '/app',
    );
    expect(screen.getByRole('link', { name: 'Connect an agent' }).getAttribute('href')).toBe(
      '/docs/mcp',
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
    expect(screen.getByRole('tab', { name: 'Payment services' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Requests' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Payment proof' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeTruthy();
  });

  it('publishes a safe MCP client configuration and replay walkthrough', () => {
    render(<App route="/docs/mcp" />);

    expect(
      screen.getByRole('heading', { name: 'Connect an agent to one safe payment tool.' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('MCP client configuration').textContent).toContain(
      'https://oneshot.kapustazh.dev/mcp',
    );
    expect(screen.getByLabelText('MCP client configuration').textContent).toContain(
      '<ONESHOT_MCP_BEARER_TOKEN>',
    );
    expect(screen.getByLabelText('arc_payment tool input').textContent).toContain(
      'report-one-approved-demo-purchase-850d9a80',
    );
    expect(screen.getByLabelText('Agent skill install command').textContent).toContain(
      'npx --yes skills@latest add',
    );
    expect(screen.queryByText(/1000000 atomic units/u)).toBeNull();
    expect(screen.queryByRole('button', { name: /pay|submit|run/iu })).toBeNull();
  });

  it('offers only the working cabinet sections', () => {
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

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Payment services',
      'Requests',
      'Payment proof',
      'Profile',
    ]);
    // Spending rules and Team & access were read-only restatements of facts the
    // other sections already show, and neither had a control behind it.
    expect(screen.queryByRole('tab', { name: 'Spending rules' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Team & access' })).toBeNull();
  });

  it('generates a personal MCP bearer in Profile', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const jobClient = {
      async mcpCredentialStatus() {
        return { configured: false };
      },
      async issueMcpCredential() {
        return {
          bearer_token: 'personal-secret-token',
          created_at: '2026-09-13T04:00:00.000Z',
        };
      },
    } as unknown as JobApiClient;
    render(
      <App
        route="/app"
        useOperatorSession={() => signedInSession()}
        jobClient={jobClient}
        settlementClient={createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS)}
        recoveryClient={createInMemoryRecoveryClient('lagging')}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Profile' }));
    expect(screen.getByRole('link', { name: 'Open MCP documentation' }).getAttribute('href')).toBe(
      '/docs/mcp',
    );
    await user.click(await screen.findByRole('button', { name: 'Generate bearer token' }));
    expect(
      (await screen.findByLabelText('Personal MCP client configuration')).textContent,
    ).toContain('Bearer personal-secret-token');
    await user.click(screen.getByRole('button', { name: 'Copy bearer token' }));
    expect(writeText).toHaveBeenCalledWith('personal-secret-token');
    expect(screen.getByRole('button', { name: 'Bearer copied' })).toBeTruthy();
    expect(screen.queryByText('profile-request')).toBeNull();
  });

  it('gives Payment services and Requests distinct responsibilities', async () => {
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
          transactions: [],
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

    await user.click(screen.getByRole('tab', { name: 'Payment services' }));
    expect(screen.getByRole('heading', { name: 'Direct Arc payment' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Requests and results', level: 2 })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Requests' }));
    expect(
      await screen.findByRole('heading', { name: 'Requests and results', level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText(/Open Payment services to start/u)).toBeTruthy();
  });

  it('shows Graph evidence beside every site payment outcome', async () => {
    const hash = `0x${'a'.repeat(64)}`;
    const jobClient = {
      async refreshActivity() {
        return {
          observation: { freshness: 'FRESH' },
          recorded_settlement_count: 0,
          uncertain_job_count: 0,
          unmatched_transfer_count: 0,
          transactions: [
            {
              job_id: 'job-graph-evidence',
              business_intent_id: 'intent-graph-evidence',
              payment_state: 'FAILED_SAFE' as const,
              payment_mode: 'USER_WALLET' as const,
              transaction_hash: hash,
              recipient: '0x1111111111111111111111111111111111111111',
              amount_atomic: '1000000',
              graph_status: 'NOT_INDEXED' as const,
            },
          ],
          transfers: [],
        };
      },
    } as unknown as JobApiClient;

    render(
      <App
        route="/app"
        useOperatorSession={() => signedInSession()}
        jobClient={jobClient}
        settlementClient={createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS)}
        recoveryClient={createInMemoryRecoveryClient('lagging')}
      />,
    );

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Payment proof' }));
    expect(await screen.findByText('FAILED_SAFE')).toBeTruthy();
    expect(screen.getByText('Hash not indexed')).toBeTruthy();
    expect(screen.getByText(/not proof that payment did not happen/u)).toBeTruthy();
  });

  /**
   * The tab strip faded on its own while the panel behind it appeared
   * instantly: the console panel was never wrapped, and the request list
   * arrives from the API after the cabinet panel's own fade has finished. Both
   * are keyed, so React remounts them and the fade runs on the content the
   * operator is actually waiting for.
   */
  it('fades the panel content behind every tab, including rows that arrive late', async () => {
    const user = userEvent.setup();
    let releaseList: (jobs: never[]) => void = () => {};
    const listed = new Promise<never[]>((resolve) => {
      releaseList = resolve;
    });
    const jobClient = {
      async list() {
        return await listed;
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
          transactions: [],
          transfers: [],
        };
      },
    } as unknown as JobApiClient;

    const cabinet = render(
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

    await user.click(screen.getByRole('tab', { name: 'Requests' }));
    const waiting = await screen.findByText('Checking requests…');
    const waitingFade = waiting.closest('.tab-fade');
    expect(waitingFade).not.toBeNull();

    releaseList([]);
    const empty = await screen.findByText(/Open Payment services to start/u);
    const loadedFade = empty.closest('.tab-fade');
    expect(loadedFade).not.toBeNull();
    // A different element, so the animation restarts when the rows land.
    expect(loadedFade).not.toBe(waitingFade);

    cabinet.unmount();

    // The console route's own tab panel was the one that never faded at all.
    const { container } = render(
      <App
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
    expect(container.querySelector('main[role="tabpanel"]')?.className).toContain('tab-fade');
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
    await user.click(screen.getByRole('tab', { name: 'Recovery control' }));
    expect(await screen.findByText('Subgraph MCP')).toBeTruthy();
    expect(screen.getByText('LAGGING')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /force|pay|submit settlement/iu })).toBeNull();
  });
});
