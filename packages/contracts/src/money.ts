import { ContractValidationError } from './ids.js';

export type AtomicAmount = string & { readonly __brand: 'AtomicAmount' };

const MAX_ATOMIC_DIGITS = 78;

export function asAtomicAmount(value: unknown): AtomicAmount {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ATOMIC_DIGITS ||
    !/^(0|[1-9][0-9]*)$/u.test(value)
  ) {
    throw new ContractValidationError(
      `amount_atomic must be a canonical unsigned integer string of at most ${MAX_ATOMIC_DIGITS} digits`,
    );
  }
  return value as AtomicAmount;
}

export function atomicAmountToBigInt(value: AtomicAmount): bigint {
  return BigInt(value);
}

export function atomicAmountFromBigInt(value: bigint): AtomicAmount {
  if (value < 0n) {
    throw new ContractValidationError('amount_atomic cannot be negative');
  }
  return asAtomicAmount(value.toString(10));
}
