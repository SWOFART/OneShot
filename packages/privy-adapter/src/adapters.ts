/**
 * Concrete adapters for Gate P4 composition.
 *
 * `docs/GATE_P4_CHECKLIST.md` replaces `SimulatorSettlementPort` and
 * `SimulatorAuthorizationPort` in `apps/worker/src/composition.ts` with real
 * lane-B implementations. These are those implementations.
 *
 * They satisfy the worker's port interfaces structurally rather than by
 * importing them: `apps/worker` is Coder A's package, and the lane rule forbids
 * importing another owner's implementation. `@oneshot/contracts` is the
 * sanctioned shared seam, so the result shapes come from there and the classes
 * fit the worker's interfaces without a dependency on it.
 *
 * Both take their provider as an injected interface. Nothing here opens a
 * socket or reads a credential, so the whole settlement path is exercisable
 * offline and P4 supplies the live implementations.
 */

import { createHash } from 'node:crypto';
import {
  asBlockNumber,
  asProviderReferenceId,
  asTransactionHash,
  type AuthorizationResult,
  type CreateIntentRequest,
  type SettlementResult,
} from '@oneshot/contracts';
import {
  classifyOutcome,
  classifyTransportError,
  toProviderResponse,
  verifyReceipt,
  type SettlementConfig,
  type TransactionReceipt,
} from '@oneshot/arc-adapter';
import { buildCanonicalRequest } from './request.js';
import { evaluateScope, type ExpectedScope } from './scope.js';
import { assertNoDrift, type SettlementBaseline } from './hardening.js';

/**
 * Port contract version the worker checks at composition time.
 *
 * Distinct from `ADAPTER_CONTRACT_VERSION` in `ports.ts`, which names the
 * published handoff document. This one is the value
 * `apps/worker/src/composition.ts` compares against.
 */
export const WORKER_PORT_CONTRACT_VERSION = '1.0.0';

/** The only network these adapters will act on. */
export const SUPPORTED_NETWORK = 'eip155:5042002';

export interface SettlementContext {
  readonly attemptId: string;
  readonly correlationId: string;
}

/**
 * The provider capability the settlement adapter needs.
 *
 * Deliberately tiny: send one prepared transaction, and fetch one receipt. A
 * larger surface would be a larger blast radius.
 */
export interface WalletProvider {
  /**
   * Sign and broadcast. Implementations must pass `idempotencyKey` to the
   * provider so a duplicate collapses provider-side as well as locally.
   */
  sendTransaction(input: {
    readonly chainId: number;
    readonly to: `0x${string}`;
    readonly value: bigint;
    readonly data: `0x${string}`;
    readonly idempotencyKey: string;
    readonly referenceId: string;
  }): Promise<{
    readonly transactionHash: string;
    readonly providerReferenceId: string;
    /** Execution-wallet identity used to bind the Arc receipt. */
    readonly walletAddress?: string;
  }>;

  getReceipt(transactionHash: string): Promise<TransactionReceipt | null>;
}

function amountOf(request: CreateIntentRequest): bigint {
  return BigInt(request.amount_atomic);
}

/**
 * Authorization adapter.
 *
 * Refuses locally before anything reaches Privy. The remote policy is the
 * enforcement boundary; this is a second, independent check that can only
 * deny, never grant, so drift in the remote policy cannot silently widen what
 * this build will attempt.
 */
export class PrivyAuthorizationAdapter {
  readonly name = 'PrivyAuthorizationAdapter';
  readonly contractVersion = WORKER_PORT_CONTRACT_VERSION;

  constructor(
    private readonly config: SettlementConfig,
    private readonly baseline: SettlementBaseline,
    private readonly observeIdentity: () => SettlementBaseline,
  ) {}

  authorize(request: CreateIntentRequest): Promise<AuthorizationResult> {
    if (request.network !== SUPPORTED_NETWORK) {
      return Promise.resolve({
        kind: 'DENIED',
        reason: `Network ${request.network} is not the enabled Arc profile`,
      });
    }

    // Drift is checked before the scope check, because a drifted policy makes
    // every other answer untrustworthy rather than merely wrong.
    try {
      assertNoDrift(this.baseline, this.observeIdentity());
    } catch {
      return Promise.resolve({
        kind: 'UNAVAILABLE',
        reason: 'Settlement configuration drifted from the reviewed baseline',
      });
    }

    const recipient = request.recipient as `0x${string}`;

    if (!this.config.recipientAllowlist.includes(recipient.toLowerCase() as `0x${string}`)) {
      return Promise.resolve({ kind: 'DENIED', reason: 'Recipient is not allowlisted' });
    }

    let amount: bigint;
    try {
      amount = amountOf(request);
    } catch {
      return Promise.resolve({ kind: 'DENIED', reason: 'Amount is not a canonical integer' });
    }

    if (amount <= 0n) {
      return Promise.resolve({ kind: 'DENIED', reason: 'Amount must be greater than zero' });
    }

    if (amount > BigInt(this.config.settlementCapAtomic)) {
      return Promise.resolve({
        kind: 'DENIED',
        reason: 'Amount exceeds the approved per-settlement cap',
      });
    }

    const scope: ExpectedScope = {
      chainId: this.config.profile.chainId,
      tokenContract: this.config.profile.tokenContract,
      recipient,
      amountAtomic: amount,
    };
    const decision = evaluateScope(
      {
        chainId: scope.chainId,
        to: scope.tokenContract,
        value: 0n,
        data: buildCanonicalRequest({
          businessIntentId: request.business_intent_id,
          chainId: scope.chainId,
          tokenContract: scope.tokenContract,
          recipient,
          amountAtomic: amount,
        }).data,
      },
      scope,
    );

    if (decision.result === 'DENIED') {
      return Promise.resolve({ kind: 'DENIED', reason: decision.reason });
    }

    return Promise.resolve({ kind: 'AUTHORIZED' });
  }
}

/**
 * Settlement adapter.
 *
 * Submits the direct USDC transfer chosen by the B01.3 spike, then confirms
 * only from a verified receipt. Every failure path that could have broadcast
 * returns `POSSIBLY_SUBMITTED`, which is what keeps a retry from paying twice.
 */
export class ArcSettlementAdapter {
  readonly name = 'ArcSettlementAdapter';
  readonly contractVersion = WORKER_PORT_CONTRACT_VERSION;
  readonly network = SUPPORTED_NETWORK;

  constructor(
    private readonly config: SettlementConfig,
    private readonly provider: WalletProvider,
  ) {}

  getSubmissionIdentity(request: CreateIntentRequest) {
    const canonical = buildCanonicalRequest({
      businessIntentId: request.business_intent_id,
      chainId: this.config.profile.chainId,
      tokenContract: this.config.profile.tokenContract,
      recipient: request.recipient as `0x${string}`,
      amountAtomic: amountOf(request),
    });
    return {
      idempotencyKey: canonical.idempotencyKey,
      referenceId: canonical.referenceId,
      requestFingerprint: createHash('sha256')
        .update(canonical.canonicalBody, 'utf8')
        .digest('hex'),
      walletId: this.config.privyWalletId,
      policyId: this.config.privyPolicyId,
    };
  }

  /**
   * Takes no `SettlementContext`: a method with fewer parameters still
   * satisfies the worker's port, and the attempt and correlation identifiers
   * are not used here. Submission identity comes from the Business Intent, so
   * that a retry under a new attempt id still derives the same idempotency key.
   */
  async submit(request: CreateIntentRequest): Promise<SettlementResult> {
    if (request.network !== SUPPORTED_NETWORK) {
      return {
        kind: 'DEFINITELY_NOT_SUBMITTED',
        reason: `Network ${request.network} is not the enabled Arc profile`,
      };
    }

    let canonical;
    try {
      canonical = buildCanonicalRequest({
        businessIntentId: request.business_intent_id,
        chainId: this.config.profile.chainId,
        tokenContract: this.config.profile.tokenContract,
        recipient: request.recipient as `0x${string}`,
        amountAtomic: amountOf(request),
      });
    } catch (error) {
      // Refused locally; nothing was sent.
      return {
        kind: 'DEFINITELY_NOT_SUBMITTED',
        reason: `Request rejected before submission: ${(error as Error).message.slice(0, 160)}`,
      };
    }

    let sent: { transactionHash: string; providerReferenceId: string; walletAddress?: string };
    try {
      sent = await this.provider.sendTransaction({
        chainId: canonical.chainId,
        to: canonical.to,
        value: canonical.value,
        data: canonical.data,
        idempotencyKey: canonical.idempotencyKey,
        referenceId: canonical.referenceId,
      });
    } catch (error) {
      // The taxonomy decides whether this could have reached the network.
      const classification = classifyOutcome(
        toProviderResponse(classifyTransportError(error)),
      );
      return classification.outcome === 'DEFINITELY_NOT_SUBMITTED'
        ? { kind: 'DEFINITELY_NOT_SUBMITTED', reason: classification.reason }
        : { kind: 'POSSIBLY_SUBMITTED', reason: classification.reason };
    }

    let receipt: TransactionReceipt | null;
    try {
      receipt = await this.provider.getReceipt(sent.transactionHash);
    } catch {
      // The transaction was broadcast; only the confirmation failed.
      return {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'Transaction was broadcast but its receipt could not be read',
      };
    }

    if (receipt === null) {
      return {
        kind: 'POSSIBLY_SUBMITTED',
        reason: 'Transaction was broadcast but no receipt is available yet',
      };
    }

    const verdict = verifyReceipt(receipt, {
      chainId: this.config.profile.chainId,
      walletAddress: sent.walletAddress ?? sent.providerReferenceId,
      tokenContract: this.config.profile.tokenContract,
      recipient: request.recipient,
      amountAtomic: amountOf(request),
    });

    switch (verdict.result) {
      case 'CONFIRMED': {
        // transferLogIndex originates in provider data, so it is validated
        // here rather than trusted. parseSettlementResult would reject a bad
        // value downstream, but that surfaces as a thrown contract error
        // inside the worker; failing closed to POSSIBLY_SUBMITTED keeps the
        // intent reconcilable instead.
        if (
          !Number.isSafeInteger(verdict.transferLogIndex) ||
          verdict.transferLogIndex < 0
        ) {
          return {
            kind: 'POSSIBLY_SUBMITTED',
            reason: 'Receipt matched but its Transfer log index was not a valid non-negative integer',
          };
        }
        return {
          kind: 'CONFIRMED',
          provider_reference_id: asProviderReferenceId(sent.providerReferenceId),
          transaction_hash: asTransactionHash(receipt.transactionHash),
          block_number: asBlockNumber(receipt.blockNumber.toString(10)),
          transfer_log_index: verdict.transferLogIndex,
        };
      }

      case 'FINAL_REVERT':
        // A revert moved no value, so a fresh attempt is safe.
        return { kind: 'DEFINITELY_NOT_SUBMITTED', reason: verdict.detail };

      case 'NOT_CONFIRMED':
        // A receipt exists but does not prove our settlement. Failing to prove
        // it happened is not proof that it did not.
        return { kind: 'POSSIBLY_SUBMITTED', reason: verdict.detail };

      default:
        return { kind: 'POSSIBLY_SUBMITTED', reason: 'Unhandled receipt verdict' };
    }
  }
}
