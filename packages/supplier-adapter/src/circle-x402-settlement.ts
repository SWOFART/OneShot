import { createHash } from 'node:crypto';
import {
  asBlockNumber,
  asProviderReferenceId,
  asTransactionHash,
  canonicalIntentPayload,
  type CreateIntentRequest,
  type SettlementResult,
} from '@oneshot/contracts';
import {
  TRANSFER_EVENT_TOPIC,
  type ReceiptSource,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';
import {
  ARC_X402_NETWORK,
  ARC_X402_USDC,
  type CircleX402Client,
  CircleX402AmbiguousError,
  parseCircleX402Quote,
} from './circle-x402.js';

export const ARC_X402_GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';

interface SettlementContext {
  readonly attemptId: string;
  readonly correlationId: string;
}

export interface CircleX402SettlementPortOptions {
  readonly client: CircleX402Client;
  readonly getTarget: (businessIntentId: string) => Promise<
    | {
        readonly businessIntentId: string;
        readonly resourceUrl: string;
        readonly method: 'GET';
        readonly quotePayload: unknown;
      }
    | undefined
  >;
  readonly getReceipt: ReceiptSource['getReceipt'];
  readonly allowedUrl: string;
  readonly gatewayWalletAddress?: string;
  readonly recordProviderTransaction?: (
    attemptId: string,
    transactionHash: string,
  ) => Promise<void>;
  readonly recordResponse?: (
    businessIntentId: string,
    response: unknown,
    transactionHash: string,
  ) => Promise<void>;
}

export function verifyCircleX402Receipt(
  receipt: TransactionReceipt,
  expected: {
    readonly tokenContract: string;
    readonly recipient: string;
    readonly amountAtomic: bigint;
    readonly chainId?: number;
    readonly gatewayWalletAddress?: string;
  },
):
  | { readonly result: 'CONFIRMED'; readonly transferLogIndex: number }
  | { readonly result: 'FINAL_REVERT'; readonly detail: string }
  | { readonly result: 'NOT_CONFIRMED'; readonly detail: string } {
  if (receipt.chainId !== (expected.chainId ?? 5042002)) {
    return { result: 'NOT_CONFIRMED', detail: 'x402 receipt is from the wrong Arc chain' };
  }
  if (
    expected.gatewayWalletAddress &&
    receipt.to.toLowerCase() !== expected.gatewayWalletAddress.toLowerCase()
  ) {
    return { result: 'NOT_CONFIRMED', detail: 'x402 receipt did not call the Gateway wallet' };
  }
  if (receipt.status === 0) {
    return { result: 'FINAL_REVERT', detail: 'x402 Gateway transaction reverted' };
  }
  const matches = receipt.logs.filter((log) => {
    if (
      log.address.toLowerCase() !== expected.tokenContract.toLowerCase() ||
      log.topics[0]?.toLowerCase() !== TRANSFER_EVENT_TOPIC
    ) {
      return false;
    }
    const toTopic = log.topics[2];
    if (!toTopic || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return false;
    return (
      `0x${toTopic.slice(-40)}`.toLowerCase() === expected.recipient.toLowerCase() &&
      BigInt(log.data) === expected.amountAtomic
    );
  });
  if (matches.length !== 1) {
    return {
      result: 'NOT_CONFIRMED',
      detail: `x402 receipt contains ${matches.length} matching USDC Transfer logs; expected exactly one`,
    };
  }
  return { result: 'CONFIRMED', transferLogIndex: matches[0]!.logIndex };
}

function safeResponse(value: unknown): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? 'null';
  } catch {
    return { error: 'paid API response omitted: non-JSON value' };
  }
  if (Buffer.byteLength(serialized, 'utf8') > 32_768) {
    return { error: 'paid API response omitted: response too large' };
  }
  const sensitive = /authorization|cookie|credential|password|private.?key|secret|token/iu;
  const walk = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(walk);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .filter(([key]) => !sensitive.test(key))
          .map(([key, child]) => [key, walk(child)]),
      );
    }
    return entry;
  };
  return walk(value);
}

export class CircleX402SettlementPort {
  readonly name = 'CircleX402SettlementPort';
  readonly contractVersion = '1.0.0';
  readonly network = ARC_X402_NETWORK;
  readonly #options: CircleX402SettlementPortOptions;

  constructor(options: CircleX402SettlementPortOptions) {
    this.#options = options;
    if (
      !options.allowedUrl.startsWith('https://') &&
      !options.allowedUrl.startsWith('http://localhost')
    ) {
      throw new Error('Circle x402 settlement port requires a credential-free HTTPS resource URL');
    }
  }

  getSubmissionIdentity(request: CreateIntentRequest) {
    const requestFingerprint = createHash('sha256')
      .update(canonicalIntentPayload(request), 'utf8')
      .digest('hex');
    return {
      idempotencyKey: `circle-x402:${request.business_intent_id}`,
      referenceId: `circle-x402:${request.business_intent_id}`,
      requestFingerprint,
      providerKind: 'CIRCLE_X402' as const,
    };
  }

  async submit(
    request: CreateIntentRequest,
    context: SettlementContext,
  ): Promise<SettlementResult> {
    const target = await this.#options.getTarget(request.business_intent_id);
    if (!target || target.businessIntentId !== request.business_intent_id) {
      return { kind: 'DEFINITELY_NOT_SUBMITTED', reason: 'Paid API target is unavailable' };
    }
    const quote = parseCircleX402Quote(target.quotePayload);
    if (quote.resourceUrl !== target.resourceUrl || quote.url !== this.#options.allowedUrl) {
      return {
        kind: 'DEFINITELY_NOT_SUBMITTED',
        reason: 'Stored x402 target does not match policy',
      };
    }

    let result;
    try {
      result = await this.#options.client.payOnce({
        businessIntentId: request.business_intent_id,
        url: quote.url,
        quote,
        method: target.method,
      });
    } catch (error) {
      if (error instanceof CircleX402AmbiguousError) {
        return { kind: 'POSSIBLY_SUBMITTED', reason: 'x402 request outcome is ambiguous' };
      }
      return { kind: 'POSSIBLY_SUBMITTED', reason: 'x402 request failed after payment boundary' };
    }

    const transactionHash = result.settlement?.transaction;
    if (!transactionHash) {
      return {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'x402 response omitted settlement transaction hash',
      };
    }
    try {
      await this.#options.recordProviderTransaction?.(context.attemptId, transactionHash);
      await this.#options.recordResponse?.(
        request.business_intent_id,
        safeResponse(result.data),
        transactionHash,
      );
    } catch {
      return { kind: 'POSSIBLY_SUBMITTED', reason: 'x402 evidence could not be persisted' };
    }

    const receipt = await this.#options.getReceipt(transactionHash);
    if (!receipt) {
      return { kind: 'POSSIBLY_SUBMITTED', reason: 'x402 Gateway transaction is not mined yet' };
    }
    if (receipt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
      return {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'Arc returned evidence for a different transaction',
      };
    }
    const verdict = verifyCircleX402Receipt(receipt, {
      tokenContract: ARC_X402_USDC,
      recipient: request.recipient,
      amountAtomic: BigInt(request.amount_atomic),
      gatewayWalletAddress: this.#options.gatewayWalletAddress ?? ARC_X402_GATEWAY_WALLET,
    });
    if (verdict.result === 'FINAL_REVERT') {
      return { kind: 'DEFINITELY_NOT_SUBMITTED', reason: verdict.detail };
    }
    if (verdict.result !== 'CONFIRMED') {
      return { kind: 'POSSIBLY_SUBMITTED', reason: verdict.detail };
    }
    return {
      kind: 'CONFIRMED',
      provider_reference_id: asProviderReferenceId(`circle-x402:${request.business_intent_id}`),
      transaction_hash: asTransactionHash(transactionHash),
      block_number: asBlockNumber(receipt.blockNumber.toString()),
      transfer_log_index: verdict.transferLogIndex,
    };
  }
}
