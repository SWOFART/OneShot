import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { OneShotApiClient } from '../src/api/client.js';
import { fakeSession, signedInSession } from './support/fake-session.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function okClient(fetchFn: typeof fetch): OneShotApiClient {
  return new OneShotApiClient({ fetchFn });
}

function respondingFetch(seen: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get('authorization');
    if (authorization !== null) seen.push(authorization);
    if (String(input).includes('/health/ready')) {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ code: 'INTENT_NOT_FOUND', message: 'absent' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('App operator gating', () => {
  it('hides every console tab until the operator signs in', () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    render(<App apiClient={okClient(fetchFn)} useOperatorSession={() => fakeSession()} />);
    expect(screen.queryByRole('tab', { name: 'Create request' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in with Privy' })).toBeTruthy();
  });

  it('shows the console once a Privy session exists', () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    render(<App apiClient={okClient(fetchFn)} useOperatorSession={() => signedInSession()} />);
    expect(screen.getByRole('tab', { name: 'Create request' })).toBeTruthy();
  });

  it('sends the Privy access token on an authenticated request', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', respondingFetch(seen));

    const user = userEvent.setup();
    render(<App useOperatorSession={() => signedInSession('did:privy:x', 'aaa.bbb.ccc')} />);

    await user.click(screen.getByRole('tab', { name: 'Payment status' }));
    await user.type(screen.getByPlaceholderText('Request identifier'), 'intent-1');
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(seen).toContain('Bearer aaa.bbb.ccc'));
  });

  it('falls back to the machine token when no Privy session exists', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', respondingFetch(seen));

    const user = userEvent.setup();
    render(<App useOperatorSession={() => fakeSession({ status: 'UNCONFIGURED' })} />);

    await user.click(screen.getByText('Machine token (advanced)'));
    await user.type(screen.getByLabelText('Machine token'), 'service-token');
    await user.click(screen.getByRole('tab', { name: 'Payment status' }));
    await user.type(screen.getByPlaceholderText('Request identifier'), 'intent-1');
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(seen).toContain('Bearer service-token'));
  });
});
