import { cleanup, render, renderHook, waitFor } from '@testing-library/react';
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
    wallet: undefined as Record<string, unknown> | undefined,
    connect: vi.fn(),
    setActiveWallet: vi.fn(),
  },
  wallets: [] as Array<Record<string, unknown>>,
  providerConfig: null as Record<string, unknown> | null,
}));

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({
    children,
    config,
  }: {
    children: ReactNode;
    config: Record<string, unknown>;
  }) => {
    mocks.providerConfig = config;
    return children;
  },
  useLogin: () => ({ login: mocks.login }),
  useActiveWallet: () => mocks.active,
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    user: mocks.user,
    logout: mocks.logout,
    getAccessToken: mocks.getAccessToken,
  }),
  useWallets: () => ({ ready: true, wallets: mocks.wallets }),
}));

const {
  PrivyOperatorProvider,
  circleX402SigningRequirements,
  usePrivyOperatorSession,
  usePrivyUserWallet,
} =
  await import('../src/auth/privy-session.js');

function ethereumWallet(walletClientType: string, address: string) {
  const request = vi.fn(async ({ method }: { method: string }) =>
    method === 'eth_signTypedData_v4' ? `0x${'a'.repeat(130)}` : `0x${'a'.repeat(64)}`,
  );
  return {
    wallet: {
      type: 'ethereum',
      walletClientType,
      address,
      chainId: 'eip155:5042002',
      switchChain: vi.fn(),
      getEthereumProvider: vi.fn(async () => ({ request })),
    },
    request,
  };
}

function setActivePrivyWallet(wallet: Record<string, unknown>) {
  const selected = { walletClientType: 'privy', ...wallet };
  mocks.active.wallet = selected;
  mocks.wallets = [selected];
  return selected;
}

describe('usePrivyOperatorSession — native Privy login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticated = false;
    mocks.user = null;
    mocks.active.wallet = undefined;
    mocks.wallets = [];
    mocks.providerConfig = null;
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
    setActivePrivyWallet({
      type: 'ethereum',
      address: payerWallet,
      chainId: 'eip155:5042002',
      switchChain: vi.fn(),
      getEthereumProvider: vi.fn(async () => ({ request })),
    });
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
    setActivePrivyWallet({
      type: 'ethereum',
      address: payerWallet,
      chainId: 'eip155:5042002',
      switchChain: vi.fn(),
      getEthereumProvider: vi.fn(async () => ({ request })),
    });
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
    setActivePrivyWallet({
      type: 'ethereum',
      address: payerWallet,
      chainId: 'eip155:5042002',
      switchChain: vi.fn(),
      getEthereumProvider: vi.fn(async () => ({ request })),
    });
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

describe('usePrivyUserWallet — selected payer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active.wallet = undefined;
    mocks.wallets = [];
    mocks.providerConfig = null;
  });

  afterEach(() => cleanup());

  it('keeps automatic wallet creation off and configures Arc Testnet', () => {
    render(
      <PrivyOperatorProvider appId="test-app">
        <div />
      </PrivyOperatorProvider>,
    );

    expect(mocks.providerConfig).toMatchObject({
      embeddedWallets: { ethereum: { createOnLogin: 'off' } },
      defaultChain: { id: 5042002 },
      supportedChains: [{ id: 5042002 }],
      appearance: {
        walletList: ['detected_ethereum_wallets', 'wallet_connect'],
      },
    });
  });

  it('uses active MetaMask and leaves approval to that wallet', async () => {
    const metamask = ethereumWallet('metamask', '0x1111111111111111111111111111111111111111');
    const privy = ethereumWallet('privy', '0x2222222222222222222222222222222222222222');
    mocks.active.wallet = metamask.wallet;
    mocks.wallets = [metamask.wallet, privy.wallet];

    const { result } = renderHook(() => usePrivyUserWallet());
    expect(result.current.address).toBe(metamask.wallet.address);
    expect(mocks.active.setActiveWallet).not.toHaveBeenCalled();

    await result.current.sendTransfer({
      chain_id: 5042002,
      token_contract: '0x3600000000000000000000000000000000000000',
      payer_wallet: metamask.wallet.address,
      recipient: '0x3333333333333333333333333333333333333333',
      amount_atomic: '10000',
    });
    await result.current.signX402Payment({
      supplier_id: 'circle-x402-v1',
      resource_url: 'https://api.example.test/premium/dataset',
      recipient: '0x3333333333333333333333333333333333333333',
      amount_atomic: '10000',
      asset: 'USDC',
      network: 'eip155:5042002',
      x402_version: 2,
      max_timeout_seconds: 300,
    });

    expect(metamask.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_signTypedData_v4' }),
    );
    expect(metamask.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' }),
    );
    expect(privy.request).not.toHaveBeenCalled();

    const signingRequest = metamask.request.mock.calls.find(
      ([request]) => request.method === 'eth_signTypedData_v4',
    )?.[0] as { params: [string, string] } | undefined;
    const typedData = JSON.parse(signingRequest?.params[1] ?? '{}') as {
      types?: Record<string, unknown>;
    };
    expect(typedData.types?.EIP712Domain).toEqual([
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ]);
    expect(typedData.types?.TransferWithAuthorization).toBeDefined();
  });

  it('honors the embedded wallet selected in Privy', async () => {
    const first = ethereumWallet('privy', '0x1111111111111111111111111111111111111111');
    const selected = ethereumWallet('privy', '0x2222222222222222222222222222222222222222');
    mocks.active.wallet = selected.wallet;
    mocks.wallets = [first.wallet, selected.wallet];

    const { result } = renderHook(() => usePrivyUserWallet());
    expect(result.current.address).toBe(selected.wallet.address);

    await result.current.sendTransfer({
      chain_id: 5042002,
      token_contract: '0x3600000000000000000000000000000000000000',
      payer_wallet: selected.wallet.address,
      recipient: '0x3333333333333333333333333333333333333333',
      amount_atomic: '10000',
    });
    await result.current.signX402Payment({
      supplier_id: 'circle-x402-v1',
      resource_url: 'https://api.example.test/premium/dataset',
      recipient: '0x3333333333333333333333333333333333333333',
      amount_atomic: '10000',
      asset: 'USDC',
      network: 'eip155:5042002',
      x402_version: 2,
      max_timeout_seconds: 300,
    });

    const signingRequest = selected.request.mock.calls.find(
      ([request]) => request.method === 'eth_signTypedData_v4',
    )?.[0] as { params: [string, string] } | undefined;
    const typedData = JSON.parse(signingRequest?.params[1] ?? '{}') as {
      types?: Record<string, unknown>;
    };
    expect(typedData.types?.EIP712Domain).toBeUndefined();
    expect(typedData.types?.TransferWithAuthorization).toBeDefined();
    expect(first.request).not.toHaveBeenCalled();
  });

  it('opens the Privy wallet picker when no wallet is active', async () => {
    const selected = ethereumWallet('rainbow', '0x2222222222222222222222222222222222222222');
    mocks.active.connect.mockResolvedValue({ wallet: selected.wallet, network: 'ethereum' });

    const { result } = renderHook(() => usePrivyUserWallet());
    expect(result.current.address).toBeNull();
    await expect(result.current.connect()).resolves.toBe(selected.wallet.address);
    expect(mocks.active.connect).toHaveBeenCalledWith({ reset: true });

    await result.current.sendTransfer({
      chain_id: 5042002,
      token_contract: '0x3600000000000000000000000000000000000000',
      payer_wallet: selected.wallet.address,
      recipient: '0x3333333333333333333333333333333333333333',
      amount_atomic: '10000',
    });
    await result.current.signX402Payment({
      supplier_id: 'circle-x402-v1',
      resource_url: 'https://api.example.test/premium/dataset',
      recipient: '0x3333333333333333333333333333333333333333',
      amount_atomic: '10000',
      asset: 'USDC',
      network: 'eip155:5042002',
      x402_version: 2,
      max_timeout_seconds: 300,
    });

    expect(selected.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_signTypedData_v4' }),
    );
    expect(selected.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' }),
    );

    const signingRequest = selected.request.mock.calls.find(
      ([request]) => request.method === 'eth_signTypedData_v4',
    )?.[0] as { params: [string, string] } | undefined;
    const typedData = JSON.parse(signingRequest?.params[1] ?? '{}') as {
      types?: Record<string, unknown>;
    };
    expect(typedData.types?.EIP712Domain).toEqual([
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ]);
  });

  it('forgets a picker wallet when the signed-in Privy user changes', async () => {
    const first = ethereumWallet('rainbow', '0x2222222222222222222222222222222222222222');
    const second = ethereumWallet('coinbase_wallet', '0x3333333333333333333333333333333333333333');
    mocks.authenticated = true;
    mocks.user = { id: 'did:privy:first' };
    mocks.active.connect.mockResolvedValueOnce({ wallet: first.wallet, network: 'ethereum' });

    const { result, rerender } = renderHook(() => usePrivyUserWallet());
    await expect(result.current.connect()).resolves.toBe(first.wallet.address);

    mocks.user = { id: 'did:privy:second' };
    mocks.active.connect.mockResolvedValueOnce({ wallet: second.wallet, network: 'ethereum' });
    rerender();

    expect(result.current.address).toBeNull();
    await expect(result.current.connect()).resolves.toBe(second.wallet.address);
    expect(mocks.active.connect).toHaveBeenCalledTimes(2);
  });
});
