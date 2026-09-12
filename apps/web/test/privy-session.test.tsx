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
  active: {
    wallet: undefined,
    connect: vi.fn(),
  },
}));

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({ children }: { children: ReactNode }) => children,
  useLogin: () => ({ login: mocks.login }),
  useActiveWallet: () => mocks.active,
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    user: mocks.user,
    logout: mocks.logout,
    getAccessToken: mocks.getAccessToken,
  }),
}));

const { usePrivyOperatorSession, usePrivyUserWallet } =
  await import('../src/auth/privy-session.js');

describe('usePrivyOperatorSession — native Privy login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticated = false;
    mocks.user = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("reads only the connected wallet's Arc Testnet Gateway balance before x402 signing", async () => {
    const payerWallet = '0x2222222222222222222222222222222222222222';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            token: 'USDC',
            balances: [{ domain: 26, depositor: payerWallet, balance: '10000' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePrivyUserWallet());

    await expect(result.current.getGatewayBalance?.(payerWallet)).resolves.toBe('10000');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway-api-testnet.circle.com/v1/balances',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'USDC', sources: [{ depositor: payerWallet, domain: 26 }] }),
      }),
    );
  });
});
