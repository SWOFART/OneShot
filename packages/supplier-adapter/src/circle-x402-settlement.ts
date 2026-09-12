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
  verifyCircleGatewayBatchReceipt,
  type ReceiptSource,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';
import {
  ARC_X402_GATEWAY_WALLET,
  ARC_X402_NETWORK,
  ARC_X402_USDC,
  type CircleX402Client,
  CircleX402AmbiguousError,
  CircleX402PreSubmitError,
  parseCircleX402Quote,
} from './circle-x402.js';

export { ARC_X402_GATEWAY_WALLET } from './circle-x402.js';
const X402_REFERENCE_PREFIX = 'circle-x402:';
const X402_REFERENCE_SUFFIX_LENGTH = 52;

function canonicalX402IntentPayload(request: CreateIntentRequest): string {
  return canonicalIntentPayload({
    business_intent_id: request.business_intent_id,
    recipient: request.recipient,
    amount_atomic: request.amount_atomic,
    asset: request.asset,
    network: request.network,
    purpose: request.purpose,
  });
}

function x402RequestFingerprint(request: CreateIntentRequest): string {
  return createHash('sha256').update(canonicalX402IntentPayload(request), 'utf8').digest('hex');
}

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
  readonly getTransactionInput?: (transactionHash: string) => Promise<string>;
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
  readonly recordTransfer?: (
    businessIntentId: string,
    response: unknown,
    providerTransferId: string,
  ) => Promise<void>;
}

export function verifyCircleX402Receipt(
  receipt: TransactionReceipt,
  transactionInput: string | undefined,
  expected: {
    readonly tokenContract: string;
    readonly payer: string;
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
    const fromTopic = log.topics[1];
    if (!toTopic || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return false;
    return (
      fromTopic !== undefined &&
      `0x${fromTopic.slice(-40)}`.toLowerCase() === expected.payer.toLowerCase() &&
      `0x${toTopic.slice(-40)}`.toLowerCase() === expected.recipient.toLowerCase() &&
      BigInt(log.data) === expected.amountAtomic
    );
  });
  if (matches.length === 1) {
    return { result: 'CONFIRMED', transferLogIndex: matches[0]!.logIndex };
  }

  if (transactionInput) {
    return verifyCircleGatewayBatchReceipt(receipt, transactionInput, {
      chainId: expected.chainId ?? 5042002,
      gatewayWalletAddress: expected.gatewayWalletAddress ?? ARC_X402_GATEWAY_WALLET,
      tokenContract: expected.tokenContract,
      payer: expected.payer,
      recipient: expected.recipient,
      amountAtomic: expected.amountAtomic,
      gatewayDomain: 26,
    });
  }

  return {
    result: 'NOT_CONFIRMED',
    detail: `x402 receipt contains ${matches.length} matching USDC Transfer logs; expected exactly one`,
  };
}

export function safeCircleX402Response(value: unknown): unknown {
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
    const requestFingerprint = x402RequestFingerprint(request);
    const providerIdentity = `${X402_REFERENCE_PREFIX}${requestFingerprint.slice(0, X402_REFERENCE_SUFFIX_LENGTH)}`;
    return {
      idempotencyKey: providerIdentity,
      referenceId: providerIdentity,
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
      if (error instanceof CircleX402PreSubmitError) {
        return { kind: 'DEFINITELY_NOT_SUBMITTED', reason: 'x402 authorization was refused' };
      }
      if (error instanceof CircleX402AmbiguousError) {
        return { kind: 'POSSIBLY_SUBMITTED', reason: 'x402 request outcome is ambiguous' };
      }
      return { kind: 'POSSIBLY_SUBMITTED', reason: 'x402 request failed after payment boundary' };
    }

    let transactionHash = result.settlement?.transactionHash;
    const providerTransferId = result.settlement?.providerTransferId;
    if (!transactionHash && !providerTransferId) {
      return {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'x402 response omitted settlement identity',
      };
    }
    try {
      if (providerTransferId) {
        await this.#options.recordTransfer?.(
          request.business_intent_id,
          safeCircleX402Response(result.data),
          providerTransferId,
        );
        const transfer = await this.#options.client.getTransfer(providerTransferId);
        if (
          transfer.status !== 'completed' ||
          !transfer.txHash ||
          transfer.sendingNetwork !== ARC_X402_NETWORK ||
          transfer.recipientNetwork !== ARC_X402_NETWORK ||
          transfer.fromAddress.toLowerCase() !== this.#options.client.payerAddress.toLowerCase() ||
          transfer.toAddress.toLowerCase() !== request.recipient.toLowerCase() ||
          transfer.amount !== request.amount_atomic
        ) {
          return { kind: 'POSSIBLY_SUBMITTED', reason: 'Circle x402 transfer is still pending' };
        }
        transactionHash = transfer.txHash;
      } else if (transactionHash) {
        await this.#options.recordResponse?.(
          request.business_intent_id,
          safeCircleX402Response(result.data),
          transactionHash,
        );
      }
      await this.#options.recordProviderTransaction?.(context.attemptId, transactionHash!);
    } catch {
      return { kind: 'POSSIBLY_SUBMITTED', reason: 'x402 evidence could not be persisted' };
    }

    if (!transactionHash) {
      return { kind: 'POSSIBLY_SUBMITTED', reason: 'Circle x402 transfer has no Arc transaction' };
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
    const transactionInput = await this.#options.getTransactionInput?.(transactionHash);
    const verdict = verifyCircleX402Receipt(receipt, transactionInput, {
      tokenContract: ARC_X402_USDC,
      payer: this.#options.client.payerAddress,
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
      provider_reference_id: asProviderReferenceId(
        `${X402_REFERENCE_PREFIX}${x402RequestFingerprint(request).slice(0, X402_REFERENCE_SUFFIX_LENGTH)}`,
      ),
      transaction_hash: asTransactionHash(transactionHash),
      block_number: asBlockNumber(receipt.blockNumber.toString()),
      transfer_log_index: verdict.transferLogIndex,
      verified_by: 'ARC_RPC_EXACT_TRANSFER',
    };
  }
}
