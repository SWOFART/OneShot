/**
 * Arc receipt verification (B02.4).
 *
 * Confirms a settlement only from an exact final receipt plus exactly the
 * expected ERC-20 Transfer log.
 *
 * The rule that matters: `status: 1` alone is NOT confirmation. A transaction
 * can succeed while transferring nothing we asked for, or while emitting a
 * Transfer to somewhere else. Confirmation requires the receipt to prove the
 * specific movement of the specific amount to the specific recipient.
 *
 * `milestones/CONTRACTS.md`: "Arc receipt plus expected ERC-20 Transfer
 * evidence establishes committed settlement."
 */

/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface ReceiptLog {
  readonly address: string;
  /** topic0 is the event signature; topic1/topic2 are indexed from/to. */
  readonly topics: readonly string[];
  /** ABI-encoded non-indexed data. For Transfer this is the amount word. */
  readonly data: string;
  readonly logIndex: number;
}

export interface TransactionReceipt {
  readonly transactionHash: string;
  readonly chainId: number;
  /** The wallet that sent the transaction. */
  readonly from: string;
  /** The contract called. For a direct transfer this is the token. */
  readonly to: string;
  /** 1 success, 0 revert. */
  readonly status: 0 | 1;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly logs: readonly ReceiptLog[];
}

/** Exactly what the receipt must prove. */
export interface ExpectedSettlement {
  readonly chainId: number;
  readonly walletAddress: string;
  readonly tokenContract: string;
  readonly recipient: string;
  readonly amountAtomic: bigint;
}

export type ReceiptVerdict =
  /** Final receipt and exactly the expected Transfer. Terminal success. */
  | { readonly result: 'CONFIRMED'; readonly transferLogIndex: number }
  /** Final revert. Terminal failure; no value moved. */
  | { readonly result: 'FINAL_REVERT'; readonly detail: string }
  /**
   * The receipt exists but does not prove the expected settlement. Never
   * treated as failure: something happened on-chain and it must be reconciled.
   */
  | { readonly result: 'NOT_CONFIRMED'; readonly detail: string };

function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Decode a 32-byte address topic into an address. */
function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/** Decode a 32-byte word as an unsigned integer. */
function amountFromData(data: string): bigint | undefined {
  const normalized = data.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) return undefined;
  return BigInt(normalized);
}

/**
 * Verify a receipt against the expected settlement.
 *
 * Every identity is checked before the logs are inspected, so a receipt for a
 * different chain, wallet, or transaction can never be matched by log content
 * alone.
 */
export function verifyReceipt(
  receipt: TransactionReceipt,
  expected: ExpectedSettlement,
): ReceiptVerdict {
  if (receipt.chainId !== expected.chainId) {
    return {
      result: 'NOT_CONFIRMED',
      detail: `Receipt is from chain ${receipt.chainId}, expected ${expected.chainId}.`,
    };
  }

  if (!sameAddress(receipt.from, expected.walletAddress)) {
    return {
      result: 'NOT_CONFIRMED',
      detail: 'Receipt was not sent by the configured execution wallet.',
    };
  }

  if (receipt.status === 0) {
    // A revert moved no value. This is the one case that is safely terminal
    // and permits the policy to schedule a fresh attempt.
    return { result: 'FINAL_REVERT', detail: 'Transaction reverted; no value moved.' };
  }

  if (!sameAddress(receipt.to, expected.tokenContract)) {
    return {
      result: 'NOT_CONFIRMED',
      detail: 'Receipt did not call the configured USDC contract.',
    };
  }

  // Only Transfer logs emitted by the configured token count. A Transfer from
  // some other contract proves nothing about our USDC balance.
  const candidates = receipt.logs.filter(
    (log) =>
      sameAddress(log.address, expected.tokenContract) &&
      log.topics[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC,
  );

  const matches = candidates.filter((log) => {
    const from = log.topics[1];
    const to = log.topics[2];
    if (from === undefined || to === undefined) return false;
    if (!sameAddress(addressFromTopic(from), expected.walletAddress)) return false;
    if (!sameAddress(addressFromTopic(to), expected.recipient)) return false;
    return amountFromData(log.data) === expected.amountAtomic;
  });

  if (matches.length === 0) {
    // Success status with no matching Transfer is explicitly NOT confirmation.
    return {
      result: 'NOT_CONFIRMED',
      detail:
        'Receipt status is success but it contains no Transfer matching the ' +
        'expected sender, recipient, and amount.',
    };
  }

  if (matches.length > 1) {
    // Two identical transfers in one transaction means more value moved than
    // the obligation authorized. Refusing to confirm forces reconciliation.
    return {
      result: 'NOT_CONFIRMED',
      detail: `Receipt contains ${matches.length} matching Transfer logs; expected exactly one.`,
    };
  }

  const match = matches[0];
  if (match === undefined) {
    return { result: 'NOT_CONFIRMED', detail: 'Matching Transfer log could not be read.' };
  }

  return { result: 'CONFIRMED', transferLogIndex: match.logIndex };
}
