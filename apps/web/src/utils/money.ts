/**
 * Strict non-floating-point monetary formatting and parsing for 6-decimal USDC.
 *
 * Invariant: Never use JavaScript floating-point numbers (no Number(), parseFloat(), Math.round(), or * 1e6).
 * All conversions use string manipulation and BigInt.
 */

export const USDC_DECIMALS = 6;
export const USDC_SCALE = 1_000_000n;

/**
 * Converts human decimal USDC string to 6-decimal atomic units string.
 * Examples:
 *   "1.5" -> "1500000"
 *   "0.000001" -> "1"
 *   "100" -> "100000000"
 */
export function usdcToAtomicUnits(humanUsdc: string): string {
  const trimmed = humanUsdc.trim();
  if (!trimmed) {
    throw new Error('Amount cannot be empty');
  }

  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid USDC amount format: "${humanUsdc}"`);
  }

  const parts = trimmed.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = parts[1] ?? '';

  if (fracPart.length > USDC_DECIMALS) {
    throw new Error(`USDC precision exceeds ${USDC_DECIMALS} decimal places: "${humanUsdc}"`);
  }

  const paddedFrac = fracPart.padEnd(USDC_DECIMALS, '0');
  const atomicBigInt = BigInt(intPart) * USDC_SCALE + BigInt(paddedFrac);

  return atomicBigInt.toString();
}

/**
 * Converts 6-decimal atomic units string to human decimal USDC string.
 * Examples:
 *   "1500000" -> "1.500000"
 *   "1" -> "0.000001"
 *   "100000000" -> "100.000000"
 */
export function atomicUnitsToUsdc(atomicStr: string): string {
  const trimmed = atomicStr.trim();
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    throw new Error(`Invalid atomic units format: "${atomicStr}"`);
  }

  const atomicVal = BigInt(trimmed);
  const intVal = atomicVal / USDC_SCALE;
  const fracVal = atomicVal % USDC_SCALE;

  const fracPadded = fracVal.toString().padStart(USDC_DECIMALS, '0');
  return `${intVal}.${fracPadded}`;
}

/**
 * Formats atomic units for display.
 */
export function formatUsdcDisplay(atomicStr: string, trimTrailingZeros = false): string {
  const full = atomicUnitsToUsdc(atomicStr);
  if (!trimTrailingZeros) return full;
  const parts = full.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = parts[1] ?? '00';
  const trimmedFrac = fracPart.replace(/0+$/, '');
  if (!trimmedFrac) return `${intPart}.00`;
  if (trimmedFrac.length === 1) return `${intPart}.${trimmedFrac}0`;
  return `${intPart}.${trimmedFrac}`;
}
