import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SETTLEMENT_SCENARIO_INTENTS,
  createInMemorySettlementClient,
} from '@oneshot/settlement-ui';
import { createInMemoryRecoveryClient, recoveryScenarioPages } from '@oneshot/recovery-ui';

import { RecoverySurface, SettlementSurface } from '../src/components/FrontendSurfaces.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('composed frontend shell', () => {
  it('keeps recovery evidence read-only', async () => {
    render(
      <RecoverySurface
        businessIntentId={recoveryScenarioPages.lagging[0]?.businessIntentId ?? ''}
        client={createInMemoryRecoveryClient('lagging')}
      />,
    );
    expect(await screen.findByText('LAGGING')).toBeTruthy();
    expect(screen.getByText('Subgraph MCP')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pay|retry|resend|force/iu })).toBeNull();
  });

  it('keeps the loaded settlement evidence view read-only', async () => {
    const client = createInMemorySettlementClient(SETTLEMENT_SCENARIO_INTENTS);
    const { container } = render(
      <SettlementSurface businessIntentId="018f-ui-committed-001" client={client} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Transaction' })).toBeTruthy();
    });
    expect(container.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /pay|retry|resend|force/iu })).toBeNull();
  });
});
