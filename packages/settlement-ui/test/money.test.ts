import { describe, expect, it } from 'vitest';

import {
  compareAtomic,
  formatAtomicUsdc,
  formatAtomicUsdcWithAsset,
  isAtomicAmount,
} from '../src/money.js';

describe('exact USDC formatting', () => {
  it.each([
    ['0', '0.000000'],
    ['1', '0.000001'],
    ['999999', '0.999999'],
    ['1000000', '1.000000'],
    ['1250000', '1.250000'],
    ['50000000', '50.000000'],
    ['123456789012345678901234567890', '123456789012345678901234.567890'],
  ])('formats %s atomic units as %s', (atomic, expected) => {
    expect(formatAtomicUsdc(atomic)).toBe(expected);
  });

  it('keeps precision that a double would lose', () => {
    const atomic = '9007199254740993';
    expect(formatAtomicUsdc(atomic)).toBe('9007199254.740993');
    expect(formatAtomicUsdc(atomic)).not.toBe(`${Number(atomic) / 1_000_000}`);
  });

  it.each(['', ' ', '-1', '01', '1.5', '1e6', '1_000', 'NaN', '0x10', '1250000 '])(
    'refuses the malformed amount %j',
    (value) => {
      expect(isAtomicAmount(value)).toBe(false);
      expect(formatAtomicUsdc(value)).toBeNull();
    },
  );

  it('appends the asset symbol only for a well-formed amount', () => {
    expect(formatAtomicUsdcWithAsset('1250000', 'USDC')).toBe('1.250000 USDC');
    expect(formatAtomicUsdcWithAsset('1.25', 'USDC')).toBeNull();
  });
});

describe('atomic comparison', () => {
  it('compares beyond the safe-integer range', () => {
    expect(compareAtomic('9007199254740993', '9007199254740992')).toBe(1);
    expect(compareAtomic('9007199254740992', '9007199254740993')).toBe(-1);
    expect(compareAtomic('1250000', '1250000')).toBe(0);
  });

  it('fails closed on a malformed operand', () => {
    expect(compareAtomic('1.25', '1250000')).toBeNull();
    expect(compareAtomic('1250000', 'unbounded')).toBeNull();
  });
});
