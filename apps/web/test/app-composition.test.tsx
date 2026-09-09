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
import { signedInSession } from './support/fake-session.js';

afterEach(cleanup);

describe('Gate P5 shell composition', () => {
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

    await user.type(
      screen.getByLabelText('Active Business Intent ID'),
      settlementIntent.business_intent_id,
    );
    await user.click(screen.getByRole('tab', { name: 'Settlement evidence' }));
    expect(await screen.findByText('Authorization')).toBeTruthy();

    await user.clear(screen.getByLabelText('Active Business Intent ID'));
    await user.type(
      screen.getByLabelText('Active Business Intent ID'),
      recoveryScenarioPages.lagging[0]?.businessIntentId ?? '',
    );
    await user.click(screen.getByRole('tab', { name: 'Recovery evidence' }));
    expect(await screen.findByText('Subgraph MCP')).toBeTruthy();
    expect(screen.getByText('LAGGING')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /force|pay|submit settlement/iu })).toBeNull();
  });
});
