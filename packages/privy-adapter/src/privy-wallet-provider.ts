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
          readonly nonce: Hex;
          readonly gas_limit?: Hex;
          readonly max_fee_per_gas?: Hex;
          readonly max_priority_fee_per_gas?: Hex;
        };
      };
    },
  ) => Promise<{ readonly signed_transaction: string; readonly encoding?: string }>;
  readonly sendRawTransaction?: (serializedTransaction: Hex) => Promise<Hex>;
  /** Must return the pending nonce, not only the latest mined nonce. */
  readonly getTransactionCount?: (
    address: `0x${string}`,
    blockTag?: 'latest' | 'pending',
  ) => Promise<number | bigint>;
  readonly getGasPrice?: () => Promise<bigint>;
  readonly estimateGas?: (input: {
    readonly account: `0x${string}`;
    readonly to: `0x${string}`;
    readonly value: bigint;
    readonly data: Hex;
  }) => Promise<bigint>;
  readonly getNativeBalance?: (address: `0x${string}`) => Promise<bigint>;
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
  readonly #getNativeBalance: NonNullable<PrivyArcWalletProviderOptions['getNativeBalance']>;
  readonly #getGasPrice: NonNullable<PrivyArcWalletProviderOptions['getGasPrice']>;
  readonly #estimateGas: NonNullable<PrivyArcWalletProviderOptions['estimateGas']>;

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
      ((address, blockTag = 'pending') => publicClient.getTransactionCount({ address, blockTag }));
    const getGas =
      options.getGasPrice ?? (() => publicClient.getGasPrice());
    const estimateGas =
      options.estimateGas ??
      ((input: {
        readonly account: `0x${string}`;
        readonly to: `0x${string}`;
        readonly value: bigint;
        readonly data: Hex;
      }) =>
        publicClient.estimateGas({
          account: input.account,
          to: input.to,
          value: input.value,
          data: input.data,
        }));
    const sendRaw =
      options.sendRawTransaction ??
      ((serializedTransaction) => publicClient.sendRawTransaction({ serializedTransaction }));

    // The raw RPC fallback has no provider idempotency key. Collapse duplicate
    // calls for one intent in this provider instance and serialize all raw
    // submissions so concurrent calls in this instance cannot choose the same
    // pending nonce. Durable OneShot state remains the authority across
    // processes and restarts.
    let fallbackQueue = Promise.resolve();
    const fallbackSubmissions = new Map<
      string,
      { readonly fingerprint: string; readonly result: Promise<PrivyTransactionResult> }
    >();
    const withFallbackLock = async <T>(work: () => Promise<T>): Promise<T> => {
      const previous = fallbackQueue;
      let release!: () => void;
      fallbackQueue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await work();
      } finally {
        release();
      }
    };

    const executeSignAndSendWith = (
      signTx: NonNullable<PrivyArcWalletProviderOptions['signTransaction']>,
    ) => async (
      walletId: string,
      input: Parameters<NonNullable<PrivyArcWalletProviderOptions['sendTransaction']>>[1],
    ): Promise<PrivyTransactionResult> => {
      const fingerprint = JSON.stringify(input.params.transaction);
      const existing = fallbackSubmissions.get(input.idempotency_key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new Error('Privy fallback idempotency key was reused for a different transaction');
        }
        return existing.result;
      }

      let rawSendAttempted = false;
      const result = withFallbackLock(async () => {
        const [nonce, gasPrice, estimatedGas] = await Promise.all([
          getNonce(options.walletAddress, 'pending'),
          getGas(),
          estimateGas({
            account: options.walletAddress,
            to: input.params.transaction.to,
            value: BigInt(input.params.transaction.value),
            data: input.params.transaction.data,
          }),
        ]);
        if (estimatedGas <= 0n) throw new Error('Arc gas estimation returned zero');
        const gasLimit = estimatedGas + (estimatedGas + 4n) / 5n;
        const signResult = await signTx(walletId, {
          params: {
            transaction: {
              to: input.params.transaction.to,
              value: input.params.transaction.value,
              data: input.params.transaction.data,
              chain_id: input.params.transaction.chain_id,
              nonce: toHex(BigInt(nonce)),
              gas_limit: toHex(gasLimit),
              max_fee_per_gas: toHex(gasPrice * 2n),
              max_priority_fee_per_gas: toHex(gasPrice),
            },
          },
        });
        rawSendAttempted = true;
        const hash = await sendRaw(signResult.signed_transaction as Hex);
        return {
          caip2: input.caip2,
          hash,
          transaction_id: input.reference_id,
        };
      });
      fallbackSubmissions.set(input.idempotency_key, { fingerprint, result });
      try {
        return await result;
      } catch (error) {
        // Before raw broadcast, a retry is safe. Once sendRawTransaction was
        // invoked, retain the rejected promise so this instance never blindly
        // broadcasts the same business intent twice.
        if (!rawSendAttempted) fallbackSubmissions.delete(input.idempotency_key);
        throw error;
      }
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
          if (
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
    this.#getNativeBalance =
      options.getNativeBalance ?? ((address) => publicClient.getBalance({ address }));
    this.#getGasPrice = getGas;
    this.#estimateGas = estimateGas;
  }

  getBlockNumber(): Promise<bigint> {
    return this.#getBlock();
  }

  getNativeBalance(): Promise<bigint> {
    return this.#getNativeBalance(this.#options.walletAddress);
  }

  async estimateNativeFee(input: {
    readonly to: `0x${string}`;
    readonly value: bigint;
    readonly data: Hex;
  }): Promise<bigint> {
    const [estimatedGas, gasPrice] = await Promise.all([
      this.#estimateGas({ account: this.#options.walletAddress, ...input }),
      this.#getGasPrice(),
    ]);
    if (estimatedGas <= 0n) throw new Error('Arc gas estimation returned zero');
    const gasLimit = estimatedGas + (estimatedGas + 4n) / 5n;
    return gasLimit * gasPrice;
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
