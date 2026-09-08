// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { createInMemoryRecoveryClient } from '../src/mock-server.js';
import { RecoveryRoute } from '../src/RecoveryRoute.js';

afterEach(() => cleanup());

describe('RecoveryRoute', () => {
  it('loads the frozen mock and paginates earlier evidence', async () => {
    const user = userEvent.setup();
    render(
      createElement(RecoveryRoute, {
        businessIntentId: 'intent_route_test',
        client: createInMemoryRecoveryClient('fresh-wait'),
      }),
    );

    expect(await screen.findByText('intent_route_test')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load earlier evidence' }));
    expect(await screen.findByText(/Duplicate observation collapsed ×2/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load earlier evidence' })).toBeNull();
  });

  it('fails closed when the evidence service is unavailable', async () => {
    render(
      createElement(RecoveryRoute, {
        businessIntentId: 'intent_route_test',
        client: {
          readPage: async () => Promise.reject(new Error('offline')),
          refresh: async () => Promise.reject(new Error('offline')),
          escalate: async () => Promise.reject(new Error('offline')),
        },
      }),
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Authoritative state is unchanged/u,
    );
  });
});
