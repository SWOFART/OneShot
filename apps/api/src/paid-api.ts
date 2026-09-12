import {
  asBlockNumber,
  asEvmAddress,
  asProviderReferenceId,
  asTransactionHash,
  type CreatePaidApiRequest,
  type PaidApiQuote,
  type PaidApiResponse,
} from '@oneshot/contracts';
import { derivedPaidApiBusinessIntentId, paidApiFingerprint } from '@oneshot/domain';
import {
  CircleX402AmbiguousError,
  CircleX402PreSubmitError,
  fetchCircleX402Quote,
  parseCircleX402Quote,
  parseCircleX402UserWalletPayload,
  safeCircleX402Response,
  verifyCircleX402Receipt,
  type CircleX402Quote,
  type CircleX402UserWalletForwarder,
} from '@oneshot/supplier-adapter';
import type {
  CreatePaidApiResult,
  IntentLedger,
  PaidApiQuoteSnapshot,
} from '@oneshot/storage-postgres';

export interface PaidApiService {
  quote(request: CreatePaidApiRequest): Promise<PaidApiQuote>;
  start(
    request: CreatePaidApiRequest,
    correlationId: string,
    approvedQuote: PaidApiQuote,
  ): Promise<CreatePaidApiResult>;
  prepareUserWallet(
    request: CreatePaidApiRequest,
    correlationId: string,
    approvedQuote: PaidApiQuote,
    payerWallet: string,
  ): Promise<CreatePaidApiResult>;
  submitUserWallet(
    businessIntentId: string,
    payerWallet: string,
    paymentPayload: unknown,
    correlationId: string,
  ): Promise<PaidApiResponse>;
  reconcileUserWallet(businessIntentId: string, correlationId: string): Promise<PaidApiResponse>;
  get(businessIntentId: string): Promise<PaidApiResponse | undefined>;
}

function publicQuote(quote: CircleX402Quote): PaidApiQuote {
  return {
    supplier_id: 'circle-x402-v1',
    resource_url: quote.resourceUrl,
    recipient: quote.requirements.payTo,
    amount_atomic: quote.requirements.amount,
    asset: 'USDC',
    network: 'eip155:5042002',
    x402_version: quote.x402Version,
    max_timeout_seconds: quote.requirements.maxTimeoutSeconds,
  };
}

export class PaidApiQuoteChangedError extends Error {}
export class PaidApiUserWalletConflictError extends Error {}
export class PaidApiUserWalletNotReadyError extends Error {}

function sameQuote(left: PaidApiQuote, right: PaidApiQuote): boolean {
  return (
    left.supplier_id === right.supplier_id &&
    left.resource_url === right.resource_url &&
    left.recipient.toLowerCase() === right.recipient.toLowerCase() &&
    left.amount_atomic === right.amount_atomic &&
    left.asset === right.asset &&
    left.network === right.network &&
    left.x402_version === right.x402_version &&
    left.max_timeout_seconds === right.max_timeout_seconds
  );
}

export class CircleX402PaidApiService implements PaidApiService {
  readonly #ledger: Pick<
    IntentLedger,
    | 'getPaidApi'
    | 'getPaidApiTarget'
    | 'getIntent'
    | 'getProviderRequestIdentity'
    | 'createPaidApiOrReplay'
    | 'claimSubmission'
    | 'recordProviderTransaction'
    | 'recordPaidApiResponse'
    | 'recordPaidApiTransfer'
    | 'completeSubmission'
  >;
  readonly #workspaceId: string;
  readonly #url: string;
  readonly #maxAmountAtomic: bigint;
  readonly #fetch: typeof fetch | undefined;
  readonly #userWalletForwarder: CircleX402UserWalletForwarder | undefined;

  constructor(options: {
    readonly ledger: Pick<
      IntentLedger,
      | 'getPaidApi'
      | 'getPaidApiTarget'
      | 'getIntent'
      | 'getProviderRequestIdentity'
      | 'createPaidApiOrReplay'
      | 'claimSubmission'
      | 'recordProviderTransaction'
      | 'recordPaidApiResponse'
      | 'recordPaidApiTransfer'
      | 'completeSubmission'
    >;
    readonly workspaceId: string;
    readonly url: string;
    readonly maxAmountAtomic: bigint;
    readonly fetchFn?: typeof fetch;
    readonly userWalletForwarder?: CircleX402UserWalletForwarder;
  }) {
    this.#ledger = options.ledger;
    this.#workspaceId = options.workspaceId;
    this.#url = options.url;
    this.#maxAmountAtomic = options.maxAmountAtomic;
    this.#fetch = options.fetchFn;
    this.#userWalletForwarder = options.userWalletForwarder;
  }

  async #quote(): Promise<CircleX402Quote> {
    return fetchCircleX402Quote(this.#url, {
      maxAmountAtomic: this.#maxAmountAtomic,
      ...(this.#fetch ? { fetchFn: this.#fetch } : {}),
    });
  }

  async quote(): Promise<PaidApiQuote> {
    return publicQuote(await this.#quote());
  }

  async start(
    request: CreatePaidApiRequest,
    correlationId: string,
    approvedQuote: PaidApiQuote,
  ): Promise<CreatePaidApiResult> {
    return this.#start(request, correlationId, approvedQuote, 'SERVER_PRIVY');
  }

  async prepareUserWallet(
    request: CreatePaidApiRequest,
    correlationId: string,
    approvedQuote: PaidApiQuote,
    payerWallet: string,
  ): Promise<CreatePaidApiResult> {
    return this.#start(request, correlationId, approvedQuote, 'USER_WALLET', payerWallet);
  }

  async #start(
    request: CreatePaidApiRequest,
    correlationId: string,
    approvedQuote: PaidApiQuote,
    paymentMode: 'SERVER_PRIVY' | 'USER_WALLET',
    payerWalletValue?: string,
  ): Promise<CreatePaidApiResult> {
    const payerWallet = payerWalletValue === undefined ? undefined : asEvmAddress(payerWalletValue);
    const existing = await this.#ledger.getPaidApi(
      this.#workspaceId,
      derivedPaidApiBusinessIntentId(this.#workspaceId, request),
    );
    if (existing) {
      return {
        kind:
          sameQuote(existing.quote, approvedQuote) &&
          (existing.payment_mode ?? 'SERVER_PRIVY') === paymentMode &&
          (paymentMode === 'SERVER_PRIVY' ||
            existing.payer_wallet?.toLowerCase() === payerWallet?.toLowerCase())
            ? 'REPLAY_IDENTICAL'
            : 'INTENT_PAYLOAD_CONFLICT',
        request: existing,
      };
    }
    const quote = await this.#quote();
    if (!sameQuote(publicQuote(quote), approvedQuote)) {
      throw new PaidApiQuoteChangedError(
        'The quote changed. Review the current price and recipient before approving.',
      );
    }
    const snapshot: PaidApiQuoteSnapshot = {
      resourceUrl: quote.resourceUrl,
      x402Version: quote.x402Version,
      maxTimeoutSeconds: quote.requirements.maxTimeoutSeconds,
      recipient: quote.requirements.payTo,
      amountAtomic: quote.requirements.amount,
      quotePayload: quote,
    };
    const result = await this.#ledger.createPaidApiOrReplay({
      workspaceId: this.#workspaceId,
      request,
      quote: snapshot,
      correlationId,
      paymentMode,
      ...(payerWallet ? { payerWallet } : {}),
    });
    // Another caller may have bound this task while the live quote was loading.
    return sameQuote(result.request.quote, approvedQuote) &&
      (result.request.payment_mode ?? 'SERVER_PRIVY') === paymentMode &&
      (paymentMode === 'SERVER_PRIVY' ||
        result.request.payer_wallet?.toLowerCase() === payerWallet?.toLowerCase())
      ? result
      : { kind: 'INTENT_PAYLOAD_CONFLICT', request: result.request };
  }

  async submitUserWallet(
    businessIntentId: string,
    payerWalletValue: string,
    paymentPayload: unknown,
    correlationId: string,
  ): Promise<PaidApiResponse> {
    const existing = await this.get(businessIntentId);
    if (!existing) throw new PaidApiUserWalletNotReadyError('Paid API request was not found');
    if (
      existing.payment_mode !== 'USER_WALLET' ||
      !existing.payer_wallet ||
      existing.payer_wallet.toLowerCase() !== payerWalletValue.toLowerCase()
    ) {
      throw new PaidApiUserWalletConflictError(
        'The payer wallet does not match the durable paid API authorization',
      );
    }
    if (!this.#userWalletForwarder) {
      throw new PaidApiUserWalletNotReadyError(
        'User-wallet Circle forwarding is not configured on this API',
      );
    }
    const target = await this.#ledger.getPaidApiTarget(businessIntentId);
    if (!target || target.paymentMode !== 'USER_WALLET') {
      throw new PaidApiUserWalletNotReadyError('The user-wallet paid API target is unavailable');
    }
    const quote = parseCircleX402Quote(target.quotePayload);
    const parsedPayload = parseCircleX402UserWalletPayload(
      paymentPayload,
      quote,
      existing.payer_wallet,
    );
    const nonce = String(
      (parsedPayload.payload['authorization'] as Record<string, unknown>)['nonce'],
    );
    const providerIdentity = {
      idempotencyKey: `circle-x402-user:${paidApiFingerprint(
        { task_key: existing.task_key, tool_id: existing.tool_id },
        existing.resource_url,
        existing.payer_wallet,
      ).slice(0, 32)}:${nonce.slice(2, 18)}`,
      referenceId: `circle-x402-user:${nonce.slice(2, 18)}`,
      requestFingerprint: paidApiFingerprint(
        { task_key: existing.task_key, tool_id: existing.tool_id },
        existing.resource_url,
        existing.payer_wallet,
      ),
      providerKind: 'CIRCLE_X402' as const,
    };
    const claim = await this.#ledger.claimSubmission(
      businessIntentId,
      correlationId,
      providerIdentity,
    );
    if (!claim.claimed) {
      const current = await this.get(businessIntentId);
      if (current) return current;
      throw new PaidApiUserWalletNotReadyError('Paid API request is no longer readable');
    }

    let result;
    try {
      result = await this.#userWalletForwarder.forward({
        businessIntentId,
        quote,
        payerAddress: existing.payer_wallet,
        paymentPayload: parsedPayload,
      });
    } catch (error) {
      const settlement =
        error instanceof CircleX402PreSubmitError
          ? ({
              kind: 'DEFINITELY_NOT_SUBMITTED',
              reason: 'User-wallet x402 authorization was refused',
            } as const)
          : ({
              kind: 'POSSIBLY_SUBMITTED',
              reason:
                error instanceof CircleX402AmbiguousError
                  ? 'User-wallet x402 request outcome is ambiguous'
                  : 'User-wallet x402 request failed after signing',
            } as const);
      await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, settlement);
      const current = await this.get(businessIntentId);
      if (!current) throw new PaidApiUserWalletNotReadyError('Paid API result is unavailable');
      return current;
    }

    let transactionHash = result.settlement?.transactionHash;
    const providerTransferId = result.settlement?.providerTransferId;
    if (providerTransferId) {
      await this.#ledger.recordPaidApiTransfer(
        businessIntentId,
        safeCircleX402Response(result.data),
        providerTransferId,
      );
      let transfer;
      try {
        transfer = await this.#userWalletForwarder.getTransfer(providerTransferId);
      } catch {
        await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, {
          kind: 'POSSIBLY_SUBMITTED',
          reason: 'Circle x402 transfer status could not be checked',
        });
        return this.#readCurrentPaidApi(businessIntentId);
      }
      const transferMatches =
        transfer.sendingNetwork === 'eip155:5042002' &&
        transfer.recipientNetwork === 'eip155:5042002' &&
        transfer.fromAddress.toLowerCase() === existing.payer_wallet.toLowerCase() &&
        transfer.toAddress.toLowerCase() === existing.quote.recipient.toLowerCase() &&
        transfer.amount === existing.quote.amount_atomic;
      if (transfer.status === 'failed' && transferMatches) {
        await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, {
          kind: 'DEFINITELY_NOT_SUBMITTED',
          reason: 'Circle x402 transfer failed before settlement',
        });
        return this.#readCurrentPaidApi(businessIntentId);
      }
      if (transfer.status !== 'completed' || !transfer.txHash || !transferMatches) {
        await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, {
          kind: 'POSSIBLY_SUBMITTED',
          reason: 'Circle x402 transfer is not final yet',
        });
        return this.#readCurrentPaidApi(businessIntentId);
      }
      transactionHash = transfer.txHash;
    } else if (transactionHash) {
      await this.#ledger.recordPaidApiResponse(
        businessIntentId,
        safeCircleX402Response(result.data),
        transactionHash,
      );
    }
    if (!transactionHash) {
      await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'Circle x402 response omitted settlement identity',
      });
      return this.#readCurrentPaidApi(businessIntentId);
    }
    await this.#ledger.recordProviderTransaction(claim.attemptId, transactionHash);
    let receipt;
    try {
      receipt = await this.#userWalletForwarder.getReceipt(transactionHash);
    } catch {
      await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'Circle x402 Arc receipt could not be checked',
      });
      return this.#readCurrentPaidApi(businessIntentId);
    }
    if (!receipt || typeof receipt !== 'object') {
      await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'Circle x402 Arc receipt is not final yet',
      });
    } else {
      let transactionInput: string | undefined;
      try {
        transactionInput = await this.#userWalletForwarder.getTransactionInput(transactionHash);
      } catch {
        await this.#ledger.completeSubmission(businessIntentId, claim.attemptId, {
          kind: 'POSSIBLY_SUBMITTED',
          reason: 'Circle x402 transaction evidence could not be checked',
        });
        return this.#readCurrentPaidApi(businessIntentId);
      }
      const verdict = verifyCircleX402Receipt(receipt, transactionInput, {
        tokenContract: '0x3600000000000000000000000000000000000000',
        payer: existing.payer_wallet,
        recipient: existing.quote.recipient,
        amountAtomic: BigInt(existing.quote.amount_atomic),
        gatewayWalletAddress: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
      });
      await this.#ledger.completeSubmission(
        businessIntentId,
        claim.attemptId,
        verdict.result === 'CONFIRMED'
          ? {
              kind: 'CONFIRMED',
              provider_reference_id: asProviderReferenceId(
                providerTransferId ?? providerIdentity.referenceId,
              ),
              transaction_hash: asTransactionHash(transactionHash),
              block_number: asBlockNumber(receipt.blockNumber.toString(10)),
              transfer_log_index: verdict.transferLogIndex,
              verified_by: 'ARC_RPC_EXACT_TRANSFER',
            }
          : verdict.result === 'FINAL_REVERT'
            ? { kind: 'DEFINITELY_NOT_SUBMITTED', reason: verdict.detail }
            : { kind: 'POSSIBLY_SUBMITTED', reason: verdict.detail },
      );
    }
    return this.#readCurrentPaidApi(businessIntentId);
  }

  async reconcileUserWallet(
    businessIntentId: string,
    correlationId: string,
  ): Promise<PaidApiResponse> {
    void correlationId;
    const existing = await this.get(businessIntentId);
    if (!existing) throw new PaidApiUserWalletNotReadyError('Paid API request was not found');
    if (existing.payment_mode !== 'USER_WALLET' || !existing.payer_wallet) {
      throw new PaidApiUserWalletConflictError(
        'The paid API request is not configured for a user-wallet payment',
      );
    }
    if (!this.#userWalletForwarder) {
      throw new PaidApiUserWalletNotReadyError(
        'User-wallet Circle forwarding is not configured on this API',
      );
    }
    if (existing.payment_state === 'COMMITTED' || existing.payment_state === 'FAILED_SAFE') {
      return existing;
    }
    const identity = await this.#ledger.getProviderRequestIdentity(businessIntentId);
    if (!identity?.transactionHash && !identity?.providerTransferId) return existing;
    const intent = await this.#ledger.getIntent(businessIntentId);
    const attemptId = intent?.attempts.at(-1)?.attempt_id;
    if (!attemptId) return existing;
    let transactionHash = identity.transactionHash;
    let providerReferenceId = identity.providerTransferId ?? identity.referenceId;
    if (identity.providerTransferId) {
      let transfer;
      try {
        transfer = await this.#userWalletForwarder.getTransfer(identity.providerTransferId);
      } catch {
        return existing;
      }
      const transferMatches =
        transfer.sendingNetwork === 'eip155:5042002' &&
        transfer.recipientNetwork === 'eip155:5042002' &&
        transfer.fromAddress.toLowerCase() === existing.payer_wallet.toLowerCase() &&
        transfer.toAddress.toLowerCase() === existing.quote.recipient.toLowerCase() &&
        transfer.amount === existing.quote.amount_atomic;
      if (!transferMatches) {
        return existing;
      }
      if (transfer.status === 'failed') {
        await this.#ledger.completeSubmission(businessIntentId, attemptId, {
          kind: 'DEFINITELY_NOT_SUBMITTED',
          reason: 'Circle x402 transfer failed before settlement',
        });
        return this.#readCurrentPaidApi(businessIntentId);
      }
      if (transfer.status !== 'completed' || !transfer.txHash) return existing;
      transactionHash = transfer.txHash;
      providerReferenceId = identity.providerTransferId;
    }
    if (!transactionHash) return existing;
    await this.#ledger.recordProviderTransaction(attemptId, transactionHash);
    return this.#verifyUserWalletTransaction(
      businessIntentId,
      attemptId,
      existing,
      transactionHash,
      providerReferenceId,
    );
  }

  async #verifyUserWalletTransaction(
    businessIntentId: string,
    attemptId: string,
    existing: PaidApiResponse,
    transactionHash: string,
    providerReferenceId: string,
  ): Promise<PaidApiResponse> {
    if (!this.#userWalletForwarder) {
      throw new PaidApiUserWalletNotReadyError(
        'User-wallet Circle forwarding is not configured on this API',
      );
    }
    let receipt;
    try {
      receipt = await this.#userWalletForwarder.getReceipt(transactionHash);
    } catch {
      return this.#readCurrentPaidApi(businessIntentId);
    }
    if (!receipt || typeof receipt !== 'object') return this.#readCurrentPaidApi(businessIntentId);
    let transactionInput: string | undefined;
    try {
      transactionInput = await this.#userWalletForwarder.getTransactionInput(transactionHash);
    } catch {
      return this.#readCurrentPaidApi(businessIntentId);
    }
    const verdict = verifyCircleX402Receipt(receipt, transactionInput, {
      tokenContract: '0x3600000000000000000000000000000000000000',
      payer: existing.payer_wallet!,
      recipient: existing.quote.recipient,
      amountAtomic: BigInt(existing.quote.amount_atomic),
      gatewayWalletAddress: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
    });
    await this.#ledger.completeSubmission(
      businessIntentId,
      attemptId,
      verdict.result === 'CONFIRMED'
        ? {
            kind: 'CONFIRMED',
            provider_reference_id: asProviderReferenceId(providerReferenceId),
            transaction_hash: asTransactionHash(transactionHash),
            block_number: asBlockNumber(receipt.blockNumber.toString(10)),
            transfer_log_index: verdict.transferLogIndex,
            verified_by: 'ARC_RPC_EXACT_TRANSFER',
          }
        : verdict.result === 'FINAL_REVERT'
          ? { kind: 'DEFINITELY_NOT_SUBMITTED', reason: verdict.detail }
          : { kind: 'POSSIBLY_SUBMITTED', reason: verdict.detail },
    );
    return this.#readCurrentPaidApi(businessIntentId);
  }

  async #readCurrentPaidApi(businessIntentId: string): Promise<PaidApiResponse> {
    const current = await this.get(businessIntentId);
    if (!current) throw new PaidApiUserWalletNotReadyError('Paid API result is unavailable');
    return current;
  }

  async get(businessIntentId: string): Promise<PaidApiResponse | undefined> {
    return this.#ledger.getPaidApi(this.#workspaceId, businessIntentId);
  }
}

export function createCircleX402PaidApiService(options: {
  readonly ledger: Pick<
    IntentLedger,
    | 'getPaidApi'
    | 'getPaidApiTarget'
    | 'getIntent'
    | 'getProviderRequestIdentity'
    | 'createPaidApiOrReplay'
    | 'claimSubmission'
    | 'recordProviderTransaction'
    | 'recordPaidApiResponse'
    | 'recordPaidApiTransfer'
    | 'completeSubmission'
  >;
  readonly workspaceId: string;
  readonly url: string;
  readonly maxAmountAtomic: bigint;
  readonly fetchFn?: typeof fetch;
  readonly userWalletForwarder?: CircleX402UserWalletForwarder;
}): PaidApiService {
  return new CircleX402PaidApiService(options);
}
