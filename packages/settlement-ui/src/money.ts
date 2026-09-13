/**
 * Exact USDC rendering for the settlement slice.
 *
 * Money crosses the API seam as a canonical base-10 integer string of atomic
 * units. It is formatted here with `bigint` string arithmetic only: no
 * `Number`, `parseFloat`, or scaling by `1e6`, because a floating-point step
 * would silently round a settled amount.
 */

export const USDC_DECIMALS = 6;

const USDC_SCALE = 1_000_000n;
const ATOMIC_PATTERN = /^(0|[1-9][0-9]*)$/u;

/** True when `value` is the canonical unsigned integer string the contract requires. */
export function isAtomicAmount(value: string): boolean {
  return ATOMIC_PATTERN.test(value);
}

/**
 * Formats atomic units as an exact USDC decimal string with all six places.
 * Returns `null` for anything that is not a canonical atomic amount, so a
 * malformed field renders as unavailable instead of as a plausible number.
 */
export function formatAtomicUsdc(value: string): string | null {
  if (!isAtomicAmount(value)) {
    return null;
  }
  const atomic = BigInt(value);
  const whole = atomic / USDC_SCALE;
  const fraction = atomic % USDC_SCALE;
  return `${whole.toString()}.${fraction.toString().padStart(USDC_DECIMALS, '0')}`;
}

/** Formats atomic units as an exact amount with its asset symbol, or `null`. */
export function formatAtomicUsdcWithAsset(value: string, asset: string): string | null {
  const formatted = formatAtomicUsdc(value);
  return formatted === null ? null : `${formatted} ${asset}`;
}

/**
 * Compares two atomic amounts. Returns `null` when either side is malformed so
 * callers fail closed rather than treating an unparsable cap as satisfied.
 */
export function compareAtomic(left: string, right: string): -1 | 0 | 1 | null {
  if (!isAtomicAmount(left) || !isAtomicAmount(right)) {
    return null;
  }
  const a = BigInt(left);
  const b = BigInt(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
