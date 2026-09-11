import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DetectedWallet } from '../src/auth/eip6963.js';

/**
 * `vi.mock` factories are hoisted above imports, so any state they close over
 * must be created with `vi.hoisted`. Only `usePrivy` and `useLoginWithSiwe`
 * matter here: `signInWithWallet` never reaches either of them when the
 * wallet's own provider never responds to the first request.
 */
const mocks = vi.hoisted(() => ({
  generateSiweMessage: vi.fn(async () => 'siwe-message'),
  loginWithSiwe: vi.fn(async () => undefined),
  getAccessToken: vi.fn(async (): Promise<string | null> => null),
}));

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({ children }: { children: ReactNode }) => children,
  usePrivy: () => ({
    ready: true,
    authenticated: false,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: mocks.getAccessToken,
  }),
  useLoginWithSiwe: () => ({
    generateSiweMessage: mocks.generateSiweMessage,
    loginWithSiwe: mocks.loginWithSiwe,
  }),
}));

const { usePrivyOperatorSession, WALLET_REQUEST_TIMEOUT_MS } = await import(
  '../src/auth/privy-session.js'
);

function neverRespondingWallet(): DetectedWallet {
  return {
    uuid: 'stuck-wallet-uuid',
    name: 'Stuck Wallet',
    rdns: 'test.stuck-wallet',
    // A provider that never settles: the real-world failure this guards
    // against is an extension that crashed, was backgrounded, or is simply
    // broken and never answers `eth_requestAccounts`.
    provider: { request: vi.fn(() => new Promise<never>(() => {})) },
  };
}

describe('usePrivyOperatorSession — wallet request timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('rejects exactly at the timeout instead of hanging forever', async () => {
    const { result } = renderHook(() => usePrivyOperatorSession());
    const wallet = neverRespondingWallet();

    let settled = false;
    const pending = result.current.signInWithWallet(wallet);
    // Attach a handler immediately so Node never reports this rejection as
    // unhandled while the assertions below probe timing before it settles.
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(WALLET_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);

    await expect(pending).rejects.toThrow('The wallet did not respond in time.');
  });

  it('does not leak wallet identity into the timeout rejection', async () => {
    const { result } = renderHook(() => usePrivyOperatorSession());
    const wallet = neverRespondingWallet();

    const pending = result.current.signInWithWallet(wallet).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(WALLET_REQUEST_TIMEOUT_MS);
    const error = await pending;

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toBe('The wallet did not respond in time.');
    expect(message).not.toContain(wallet.rdns);
    expect(message).not.toContain(wallet.name);
    expect(message).not.toContain(wallet.uuid);
  });
});
