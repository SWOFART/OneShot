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

const { PrivyOperatorProvider, usePrivyOperatorSession, usePrivyUserWallet } =
  await import('../src/auth/privy-session.js');

function ethereumWallet(walletClientType: string, address: string) {
  const request = vi.fn(async () => `0x${'a'.repeat(64)}`);
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

    expect(metamask.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' }),
    );
    expect(privy.request).not.toHaveBeenCalled();

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

    expect(selected.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' }),
    );

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
