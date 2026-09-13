/**
 * Expected settlement scope and its deny reasons (B01.3).
 *
 * This mirrors, in OneShot code, the constraints the Privy policy enforces
 * remotely. Two independent checks of the same shape is deliberate: a policy
 * lives in Privy's configuration and can drift, and
 * `.agent/SECURITY_INVARIANTS.md` requires validating asset, network,
 * recipient, amount, and policy scope before signing or submitting.
 *
 * The local check never grants permission. It can only refuse.
 */

import { encodeFunctionData, getAddress, parseAbi } from 'viem';

/** Minimal ERC-20 surface. Settlement uses `transfer` only. */
export const ERC20_TRANSFER_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/** Exactly the scope a settlement transaction is permitted to occupy. */
export interface ExpectedScope {
  readonly chainId: number;
  /** The USDC contract. The only address settlement may call. */
  readonly tokenContract: `0x${string}`;
  readonly recipient: `0x${string}`;
  /** Atomic units, ERC-20 six-decimal precision. */
  readonly amountAtomic: bigint;
}

/** A transaction as it would be submitted, before authorization. */
export interface ProposedTransaction {
  readonly chainId: number;
  readonly to: `0x${string}`;
  /** Native value. Settlement must never attach native funds. */
  readonly value: bigint;
  readonly data: `0x${string}`;
}

export type DenyReason =
  | 'WRONG_CHAIN'
  | 'WRONG_DESTINATION_CONTRACT'
  | 'NON_ZERO_NATIVE_VALUE'
  | 'WRONG_METHOD'
  | 'WRONG_RECIPIENT'
  | 'WRONG_AMOUNT'
  | 'MALFORMED_CALLDATA';

export type ScopeDecision =
  | { readonly result: 'AUTHORIZED' }
  | { readonly result: 'DENIED'; readonly reason: DenyReason; readonly detail: string };

/** `transfer(address,uint256)` selector. Any other selector is denied. */
const TRANSFER_SELECTOR = '0xa9059cbb';

function normalize(address: string): string {
  return address.trim().toLowerCase();
}

/** Build the exact calldata the expected scope implies. */
export function encodeTransfer(scope: ExpectedScope): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [getAddress(scope.recipient), scope.amountAtomic],
  });
}

/** Build the full transaction for an expected scope. Native value is always zero. */
export function buildSettlementTransaction(scope: ExpectedScope): ProposedTransaction {
  return {
    chainId: scope.chainId,
    to: scope.tokenContract,
    value: 0n,
    data: encodeTransfer(scope),
  };
}

/**
 * Decide whether a proposed transaction sits exactly inside the expected scope.
 *
 * Every dimension is checked independently so a denial names which one failed,
 * which is what makes the deny fixtures in the test suite meaningful. Checks
 * run cheapest-and-most-dangerous first: a wrong chain or a wrong destination
 * contract is checked before calldata is decoded at all.
 */
export function evaluateScope(
  proposed: ProposedTransaction,
  expected: ExpectedScope,
): ScopeDecision {
  if (proposed.chainId !== expected.chainId) {
    return {
      result: 'DENIED',
      reason: 'WRONG_CHAIN',
      detail: `Proposed chain ${proposed.chainId}, expected ${expected.chainId}.`,
    };
  }

  if (normalize(proposed.to) !== normalize(expected.tokenContract)) {
    return {
      result: 'DENIED',
      reason: 'WRONG_DESTINATION_CONTRACT',
      detail: 'Settlement may only call the configured USDC contract.',
    };
  }

  if (proposed.value !== 0n) {
    // Settlement moves ERC-20 USDC. Native value would be a second, unbounded
    // transfer of the gas asset riding along with the payment.
    return {
      result: 'DENIED',
      reason: 'NON_ZERO_NATIVE_VALUE',
      detail: 'Settlement must attach zero native value.',
    };
  }

  const data = proposed.data.toLowerCase();

  if (!data.startsWith(TRANSFER_SELECTOR)) {
    return {
      result: 'DENIED',
      reason: 'WRONG_METHOD',
      detail: 'Settlement calldata must invoke transfer(address,uint256).',
    };
  }

  // selector (4 bytes) + two 32-byte words, hex-encoded with a 0x prefix.
  const EXPECTED_LENGTH = 2 + 8 + 64 + 64;
  if (data.length !== EXPECTED_LENGTH) {
    // Rejecting trailing bytes matters: appended data is a classic way to
    // smuggle payload past a naive prefix check.
    return {
      result: 'DENIED',
      reason: 'MALFORMED_CALLDATA',
      detail: 'Settlement calldata must be exactly a selector and two words.',
    };
  }

  const expectedData = encodeTransfer(expected).toLowerCase();
  if (data === expectedData) {
    return { result: 'AUTHORIZED' };
  }

  // Identify which argument diverged, so the denial is actionable.
  const proposedRecipientWord = data.slice(10, 74);
  const expectedRecipientWord = expectedData.slice(10, 74);
  if (proposedRecipientWord !== expectedRecipientWord) {
    return {
      result: 'DENIED',
      reason: 'WRONG_RECIPIENT',
      detail: 'Calldata recipient does not match the authorized recipient.',
    };
  }

  return {
    result: 'DENIED',
    reason: 'WRONG_AMOUNT',
    detail: 'Calldata amount does not match the authorized amount.',
  };
}
