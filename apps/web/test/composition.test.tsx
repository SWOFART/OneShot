import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SETTLEMENT_SCENARIO_INTENTS,
  createInMemorySettlementClient,
} from '@oneshot/settlement-ui';

import { App } from '../src/App.js';
import { SettlementSurface } from '../src/components/FrontendSurfaces.js';

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
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Create or replay' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Authoritative status' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settlement evidence' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Recovery evidence' })).toBeTruthy();

    const createTab = screen.getByRole('tab', { name: 'Create or replay' });
    createTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: 'Authoritative status' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Authoritative status' }));

    await user.click(screen.getByRole('tab', { name: 'Settlement evidence' }));
    expect(
      await screen.findByText(/Select an intent to inspect settlement evidence/u),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pay|retry|resend|force/iu })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Recovery evidence' }));
    expect(await screen.findByText('Evidence before action.')).toBeTruthy();
    expect(screen.getByText('Synthetic recovery fixtures')).toBeTruthy();
    expect(screen.getByText('New settlement blocked')).toBeTruthy();
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
