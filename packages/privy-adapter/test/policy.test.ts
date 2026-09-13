import { describe, expect, it } from 'vitest';
import {
  DIRECT_TRANSFER_ASSESSMENT,
  MEMO_FORWARDED_ASSESSMENT,
  REQUIRED_DIMENSIONS,
  SELECTED_SETTLEMENT_PATH,
  isSettlementPathPermitted,
} from '../src/policy.js';

describe('direct ERC-20 transfer path', () => {
  it('constrains every required dimension', () => {
    expect([...DIRECT_TRANSFER_ASSESSMENT.constrainable].sort()).toEqual(
      [...REQUIRED_DIMENSIONS].sort(),
    );
    expect(DIRECT_TRANSFER_ASSESSMENT.unconstrainable).toEqual([]);
  });

  it('is permitted to carry settlement', () => {
    expect(isSettlementPathPermitted(DIRECT_TRANSFER_ASSESSMENT)).toBe(true);
  });
});

describe('Arc Memo forwarded path', () => {
  it('cannot constrain the forwarded recipient or amount', () => {
    // Privy decodes the arguments of the called function. On this path that is
    // the Memo function, so the inner transfer's recipient and amount are out
    // of reach of any documented condition.
    expect([...MEMO_FORWARDED_ASSESSMENT.unconstrainable].sort()).toEqual([
      'amount',
      'recipient',
    ]);
  });

  it('is recorded NOT_SUPPORTED', () => {
    // B01.3 allows SUPPORTED only with deny fixtures for every wrong dimension.
    // Two dimensions cannot be denied, so SUPPORTED would be a false claim.
    expect(MEMO_FORWARDED_ASSESSMENT.support).toBe('NOT_SUPPORTED');
  });

  it('is refused as a settlement path', () => {
    expect(isSettlementPathPermitted(MEMO_FORWARDED_ASSESSMENT)).toBe(false);
  });
});

describe('selected path', () => {
  it('is the direct transfer', () => {
    expect(SELECTED_SETTLEMENT_PATH).toBe(DIRECT_TRANSFER_ASSESSMENT);
  });

  it('leaves no dimension unconstrained', () => {
    // Guards the whole decision: if anyone later selects a path with a gap,
    // this fails rather than silently widening what a wallet may sign.
    expect(isSettlementPathPermitted(SELECTED_SETTLEMENT_PATH)).toBe(true);
  });
});
