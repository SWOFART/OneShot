import { describe, expect, it, vi } from 'vitest';
import { PrivyArcWalletProvider } from '../src/privy-wallet-provider.js';

const HASH = `0x${'a'.repeat(64)}` as const;
const WALLET = '0x1111111111111111111111111111111111111111' as const;

describe('PrivyArcWalletProvider', () => {
  it('passes the durable business-intent key to Privy and preserves provider identity', async () => {
    const send = vi.fn(async () => ({
      caip2: 'eip155:5042002',
      hash: HASH,
      transaction_id: 'privy-transaction-1',
    }));
    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      sendTransaction: send,
      getTransactionReceipt: async () => {
        throw new Error('not used');
      },
      getBlockNumber: async () => 1n,
    });

    await expect(
      provider.sendTransaction({
        chainId: 5042002,
        to: '0x2222222222222222222222222222222222222222',
        value: 0n,
        data: '0x1234',
        idempotencyKey: 'intent-key-1',
        referenceId: 'intent-reference-1',
      }),
    ).resolves.toEqual({
      transactionHash: HASH,
      providerReferenceId: 'privy-transaction-1',
      walletAddress: WALLET,
    });
    expect(send).toHaveBeenCalledWith(
      'wallet-test',
      expect.objectContaining({
        caip2: 'eip155:5042002',
        idempotency_key: 'intent-key-1',
        reference_id: 'intent-reference-1',
      }),
    );
  });

  it('accepts the REST envelope shape returned by Privy', async () => {
    const send = vi.fn(async () => ({
      data: {
        caip2: 'eip155:5042002',
        hash: HASH,
        transaction_id: 'privy-transaction-envelope-1',
      },
    }));
    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      sendTransaction: send,
      getTransactionReceipt: async () => {
        throw new Error('not used');
      },
      getBlockNumber: async () => 1n,
    });

    await expect(
      provider.sendTransaction({
        chainId: 5042002,
        to: '0x2222222222222222222222222222222222222222',
        value: 0n,
        data: '0x1234',
        idempotencyKey: 'intent-key-envelope-1',
        referenceId: 'intent-reference-envelope-1',
      }),
    ).resolves.toMatchObject({
      transactionHash: HASH,
      providerReferenceId: 'privy-transaction-envelope-1',
    });
  });

  it('maps an Arc JSON-RPC receipt into the strict verification shape', async () => {
    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      sendTransaction: async () => ({ caip2: 'eip155:5042002', hash: HASH }),
      getBlockNumber: async () => 99n,
      getTransactionReceipt: async () => ({
        transactionHash: HASH,
        from: WALLET,
        to: '0x3333333333333333333333333333333333333333',
        status: 'success',
        blockNumber: 99n,
        blockHash: `0x${'b'.repeat(64)}`,
        logs: [],
      }),
    });
    await expect(provider.getReceipt(HASH)).resolves.toMatchObject({
      chainId: 5042002,
      status: 1,
      blockNumber: 99n,
      from: WALLET,
    });
    await expect(provider.getBlockNumber()).resolves.toBe(99n);
  });

  it('signs with Privy and broadcasts via raw transaction when chain is not relay-enabled', async () => {
    const signTx = vi.fn(async () => ({
      signed_transaction: '0x02f8a8834cef5201',
      encoding: 'rlp',
    }));
    const sendRaw = vi.fn(async () => HASH);

    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      signTransaction: signTx,
      sendRawTransaction: sendRaw,
      getTransactionCount: async () => 3n,
      getGasPrice: async () => 20_000_000_000n,
      estimateGas: async () => 65_000n,
      getTransactionReceipt: async () => ({
        transactionHash: HASH,
        from: WALLET,
        to: '0x3333333333333333333333333333333333333333',
        status: 'success',
        blockNumber: 100n,
        blockHash: `0x${'b'.repeat(64)}`,
        logs: [],
      }),
      getBlockNumber: async () => 100n,
    });

    await expect(
      provider.sendTransaction({
        chainId: 5042002,
        to: '0x2222222222222222222222222222222222222222',
        value: 0n,
        data: '0x1234',
        idempotencyKey: 'intent-key-2',
        referenceId: 'intent-reference-2',
      }),
    ).resolves.toEqual({
      transactionHash: HASH,
      providerReferenceId: 'intent-reference-2',
      walletAddress: WALLET,
    });

    expect(signTx).toHaveBeenCalledWith(
      'wallet-test',
      {
        params: {
          transaction: {
            chain_id: 5042002,
            to: '0x2222222222222222222222222222222222222222',
            value: '0x0',
            data: '0x1234',
            nonce: '0x3',
            gas_limit: '0x130b0',
            max_fee_per_gas: '0x9502f9000',
            max_priority_fee_per_gas: '0x4a817c800',
          },
        },
      },
    );
    expect(sendRaw).toHaveBeenCalledWith('0x02f8a8834cef5201');
  });

  it('uses the pending nonce and collapses duplicate raw submissions by idempotency key', async () => {
    const signTx = vi.fn(async () => ({ signed_transaction: '0x02f8a8834cef5201' }));
    const sendRaw = vi.fn(async () => HASH);
    const getTransactionCount = vi.fn(
      async (_address: `0x${string}`, blockTag?: 'latest' | 'pending') => {
        expect(blockTag).toBe('pending');
        return 7n;
      },
    );
    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      signTransaction: signTx,
      sendRawTransaction: sendRaw,
      getTransactionCount,
      getGasPrice: async () => 1n,
      estimateGas: async () => 50_000n,
      getTransactionReceipt: async () => ({
        transactionHash: HASH,
        from: WALLET,
        to: '0x3333333333333333333333333333333333333333',
        status: 'success',
        blockNumber: 100n,
        blockHash: `0x${'b'.repeat(64)}`,
        logs: [],
      }),
      getBlockNumber: async () => 100n,
    });

    const request = {
      chainId: 5042002,
      to: '0x2222222222222222222222222222222222222222' as const,
      value: 0n,
      data: '0x1234' as const,
      idempotencyKey: 'intent-key-duplicate',
      referenceId: 'intent-reference-duplicate',
    };
    await expect(
      Promise.all([provider.sendTransaction(request), provider.sendTransaction(request)]),
    ).resolves.toHaveLength(2);
    expect(getTransactionCount).toHaveBeenCalledTimes(1);
    expect(signTx).toHaveBeenCalledTimes(1);
    expect(sendRaw).toHaveBeenCalledTimes(1);
  });

  it('serializes distinct raw submissions and observes each newly pending nonce', async () => {
    let nextNonce = 7n;
    const signedNonces: string[] = [];
    const signTx = vi.fn(async (_walletId, input) => {
      signedNonces.push(input.params.transaction.nonce);
      return { signed_transaction: '0x02f8a8834cef5201' };
    });
    const sendRaw = vi.fn(async () => {
      nextNonce += 1n;
      return HASH;
    });
    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      signTransaction: signTx,
      sendRawTransaction: sendRaw,
      getTransactionCount: async (_address, blockTag) => {
        expect(blockTag).toBe('pending');
        return nextNonce;
      },
      getGasPrice: async () => 1n,
      estimateGas: async () => 50_000n,
      getTransactionReceipt: async () => null,
      getBlockNumber: async () => 100n,
    });
    const base = {
      chainId: 5042002,
      to: '0x2222222222222222222222222222222222222222' as const,
      value: 0n,
      data: '0x1234' as const,
    };

    await expect(
      Promise.all([
        provider.sendTransaction({
          ...base,
          idempotencyKey: 'intent-key-a',
          referenceId: 'intent-reference-a',
        }),
        provider.sendTransaction({
          ...base,
          idempotencyKey: 'intent-key-b',
          referenceId: 'intent-reference-b',
        }),
      ]),
    ).resolves.toHaveLength(2);
    expect(signedNonces).toEqual(['0x7', '0x8']);
    expect(sendRaw).toHaveBeenCalledTimes(2);
  });

  it('does not retry a raw broadcast after an ambiguous send failure', async () => {
    const signTx = vi.fn(async () => ({ signed_transaction: '0x02f8a8834cef5201' }));
    const sendRaw = vi.fn(async () => {
      throw new Error('ETIMEDOUT after broadcast');
    });
    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      signTransaction: signTx,
      sendRawTransaction: sendRaw,
      getTransactionCount: async () => 7n,
      getGasPrice: async () => 1n,
      estimateGas: async () => 50_000n,
      getTransactionReceipt: async () => null,
      getBlockNumber: async () => 100n,
    });
    const request = {
      chainId: 5042002,
      to: '0x2222222222222222222222222222222222222222' as const,
      value: 0n,
      data: '0x1234' as const,
      idempotencyKey: 'intent-key-ambiguous',
      referenceId: 'intent-reference-ambiguous',
    };

    await expect(provider.sendTransaction(request)).rejects.toThrow('ETIMEDOUT');
    await expect(provider.sendTransaction(request)).rejects.toThrow('ETIMEDOUT');
    expect(sendRaw).toHaveBeenCalledTimes(1);
    expect(signTx).toHaveBeenCalledTimes(1);
  });

  it('reads the native Arc gas balance', async () => {
    const provider = new PrivyArcWalletProvider({
      appId: 'app-test',
      appSecret: 'secret-test',
      walletId: 'wallet-test',
      walletAddress: WALLET,
      chainId: 5042002,
      rpcUrl: 'https://rpc.example.invalid',
      sendTransaction: async () => ({ caip2: 'eip155:5042002', hash: HASH }),
      getNativeBalance: async (address) => {
        expect(address).toBe(WALLET);
        return 1_000_000_000_000_000n;
      },
      getGasPrice: async () => 2n,
      estimateGas: async (input) => {
        expect(input.account).toBe(WALLET);
        return 50n;
      },
      getBlockNumber: async () => 100n,
      getTransactionReceipt: async () => null,
    });
    await expect(provider.getNativeBalance()).resolves.toBe(1_000_000_000_000_000n);
    await expect(
      provider.estimateNativeFee({
        to: '0x2222222222222222222222222222222222222222',
        value: 0n,
        data: '0x1234',
      }),
    ).resolves.toBe(120n);
  });
});
