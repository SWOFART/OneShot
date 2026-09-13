import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivyClient } from '@privy-io/node';
import { PrivyArcWalletProvider } from '../src/privy-wallet-provider.js';

vi.mock('@privy-io/node', () => ({ PrivyClient: vi.fn() }));

const HASH = `0x${'a'.repeat(64)}` as const;
const WALLET = '0x1111111111111111111111111111111111111111' as const;

function request() {
  return {
    chainId: 5042002,
    to: '0x2222222222222222222222222222222222222222' as const,
    value: 0n,
    data: '0x1234' as const,
    idempotencyKey: 'intent-fallback-test',
    referenceId: 'intent-fallback-reference',
  };
}

function configurePrivyMock(options: {
  readonly sendTransaction: () => Promise<never>;
  readonly signTransaction: () => Promise<{ signed_transaction: string }>;
}) {
  const signTransaction = vi.fn(options.signTransaction);
  const sendTransaction = vi.fn(options.sendTransaction);
  const client = {
    wallets: () => ({
      ethereum: () => ({ sendTransaction, signTransaction }),
    }),
  };
  vi.mocked(PrivyClient).mockImplementation(function () {
    return client as never;
  });
  return { sendTransaction, signTransaction };
}

function provider() {
  return new PrivyArcWalletProvider({
    appId: 'app-test',
    appSecret: 'secret-test',
    walletId: 'wallet-test',
    walletAddress: WALLET,
    chainId: 5042002,
    rpcUrl: 'https://rpc.example.invalid',
    sendRawTransaction: async () => HASH,
    getTransactionCount: async () => 7n,
    getGasPrice: async () => 1n,
    estimateGas: async () => 50_000n,
  });
}

describe('Privy relay fallback boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falls back only for a relay authorization boundary and broadcasts once', async () => {
    const { sendTransaction, signTransaction } = configurePrivyMock({
      sendTransaction: async () => {
        throw Object.assign(new Error('App is not authorized to transact on chain'), {
          status: 401,
        });
      },
      signTransaction: async () => ({ signed_transaction: '0x02f8a8834cef5201' }),
    });
    const sendRaw = vi.fn(async () => HASH);
    const wallet = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      sendRawTransaction: sendRaw,
      getTransactionCount: async () => 7n,
      getGasPrice: async () => 1n,
      estimateGas: async () => 50_000n,
    });

    await expect(wallet.sendTransaction(request())).resolves.toMatchObject({
      transactionHash: HASH,
    });
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(signTransaction).toHaveBeenCalledOnce();
    expect(sendRaw).toHaveBeenCalledOnce();
  });

  it('does not turn a generic Privy authentication failure into raw signing', async () => {
    const { sendTransaction, signTransaction } = configurePrivyMock({
      sendTransaction: async () => {
        throw Object.assign(new Error('Invalid Privy credentials'), { status: 401 });
      },
      signTransaction: async () => ({ signed_transaction: '0x02f8a8834cef5201' }),
    });
    const wallet = provider();

    await expect(wallet.sendTransaction(request())).rejects.toThrow('Invalid Privy credentials');
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('propagates a policy denial from the signing path without broadcasting', async () => {
    const { signTransaction } = configurePrivyMock({
      sendTransaction: async () => {
        throw new Error('not authorized to transact on chain');
      },
      signTransaction: async () => {
        throw new Error('Transaction denied by policy');
      },
    });
    const sendRaw = vi.fn(async () => HASH);
    const wallet = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      sendRawTransaction: sendRaw,
      getTransactionCount: async () => 7n,
      getGasPrice: async () => 1n,
      estimateGas: async () => 50_000n,
    });

    await expect(wallet.sendTransaction(request())).rejects.toThrow('Transaction denied by policy');
    expect(signTransaction).toHaveBeenCalledOnce();
    expect(sendRaw).not.toHaveBeenCalled();
  });
});
