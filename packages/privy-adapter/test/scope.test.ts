import { describe, expect, it } from 'vitest';
import {
  buildSettlementTransaction,
  encodeTransfer,
  evaluateScope,
  type ExpectedScope,
  type ProposedTransaction,
} from '../src/scope.js';

const USDC = '0x3600000000000000000000000000000000000000' as const;
const RECIPIENT = '0x1111111111111111111111111111111111111111' as const;
const ATTACKER = '0x2222222222222222222222222222222222222222' as const;

const EXPECTED: ExpectedScope = {
  chainId: 5042002,
  tokenContract: USDC,
  recipient: RECIPIENT,
  amountAtomic: 1_250_000n,
};

const AUTHORIZED = buildSettlementTransaction(EXPECTED);

function tamper(overrides: Partial<ProposedTransaction>): ProposedTransaction {
  return { ...AUTHORIZED, ...overrides };
}

describe('the authorized scope', () => {
  it('authorizes the exact expected transaction', () => {
    expect(evaluateScope(AUTHORIZED, EXPECTED)).toEqual({ result: 'AUTHORIZED' });
  });

  it('builds a transaction with zero native value', () => {
    expect(AUTHORIZED.value).toBe(0n);
  });

  it('targets the USDC contract, not the recipient', () => {
    // A common mistake: sending to the recipient address directly, which for an
    // ERC-20 transfer would call nothing and lose the intent.
    expect(AUTHORIZED.to).toBe(USDC);
  });
});

// B01.3 requires a deny fixture for every wrong dimension before a path may be
// recorded as SUPPORTED. One test per dimension, each failing for its own
// reason.
describe('deny fixtures, one per constrained dimension', () => {
  it('denies a wrong chain', () => {
    expect(evaluateScope(tamper({ chainId: 1 }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'WRONG_CHAIN',
    });
  });

  it('denies a wrong destination contract', () => {
    expect(evaluateScope(tamper({ to: ATTACKER }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'WRONG_DESTINATION_CONTRACT',
    });
  });

  it('denies non-zero native value', () => {
    expect(evaluateScope(tamper({ value: 1n }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'NON_ZERO_NATIVE_VALUE',
    });
  });

  it('denies a wrong method', () => {
    // approve(address,uint256) rather than transfer.
    const approve = ('0x095ea7b3' + AUTHORIZED.data.slice(10)) as `0x${string}`;
    expect(evaluateScope(tamper({ data: approve }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'WRONG_METHOD',
    });
  });

  it('denies a wrong recipient', () => {
    const redirected = encodeTransfer({ ...EXPECTED, recipient: ATTACKER });
    expect(evaluateScope(tamper({ data: redirected }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'WRONG_RECIPIENT',
    });
  });

  it('denies a wrong amount', () => {
    const inflated = encodeTransfer({ ...EXPECTED, amountAtomic: 1_250_001n });
    expect(evaluateScope(tamper({ data: inflated }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'WRONG_AMOUNT',
    });
  });

  it('denies calldata with appended bytes', () => {
    // Appending past a valid transfer is how payload gets smuggled through a
    // check that only inspects the selector prefix.
    const padded = (AUTHORIZED.data + 'deadbeef') as `0x${string}`;
    expect(evaluateScope(tamper({ data: padded }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'MALFORMED_CALLDATA',
    });
  });

  it('denies truncated calldata', () => {
    const truncated = AUTHORIZED.data.slice(0, 40) as `0x${string}`;
    expect(evaluateScope(tamper({ data: truncated }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'MALFORMED_CALLDATA',
    });
  });

  it('denies empty calldata', () => {
    expect(evaluateScope(tamper({ data: '0x' }), EXPECTED)).toMatchObject({
      result: 'DENIED',
      reason: 'WRONG_METHOD',
    });
  });
});

describe('amount edge cases', () => {
  it('denies a zero amount even though it is well-formed', () => {
    const zero = encodeTransfer({ ...EXPECTED, amountAtomic: 0n });
    expect(evaluateScope(tamper({ data: zero }), EXPECTED)).toMatchObject({
      reason: 'WRONG_AMOUNT',
    });
  });

  it('denies an amount differing by one atomic unit', () => {
    const off = encodeTransfer({ ...EXPECTED, amountAtomic: 1_249_999n });
    expect(evaluateScope(tamper({ data: off }), EXPECTED)).toMatchObject({
      reason: 'WRONG_AMOUNT',
    });
  });

  it('authorizes a very large amount that is exactly expected', () => {
    // Beyond IEEE-754 integer safety. bigint comparison must still be exact.
    const large = { ...EXPECTED, amountAtomic: 9_007_199_254_740_993n };
    expect(evaluateScope(buildSettlementTransaction(large), large)).toEqual({
      result: 'AUTHORIZED',
    });
  });
});

describe('address casing', () => {
  it('authorizes regardless of the casing the destination arrives in', () => {
    const upper = ('0x' + USDC.slice(2).toUpperCase()) as `0x${string}`;
    expect(evaluateScope(tamper({ to: upper }), EXPECTED)).toEqual({
      result: 'AUTHORIZED',
    });
  });

  it('authorizes a checksummed recipient encoding', () => {
    const checksummed: ExpectedScope = {
      ...EXPECTED,
      recipient: '0x1111111111111111111111111111111111111111',
    };
    expect(evaluateScope(buildSettlementTransaction(checksummed), EXPECTED)).toEqual({
      result: 'AUTHORIZED',
    });
  });
});
