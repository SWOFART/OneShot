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
    wallet: undefined as unknown,
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
    mocks.active.wallet = undefined;
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
            balances: [{ domain: 26, depositor: payerWallet, balance: '0.010000' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePrivyUserWallet());

    await expect(result.current.getGatewayBalance(payerWallet)).resolves.toBe('10000');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway-api-testnet.circle.com/v1/balances',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'USDC', sources: [{ depositor: payerWallet, domain: 26 }] }),
      }),
    );
  });

  it('funds the connected wallet own Gateway balance with approve then deposit', async () => {
    const payerWallet = '0x2222222222222222222222222222222222222222';
    let submitted = 0;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_call') return '0x0';
      if (method === 'eth_sendTransaction') {
        submitted += 1;
        return `0x${(submitted === 1 ? 'a' : 'b').repeat(64)}`;
      }
      if (method === 'eth_getTransactionReceipt') return { status: '0x1' };
      throw new Error(`Unexpected method ${method}`);
    });
    mocks.active.wallet = {
      type: 'ethereum',
      address: payerWallet,
      chainId: 'eip155:5042002',
      switchChain: vi.fn(),
      getEthereumProvider: vi.fn(async () => ({ request })),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.endsWith('/deposits')
            ? { deposits: [] }
            : { balances: [{ domain: 26, depositor: payerWallet, balance: '0' }] },
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePrivyUserWallet());

    await expect(result.current.fundGateway('1000000')).resolves.toMatchObject({
      target_amount_atomic: '1000000',
      deposited_amount_atomic: '1000000',
      approval_transaction_hash: expect.stringMatching(/^0x/u),
      deposit_transaction_hash: expect.stringMatching(/^0x/u),
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'eth_call' }));
    const sends = request.mock.calls.filter(([call]) => call.method === 'eth_sendTransaction');
    expect(sends).toHaveLength(2);
    expect(sends[0]?.[0]).toEqual(
      expect.objectContaining({
        method: 'eth_sendTransaction',
        params: [
          expect.objectContaining({
            from: payerWallet,
            to: '0x3600000000000000000000000000000000000000',
          }),
        ],
      }),
    );
    expect(sends[1]?.[0]).toEqual(
      expect.objectContaining({
        method: 'eth_sendTransaction',
        params: [
          expect.objectContaining({
            from: payerWallet,
            to: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
          }),
        ],
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway-api-testnet.circle.com/v1/deposits',
      expect.anything(),
    );
  });

  it('refuses a second deposit while Circle reports one as pending', async () => {
    const payerWallet = '0x2222222222222222222222222222222222222222';
    const pendingHash = `0x${'c'.repeat(64)}`;
    const request = vi.fn();
    mocks.active.wallet = {
      type: 'ethereum',
      address: payerWallet,
      chainId: 'eip155:5042002',
      switchChain: vi.fn(),
      getEthereumProvider: vi.fn(async () => ({ request })),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).endsWith('/deposits')
                ? {
                    deposits: [
                      {
                        domain: 26,
                        depositor: payerWallet,
                        status: 'pending',
                        transactionHash: pendingHash,
                        amount: '1.000000',
                      },
                    ],
                  }
                : { balances: [{ domain: 26, depositor: payerWallet, balance: '0' }] },
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const { result } = renderHook(() => usePrivyUserWallet());

    await expect(result.current.fundGateway('1000000')).rejects.toThrow(/already pending/u);
    expect(request).not.toHaveBeenCalled();
  });

  it('stops before deposit when the approval transaction reverts', async () => {
    const payerWallet = '0x2222222222222222222222222222222222222222';
    let submitted = 0;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_call') return '0x0';
      if (method === 'eth_sendTransaction') {
        submitted += 1;
        return `0x${'d'.repeat(64)}`;
      }
      if (method === 'eth_getTransactionReceipt') return { status: '0x0' };
      throw new Error(`Unexpected method ${method}`);
    });
    mocks.active.wallet = {
      type: 'ethereum',
      address: payerWallet,
      chainId: 'eip155:5042002',
      switchChain: vi.fn(),
      getEthereumProvider: vi.fn(async () => ({ request })),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).endsWith('/deposits')
                ? { deposits: [] }
                : { balances: [{ domain: 26, depositor: payerWallet, balance: '0' }] },
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const { result } = renderHook(() => usePrivyUserWallet());

    await expect(result.current.fundGateway('1000000')).rejects.toThrow(/reverted/u);
    expect(submitted).toBe(1);
    expect(
      request.mock.calls.filter(([call]) => call.method === 'eth_sendTransaction'),
    ).toHaveLength(1);
  });
});
