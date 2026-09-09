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
    if (options.sendTransaction) {
      this.#send = options.sendTransaction;
    } else {
      const client = new PrivyClient({
        appId: options.appId,
        appSecret: options.appSecret,
        timeout: options.rpcTimeoutMs ?? 10_000,
        maxRetries: 0,
      });
      this.#send = (walletId, input) =>
        client.wallets().ethereum().sendTransaction(walletId, input);
    }

    if (options.getTransactionReceipt && options.getBlockNumber) {
      this.#getReceipt = options.getTransactionReceipt;
      this.#getBlock = options.getBlockNumber;
    } else {
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
      this.#getReceipt = options.getTransactionReceipt ??
        ((hash) => publicClient.getTransactionReceipt({ hash }));
      this.#getBlock = options.getBlockNumber ?? (() => publicClient.getBlockNumber());
    }
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
