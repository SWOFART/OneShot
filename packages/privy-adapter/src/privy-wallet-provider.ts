import { PrivyClient } from '@privy-io/node';
import { createPublicClient, defineChain, http, toHex, type Hex } from 'viem';
import type { TransactionReceipt } from '@oneshot/arc-adapter';
import type { WalletProvider } from './adapters.js';

interface PrivyTransactionResult {
  readonly caip2: string;
  readonly hash: string;
  readonly reference_id?: string | null;
  readonly transaction_id?: string;
}

export interface PrivyArcWalletProviderOptions {
  readonly appId: string;
  readonly appSecret: string;
  readonly walletId: string;
  readonly walletAddress: `0x${string}`;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly nativeDecimals?: number;
  readonly rpcTimeoutMs?: number;
  readonly sendTransaction?: (
    walletId: string,
    input: {
      readonly caip2: string;
      readonly idempotency_key: string;
      readonly reference_id: string;
      readonly params: {
        readonly transaction: {
          readonly chain_id: number;
          readonly to: `0x${string}`;
          readonly value: Hex;
          readonly data: Hex;
        };
      };
    },
  ) => Promise<PrivyTransactionResult>;
  readonly signTransaction?: (
    walletId: string,
    input: {
      readonly params: {
        readonly transaction: {
          readonly chain_id: number;
          readonly to: `0x${string}`;
          readonly value: Hex;
          readonly data: Hex;
          readonly nonce: number;
          readonly gas_limit?: number;
          readonly max_fee_per_gas?: number;
          readonly max_priority_fee_per_gas?: number;
        };
      };
    },
  ) => Promise<{ readonly signed_transaction: string; readonly encoding?: string }>;
  readonly sendRawTransaction?: (serializedTransaction: Hex) => Promise<Hex>;
  readonly getTransactionCount?: (address: `0x${string}`) => Promise<number | bigint>;
  readonly getGasPrice?: () => Promise<bigint>;
  readonly getTransactionReceipt?: (hash: Hex) => Promise<{
    readonly transactionHash: Hex;
    readonly from: `0x${string}`;
    readonly to: `0x${string}` | null;
    readonly status: 'success' | 'reverted';
    readonly blockNumber: bigint;
    readonly blockHash: Hex;
    readonly logs: readonly {
      readonly address: `0x${string}`;
      readonly topics: readonly Hex[];
      readonly data: Hex;
      readonly logIndex: number | null;
    }[];
  }>;
  readonly getBlockNumber?: () => Promise<bigint>;
}

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

/** Real Privy signing plus read-only Arc receipt observation. */
export class PrivyArcWalletProvider implements WalletProvider {
  readonly #options: PrivyArcWalletProviderOptions;
  readonly #send: NonNullable<PrivyArcWalletProviderOptions['sendTransaction']>;
  readonly #getReceipt: NonNullable<PrivyArcWalletProviderOptions['getTransactionReceipt']>;
  readonly #getBlock: NonNullable<PrivyArcWalletProviderOptions['getBlockNumber']>;

  constructor(options: PrivyArcWalletProviderOptions) {
    this.#options = options;

    const chain = defineChain({
      id: options.chainId,
      name: 'Arc',
      nativeCurrency: {
        name: 'Arc gas token (USDC)',
        symbol: 'USDC',
        decimals: options.nativeDecimals ?? 18,
      },
      rpcUrls: { default: { http: [options.rpcUrl] } },
    });
    const publicClient = createPublicClient({
      chain,
      transport: http(options.rpcUrl, { timeout: options.rpcTimeoutMs ?? 10_000 }),
    });

    const getNonce =
      options.getTransactionCount ??
      ((address) => publicClient.getTransactionCount({ address }));
    const getGas =
      options.getGasPrice ?? (() => publicClient.getGasPrice());
    const sendRaw =
      options.sendRawTransaction ??
      ((serializedTransaction) => publicClient.sendRawTransaction({ serializedTransaction }));

    const executeSignAndSendWith = (
      signTx: NonNullable<PrivyArcWalletProviderOptions['signTransaction']>,
    ) => async (
      walletId: string,
      input: Parameters<NonNullable<PrivyArcWalletProviderOptions['sendTransaction']>>[1],
    ): Promise<PrivyTransactionResult> => {
      const [nonce, gasPrice] = await Promise.all([
        getNonce(options.walletAddress),
        getGas(),
      ]);
      const signResult = await signTx(walletId, {
        params: {
          transaction: {
            to: input.params.transaction.to,
            value: input.params.transaction.value,
            data: input.params.transaction.data,
            chain_id: input.params.transaction.chain_id,
            nonce: Number(nonce),
            gas_limit: 100_000,
            max_fee_per_gas: Number(gasPrice * 2n),
            max_priority_fee_per_gas: Number(gasPrice),
          },
        },
      });
      const hash = await sendRaw(signResult.signed_transaction as Hex);
      return {
        caip2: input.caip2,
        hash,
        transaction_id: input.reference_id,
      };
    };

    if (options.sendTransaction) {
      this.#send = options.sendTransaction;
    } else if (options.signTransaction) {
      this.#send = executeSignAndSendWith(options.signTransaction);
    } else {
      const client = new PrivyClient({
        appId: options.appId,
        appSecret: options.appSecret,
        timeout: options.rpcTimeoutMs ?? 10_000,
        maxRetries: 0,
      });
      const signTx = (walletId: string, input: Parameters<NonNullable<PrivyArcWalletProviderOptions['signTransaction']>>[1]) =>
        client.wallets().ethereum().signTransaction(walletId, input);
      const signAndSend = executeSignAndSendWith(signTx);

      this.#send = async (walletId, input) => {
        try {
          return await client.wallets().ethereum().sendTransaction(walletId, input);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = (error as { status?: unknown }).status;
          if (
            status === 401 ||
            message.includes('not authorized to transact on chain') ||
            message.includes('App is not authorized')
          ) {
            return await signAndSend(walletId, input);
          }
          throw error;
        }
      };
    }

    this.#getReceipt =
      options.getTransactionReceipt ?? ((hash) => publicClient.getTransactionReceipt({ hash }));
    this.#getBlock = options.getBlockNumber ?? (() => publicClient.getBlockNumber());
  }

  getBlockNumber(): Promise<bigint> {
    return this.#getBlock();
  }

  async sendTransaction(input: Parameters<WalletProvider['sendTransaction']>[0]) {
    if (input.chainId !== this.#options.chainId) {
      throw new Error('Settlement request chain does not match configured Arc chain');
    }
    const caip2 = `eip155:${input.chainId}`;
    const result = await this.#send(this.#options.walletId, {
      caip2,
      idempotency_key: input.idempotencyKey,
      reference_id: input.referenceId,
      params: {
        transaction: {
          chain_id: input.chainId,
          to: input.to,
          value: toHex(input.value),
          data: input.data,
        },
      },
    });
    if (result.caip2 !== caip2 || !TRANSACTION_HASH.test(result.hash)) {
      throw new Error('Privy returned settlement identity that does not match the request');
    }
    return {
      transactionHash: result.hash,
      providerReferenceId: result.transaction_id ?? result.reference_id ?? input.referenceId,
      walletAddress: this.#options.walletAddress,
    };
  }

  async getReceipt(transactionHash: string): Promise<TransactionReceipt | null> {
    if (!TRANSACTION_HASH.test(transactionHash)) {
      throw new Error('Refusing to query a malformed transaction hash');
    }
    try {
      const receipt = await this.#getReceipt(transactionHash as Hex);
      if (receipt.to === null) return null;
      return {
        transactionHash: receipt.transactionHash,
        chainId: this.#options.chainId,
        from: receipt.from,
        to: receipt.to,
        status: receipt.status === 'success' ? 1 : 0,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        logs: receipt.logs.map((log) => {
          if (log.logIndex === null) {
            throw new Error('Arc returned a mined receipt with an unindexed log');
          }
          return {
            address: log.address,
            topics: log.topics,
            data: log.data,
            logIndex: log.logIndex,
          };
        }),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionReceiptNotFoundError') return null;
      throw error;
    }
  }
}
