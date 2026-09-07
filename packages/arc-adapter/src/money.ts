/**
 * Monetary values (B01.2 precision rules).
 *
 * `.agent/SECURITY_INVARIANTS.md`: money is stored, compared, calculated, and
 * serialized as integer atomic units or `bigint`. JavaScript floating point is
 * never used for a monetary value, so this module has no `number` arithmetic
 * and deliberately provides no parser from `number`.
 *
 * The canonical wire form from `milestones/CONTRACTS.md` section 2 is an
 * unsigned base-10 integer string with no sign, decimal point, exponent, or
 * whitespace.
 */

/** A validated canonical atomic-unit amount string. */
export type AmountAtomic = string & { readonly __brand: 'AmountAtomic' };

export class MoneyError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'AMOUNT_NOT_A_STRING'
      | 'AMOUNT_MALFORMED'
      | 'AMOUNT_NEGATIVE_OR_SIGNED'
      | 'AMOUNT_TOO_LONG'
      | 'AMOUNT_ZERO'
      | 'AMOUNT_ABOVE_CAP',
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Upper bound on digits accepted from a boundary.
 *
 * This is a denial-of-service and typo guard, not a business cap. 30 digits is
 * far above any realistic USDC amount while staying well inside `bigint`.
 */
const MAX_ATOMIC_DIGITS = 30;

/** Canonical form: one or more digits, no leading zeros unless the value is "0". */
const CANONICAL_ATOMIC = /^(0|[1-9][0-9]*)$/;

/**
 * Validate an untrusted amount into canonical atomic units.
 *
 * Rejects rather than normalizes. `"01"`, `"1.0"`, `"+1"`, `"1e6"`, and `" 1"`
 * are all errors: silently accepting them would mean two different strings
 * describe the same amount, which breaks the payload fingerprint that the
 * duplicate-settlement guard depends on.
 */
export function parseAmountAtomic(input: unknown): AmountAtomic {
  if (typeof input !== 'string') {
    throw new MoneyError(
      'Amount must be a canonical base-10 integer string, never a JavaScript number.',
      'AMOUNT_NOT_A_STRING',
    );
  }
  if (input.startsWith('-') || input.startsWith('+')) {
    throw new MoneyError('Amount must be unsigned.', 'AMOUNT_NEGATIVE_OR_SIGNED');
  }
  if (input.length > MAX_ATOMIC_DIGITS) {
    throw new MoneyError(
      `Amount exceeds ${MAX_ATOMIC_DIGITS} digits.`,
      'AMOUNT_TOO_LONG',
    );
  }
  if (!CANONICAL_ATOMIC.test(input)) {
    throw new MoneyError(
      'Amount must be digits only, with no decimal point, exponent, whitespace, or leading zero.',
      'AMOUNT_MALFORMED',
    );
  }
  return input as AmountAtomic;
}

/** Convert a validated atomic amount to `bigint` for arithmetic and encoding. */
export function toBigInt(amount: AmountAtomic): bigint {
  return BigInt(amount);
}

/** Convert a `bigint` back to the canonical wire string. */
export function fromBigInt(value: bigint): AmountAtomic {
  if (value < 0n) {
    throw new MoneyError('Amount must be unsigned.', 'AMOUNT_NEGATIVE_OR_SIGNED');
  }
  return value.toString(10) as AmountAtomic;
}

/**
 * Reject a zero settlement amount.
 *
 * Separate from parsing because zero is a legitimate value to read back from
 * storage, but never a legitimate amount to submit.
 */
export function assertNonZero(amount: AmountAtomic): AmountAtomic {
  if (toBigInt(amount) === 0n) {
    throw new MoneyError('Settlement amount must be greater than zero.', 'AMOUNT_ZERO');
  }
  return amount;
}

/**
 * Enforce a configured per-settlement cap.
 *
 * Comparison is `bigint`, so a large amount cannot slip through via float
 * rounding. Exceeding the cap fails closed with no settlement.
 */
export function assertWithinCap(amount: AmountAtomic, capAtomic: AmountAtomic): AmountAtomic {
  if (toBigInt(amount) > toBigInt(capAtomic)) {
    throw new MoneyError(
      'Settlement amount exceeds the configured per-settlement cap.',
      'AMOUNT_ABOVE_CAP',
    );
  }
  return amount;
}

/**
 * Format atomic units for display only.
 *
 * Returns a decimal string built by string slicing, never by dividing. The
 * result is for humans and must not be parsed back into a settlement amount.
 */
export function formatForDisplay(amount: AmountAtomic, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new MoneyError('Token decimals must be an integer in [0, 36].', 'AMOUNT_MALFORMED');
  }
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals);
  return `${whole}.${fraction}`;
}
