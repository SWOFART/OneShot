/**
 * EvidencePort lookup (B04.2, B04.3).
 *
 * Answers "what happened to this specific request?" from persisted identity,
 * without ever answering "so you may pay again".
 *
 * `NOT_FOUND` is the dangerous result and gets the strictest treatment. An
 * absent transaction can mean it was never broadcast, or that it is in a
 * mempool this node cannot see, or that the node is behind, or that it was
 * replaced. `.agent/SECURITY_INVARIANTS.md` is explicit: never infer
 * non-payment from an empty or delayed external result. So `NOT_FOUND` is an
 * observation, never a permission, and this module has no code path that turns
 * one into the other.
 */

import { verifyReceipt, type ExpectedSettlement, type TransactionReceipt } from './receipt.js';

export type EvidenceResult =
  /** Final receipt and exactly the expected Transfer. */
  | 'FINAL_SUCCESS'
  /** Final receipt proving the transaction reverted. */
  | 'FINAL_REVERT'
  /** Known to exist, not yet final. */
  | 'PENDING'
  /** No record found. NOT proof that nothing happened. */
  | 'NOT_FOUND'
  /** The question could not be asked. */
  | 'UNAVAILABLE';

export interface EvidenceObservation {
  readonly result: EvidenceResult;
  /** Sanitized detail suitable for an operator timeline. */
  readonly detail: string;
  /**
   * Whether this observation binds to the exact expected request.
   *
   * Unbound evidence is real but describes something else, and must never
   * resolve the intent it was fetched for.
   */
  readonly boundToRequest: boolean;
}

/** What the caller persisted before submitting, used to look evidence up. */
export interface PersistedIdentity {
  readonly transactionHash?: string | undefined;
  readonly walletAddress: string;
  readonly chainId: number;
  readonly tokenContract: string;
  readonly recipient: string;
  readonly amountAtomic: bigint;
}

// No `nonce` field: binding is done on the transaction hash, and a declared
// nonce nobody reads would imply a "wrong nonce" defence that does not exist.

/** A receipt lookup that may fail or find nothing. */
export interface ReceiptSource {
  getReceipt(transactionHash: string): Promise<TransactionReceipt | null>;
}

function expectedFrom(identity: PersistedIdentity): ExpectedSettlement {
  return {
    chainId: identity.chainId,
    walletAddress: identity.walletAddress,
    tokenContract: identity.tokenContract,
    recipient: identity.recipient,
    amountAtomic: identity.amountAtomic,
  };
}

/**
 * Look up evidence for a persisted identity.
 *
 * Without a transaction hash there is nothing to bind to, so the answer is
 * `NOT_FOUND` and unbound. Hashless discovery is Coder C's Subgraph MCP path
 * and is deliberately absent here: this adapter must not develop a second,
 * weaker way to decide a payment happened.
 */
export async function lookupEvidence(
  identity: PersistedIdentity,
  source: ReceiptSource,
): Promise<EvidenceObservation> {
  if (identity.transactionHash === undefined || identity.transactionHash === '') {
    return {
      result: 'NOT_FOUND',
      detail:
        'No transaction hash was persisted for this attempt. Absence of a hash ' +
        'is not evidence that no transaction exists.',
      boundToRequest: false,
    };
  }

  let receipt: TransactionReceipt | null;
  try {
    receipt = await source.getReceipt(identity.transactionHash);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: 'UNAVAILABLE',
      detail: `Evidence lookup failed: ${message.slice(0, 200)}`,
      boundToRequest: false,
    };
  }

  if (receipt === null) {
    // The single most misread result in the system.
    return {
      result: 'NOT_FOUND',
      detail:
        'No receipt found for the persisted hash. The transaction may be ' +
        'pending, replaced, or invisible to this node. This is not proof that ' +
        'no payment occurred and never permits resubmission.',
      boundToRequest: false,
    };
  }

  // Bind before interpreting. A receipt for a different chain or wallet is
  // real evidence about something that is not this request.
  if (receipt.chainId !== identity.chainId) {
    return {
      result: 'NOT_FOUND',
      detail: `Receipt is from chain ${receipt.chainId}, not ${identity.chainId}; it does not describe this request.`,
      boundToRequest: false,
    };
  }

  if (receipt.transactionHash.toLowerCase() !== identity.transactionHash.toLowerCase()) {
    return {
      result: 'NOT_FOUND',
      detail: 'The returned receipt is for a different transaction hash.',
      boundToRequest: false,
    };
  }

  const verdict = verifyReceipt(receipt, expectedFrom(identity));

  switch (verdict.result) {
    case 'CONFIRMED':
      return {
        result: 'FINAL_SUCCESS',
        detail: `Verified settlement in block ${receipt.blockNumber.toString()}.`,
        boundToRequest: true,
      };

    case 'FINAL_REVERT':
      return {
        result: 'FINAL_REVERT',
        detail: 'Transaction reverted on chain; no value moved.',
        boundToRequest: true,
      };

    case 'NOT_CONFIRMED':
      // A receipt exists for our hash but does not prove our settlement.
      // Contradictory, and ambiguity must be preserved rather than resolved.
      return {
        result: 'PENDING',
        detail: `Receipt found but it does not prove the expected settlement: ${verdict.detail}`,
        boundToRequest: false,
      };

    default: {
      const unreachable: never = verdict;
      return {
        result: 'UNAVAILABLE',
        detail: `Unhandled receipt verdict: ${String(unreachable)}`,
        boundToRequest: false,
      };
    }
  }
}

/**
 * Whether an observation may terminate an intent.
 *
 * Only bound, final evidence qualifies. Everything else leaves the intent
 * where it was, which for an ambiguous attempt means `UNKNOWN`.
 */
export function isTerminalEvidence(observation: EvidenceObservation): boolean {
  if (!observation.boundToRequest) return false;
  return observation.result === 'FINAL_SUCCESS' || observation.result === 'FINAL_REVERT';
}

/**
 * Whether an observation permits creating another settlement.
 *
 * Always false. The function exists so the answer is written down once, in a
 * place a future caller will find, rather than re-derived per call site.
 * Only a `FINAL_REVERT` may lead to a new attempt, and that decision belongs
 * to the reconciliation policy Coder C owns, not to this adapter.
 */
export function permitsResubmission(_observation: EvidenceObservation): false {
  return false;
}
