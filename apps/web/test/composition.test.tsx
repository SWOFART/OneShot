import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SETTLEMENT_SCENARIO_INTENTS,
  createInMemorySettlementClient,
} from '@oneshot/settlement-ui';
import { createInMemoryRecoveryClient, recoveryScenarioPages } from '@oneshot/recovery-ui';

import { App } from '../src/App.js';
import { SettlementSurface } from '../src/components/FrontendSurfaces.js';
import { signedInSession } from './support/fake-session.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('composed frontend shell', () => {
  it('exposes A05, B05, and C05 surfaces without a payment action', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/health/ready')) return json(200, { status: 'ok' });
      return json(404, { code: 'INTENT_NOT_FOUND', message: 'Fixture lookup is empty.' });
    });

    const user = userEvent.setup();
    render(
      <App
        recoveryClient={createInMemoryRecoveryClient('lagging')}
        useOperatorSession={() => signedInSession()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Create request' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Payment status' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Payment proof' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Protection checks' })).toBeTruthy();

    const createTab = screen.getByRole('tab', { name: 'Create request' });
    createTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Payment status' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Payment status' }));

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Create request' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Create request' }));

    await user.keyboard('{End}');
    expect(
      screen.getByRole('tab', { name: 'Protection checks' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Protection checks' }));

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Create request' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Create request' }));

    await user.click(screen.getByRole('tab', { name: 'Payment proof' }));
    expect(await screen.findByText(/Select a request to inspect payment proof/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pay|retry|resend|force/iu })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Protection checks' }));
    await user.type(
      screen.getByLabelText('Request identifier'),
      recoveryScenarioPages.lagging[0]?.businessIntentId ?? '',
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
