import { createPublicClient, http, type Chain, type Hash } from 'viem';
import { ARC_TESTNET } from './profiles.js';
import type { ReceiptLog, TransactionReceipt } from './receipt.js';

export interface ArcReceiptSourceOptions {
  readonly rpcUrl: string;
  readonly chainId?: number;
  readonly rpcTimeoutMs?: number;
}

const arcTestnetChain: Chain = {
  id: ARC_TESTNET.chainId,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: ARC_TESTNET.nativeDecimals },
  rpcUrls: { default: { http: [] } },
};

function asReceiptLog(log: {
  readonly address: string;
  readonly topics: readonly (`0x${string}` | null)[];
  readonly data: `0x${string}`;
  readonly logIndex: number | null;
}): ReceiptLog | null {
  if (log.logIndex === null || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0) {
    return null;
  }
  if (log.topics.some((topic) => topic === null)) return null;
  const topics = log.topics as readonly `0x${string}`[];
  return {
    address: log.address,
    topics,
    data: log.data,
    logIndex: log.logIndex,
  };
}

/**
 * Read-only Arc receipt access for browser-funded payments. This source has no
 * signer and exposes only transaction receipts; it cannot submit a transaction.
 */
export function createArcReceiptSource(options: ArcReceiptSourceOptions) {
  if ((options.chainId ?? ARC_TESTNET.chainId) !== ARC_TESTNET.chainId) {
    throw new Error('User-wallet receipt verification requires Arc Testnet');
  }
  const client = createPublicClient({
    chain: arcTestnetChain,
    transport: http(options.rpcUrl, { timeout: options.rpcTimeoutMs ?? 10_000 }),
  });

  return {
    async getReceipt(transactionHashValue: string): Promise<TransactionReceipt | null> {
      if (!/^0x[0-9a-fA-F]{64}$/u.test(transactionHashValue)) return null;
      const transactionHash = transactionHashValue.toLowerCase() as Hash;
      try {
        const receipt = await client.getTransactionReceipt({ hash: transactionHash });
        const logs = receipt.logs.flatMap((log) => {
          const parsed = asReceiptLog(log);
          return parsed ? [parsed] : [];
        });
        if (logs.length !== receipt.logs.length || receipt.to === null) return null;
        return {
          transactionHash: receipt.transactionHash.toLowerCase(),
          chainId: ARC_TESTNET.chainId,
          from: receipt.from,
          to: receipt.to,
          status: receipt.status === 'success' ? 1 : 0,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          logs,
        };
      } catch {
        // A missing or not-yet-indexed receipt is deliberately non-terminal.
        return null;
      }
    },
  };
}
