import { describe, expect, it } from 'vitest';

import { atomicUnitsToUsdc, formatUsdcDisplay, usdcToAtomicUnits } from '../src/utils/money.js';

describe('USDC formatting', () => {
  it.each([
    ['0.000001', '1'],
    ['1', '1000000'],
    ['1.25', '1250000'],
    ['999999999999999999.999999', '999999999999999999999999'],
  ])('round-trips %s without floating point', (human, atomic) => {
    expect(usdcToAtomicUnits(human)).toBe(atomic);
    expect(usdcToAtomicUnits(atomicUnitsToUsdc(atomic))).toBe(atomic);
  });

  it.each(['', '-1', '1e6', '1.0000001', '01'])('rejects invalid amount %s', (amount) => {
    expect(() => usdcToAtomicUnits(amount)).toThrow();
  });

  it('formats display values without losing atomic precision', () => {
    expect(formatUsdcDisplay('1500000', true)).toBe('1.50');
    expect(formatUsdcDisplay('1000001', true)).toBe('1.000001');
  });
});
