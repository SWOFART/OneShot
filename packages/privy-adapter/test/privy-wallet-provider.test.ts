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
            nonce: 3,
            gas_limit: 100_000,
            max_fee_per_gas: 40_000_000_000,
            max_priority_fee_per_gas: 20_000_000_000,
          },
        },
      },
    );
    expect(sendRaw).toHaveBeenCalledWith('0x02f8a8834cef5201');
  });
});
