import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `vi.mock` factories are hoisted above imports, so any state they close over
 * must be created with `vi.hoisted`. The production hook deliberately uses
 * Privy's native login modal; no wallet provider or SIWE implementation is
 * part of this test boundary.
 */
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getAccessToken: vi.fn(async (): Promise<string | null> => null),
  authenticated: false,
  user: null as { id: string } | null,
}));

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({ children }: { children: ReactNode }) => children,
  useLogin: () => ({ login: mocks.login }),
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    user: mocks.user,
    logout: mocks.logout,
    getAccessToken: mocks.getAccessToken,
  }),
}));

const { circleX402SigningRequirements, usePrivyOperatorSession } = await import(
  '../src/auth/privy-session.js'
);

describe('usePrivyOperatorSession — native Privy login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticated = false;
    mocks.user = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('delegates sign-in to Privy without calling a wallet provider directly', () => {
    const { result } = renderHook(() => usePrivyOperatorSession());
    result.current.login();

    expect(mocks.login).toHaveBeenCalledOnce();
    expect('signInWithWallet' in result.current).toBe(false);
  });

  it('returns the native Privy session and refreshes its access token', async () => {
    mocks.authenticated = true;
    mocks.user = { id: 'did:privy:native-login' };
    mocks.getAccessToken.mockResolvedValue('header.payload.signature');

    const { result } = renderHook(() => usePrivyOperatorSession());
    expect(result.current.status).toBe('SIGNED_IN');
    expect(result.current.subject).toBe('did:privy:native-login');
    await waitFor(() => expect(result.current.accessToken).toBe('header.payload.signature'));
    expect(mocks.getAccessToken).toHaveBeenCalledOnce();
  });

  it('uses an approval buffer beyond the Gateway SDK minimum for x402 signing', () => {
    expect(
      circleX402SigningRequirements({
        supplier_id: 'circle-x402-v1',
        resource_url: '/api/premium/dataset',
        recipient: '0xa605EE031E41f04f8e193059a39A24407f83677c',
        amount_atomic: '10000',
        asset: 'USDC',
        network: 'eip155:5042002',
        x402_version: 2,
        max_timeout_seconds: 604900,
      }).maxTimeoutSeconds,
    ).toBe(605800);
  });
});
