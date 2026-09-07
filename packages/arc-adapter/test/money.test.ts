import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  assertNonZero,
  assertWithinCap,
  formatForDisplay,
  fromBigInt,
  parseAmountAtomic,
  toBigInt,
} from '../src/money.js';

describe('parseAmountAtomic', () => {
  it('accepts canonical unsigned integer strings', () => {
    expect(parseAmountAtomic('0')).toBe('0');
    expect(parseAmountAtomic('1250000')).toBe('1250000');
  });

  it.each([
    ['a JavaScript number', 1250000],
    ['a float', 1.25],
    ['null', null],
    ['undefined', undefined],
    ['a bigint', 1250000n],
  ])('rejects %s', (_label, input) => {
    expect(() => parseAmountAtomic(input)).toThrow(MoneyError);
  });

  it.each([
    ['a decimal point', '1.25'],
    ['an exponent', '1e6'],
    ['leading whitespace', ' 1250000'],
    ['trailing whitespace', '1250000 '],
    ['a leading zero', '0125'],
    ['hex', '0x1f'],
    ['an empty string', ''],
    ['a plus sign', '+1250000'],
  ])('rejects %s rather than normalizing it', (_label, input) => {
    // Normalizing these would let two distinct strings describe one amount,
    // which would break the payload fingerprint the duplicate guard relies on.
    expect(() => parseAmountAtomic(input)).toThrow(MoneyError);
  });

  it('rejects negative amounts', () => {
    expect(() => parseAmountAtomic('-1')).toThrow(
      expect.objectContaining({ code: 'AMOUNT_NEGATIVE_OR_SIGNED' }),
    );
  });

  it('rejects absurdly long inputs', () => {
    expect(() => parseAmountAtomic('9'.repeat(31))).toThrow(
      expect.objectContaining({ code: 'AMOUNT_TOO_LONG' }),
    );
  });
});

describe('bigint round trip', () => {
  it('preserves values far beyond IEEE-754 integer safety', () => {
    // 2^53 + 1 is not representable as a JS number. A float-based
    // implementation would silently corrupt this amount.
    const beyondSafe = '9007199254740993';
    expect(Number.isSafeInteger(Number(beyondSafe))).toBe(false);
    expect(fromBigInt(toBigInt(parseAmountAtomic(beyondSafe)))).toBe(beyondSafe);
  });

  it('refuses to emit a negative bigint', () => {
    expect(() => fromBigInt(-1n)).toThrow(MoneyError);
  });
});

describe('settlement guards', () => {
  it('rejects a zero settlement amount', () => {
    expect(() => assertNonZero(parseAmountAtomic('0'))).toThrow(
      expect.objectContaining({ code: 'AMOUNT_ZERO' }),
    );
  });

  it('permits an amount exactly at the cap', () => {
    const cap = parseAmountAtomic('1000000');
    expect(assertWithinCap(parseAmountAtomic('1000000'), cap)).toBe('1000000');
  });

  it('rejects an amount one atomic unit above the cap', () => {
    const cap = parseAmountAtomic('1000000');
    expect(() => assertWithinCap(parseAmountAtomic('1000001'), cap)).toThrow(
      expect.objectContaining({ code: 'AMOUNT_ABOVE_CAP' }),
    );
  });

  it('compares large amounts exactly', () => {
    const cap = parseAmountAtomic('9007199254740993');
    // Differs from the cap by one unit, below float resolution at this scale.
    expect(() => assertWithinCap(parseAmountAtomic('9007199254740994'), cap)).toThrow(
      MoneyError,
    );
  });
});

describe('formatForDisplay', () => {
  it('formats six-decimal USDC without arithmetic', () => {
    expect(formatForDisplay(parseAmountAtomic('1250000'), 6)).toBe('1.250000');
    expect(formatForDisplay(parseAmountAtomic('1'), 6)).toBe('0.000001');
    expect(formatForDisplay(parseAmountAtomic('0'), 6)).toBe('0.000000');
  });

  it('formats amounts beyond float precision exactly', () => {
    expect(formatForDisplay(parseAmountAtomic('9007199254740993'), 6)).toBe(
      '9007199254.740993',
    );
  });

  it('rejects nonsensical decimals', () => {
    expect(() => formatForDisplay(parseAmountAtomic('1'), -1)).toThrow(MoneyError);
    expect(() => formatForDisplay(parseAmountAtomic('1'), 1.5)).toThrow(MoneyError);
  });
});
