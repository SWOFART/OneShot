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

import { decodeAbiParameters, decodeFunctionData, parseAbi, parseAbiParameters } from 'viem';

/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** keccak256("BatchProcessed(bytes32,address,address)"). */
export const CIRCLE_BATCH_PROCESSED_TOPIC =
  '0x8e9878875610f80a970e0cea1889a4c7de3012c1a52ae169d9d5d3ab2c08b670';

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

export interface ExpectedCircleGatewaySettlement {
  readonly chainId: number;
  readonly gatewayWalletAddress: string;
  readonly tokenContract: string;
  readonly payer: string;
  readonly recipient: string;
  readonly amountAtomic: bigint;
  readonly gatewayDomain: number;
}

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

/** Verify the balance deltas and BatchProcessed event produced by Circle Gateway batching. */
export function verifyCircleGatewayBatchReceipt(
  receipt: TransactionReceipt,
  transactionInput: string,
  expected: ExpectedCircleGatewaySettlement,
): ReceiptVerdict {
  if (receipt.chainId !== expected.chainId) {
    return { result: 'NOT_CONFIRMED', detail: 'Circle Gateway receipt is from the wrong chain.' };
  }
  if (!sameAddress(receipt.to, expected.gatewayWalletAddress)) {
    return { result: 'NOT_CONFIRMED', detail: 'Receipt did not call the Circle Gateway wallet.' };
  }
  if (receipt.status === 0) {
    return { result: 'FINAL_REVERT', detail: 'Circle Gateway batch transaction reverted.' };
  }
  if (sameAddress(expected.payer, expected.recipient)) {
    return { result: 'NOT_CONFIRMED', detail: 'Circle Gateway payer and recipient must differ.' };
  }

  try {
    const decoded = decodeFunctionData({
      abi: parseAbi(['function submitBatch(bytes calldataBytes, bytes signature)']),
      data: transactionInput as `0x${string}`,
    });
    if (decoded.functionName !== 'submitBatch') throw new Error('wrong function');
    const [calldataBytes] = decoded.args;
    const [deltas, batchId, domain, tokenAddress, gatewayWalletAddress] = decodeAbiParameters(
      parseAbiParameters(
        '(address depositor,int256 value)[] deltas, bytes32 batchId, uint32 domain, address tokenAddress, address gatewayWalletAddress',
      ),
      calldataBytes,
    );
    if (
      domain !== expected.gatewayDomain ||
      !sameAddress(tokenAddress, expected.tokenContract) ||
      !sameAddress(gatewayWalletAddress, expected.gatewayWalletAddress)
    ) {
      return { result: 'NOT_CONFIRMED', detail: 'Circle Gateway batch identity does not match.' };
    }
    const payerDeltas = deltas.filter(
      (delta) =>
        sameAddress(delta.depositor, expected.payer) && delta.value === -expected.amountAtomic,
    );
    const recipientDeltas = deltas.filter(
      (delta) =>
        sameAddress(delta.depositor, expected.recipient) && delta.value === expected.amountAtomic,
    );
    if (payerDeltas.length !== 1 || recipientDeltas.length !== 1) {
      return {
        result: 'NOT_CONFIRMED',
        detail: 'Circle Gateway batch does not contain exactly the expected payer debit and recipient credit.',
      };
    }
    const events = receipt.logs.filter(
      (log) =>
        sameAddress(log.address, expected.gatewayWalletAddress) &&
        log.topics[0]?.toLowerCase() === CIRCLE_BATCH_PROCESSED_TOPIC &&
        log.topics[1]?.toLowerCase() === batchId.toLowerCase() &&
        log.topics[3] !== undefined &&
        sameAddress(addressFromTopic(log.topics[3]), expected.tokenContract),
    );
    if (events.length !== 1) {
      return {
        result: 'NOT_CONFIRMED',
        detail: `Circle Gateway receipt contains ${events.length} matching BatchProcessed events; expected exactly one.`,
      };
    }
    return { result: 'CONFIRMED', transferLogIndex: events[0]!.logIndex };
  } catch {
    return { result: 'NOT_CONFIRMED', detail: 'Circle Gateway submitBatch calldata is malformed.' };
  }
}
