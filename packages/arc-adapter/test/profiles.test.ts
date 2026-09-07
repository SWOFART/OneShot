import { describe, expect, it } from 'vitest';
import {
  ARC_MAINNET,
  ARC_PROFILES,
  ARC_TESTNET,
  getProfile,
  isPinned,
} from '../src/profiles.js';

describe('Arc testnet profile', () => {
  it('pins the constants frozen in milestones/CONTRACTS.md', () => {
    expect(ARC_TESTNET.chainId).toBe(5042002);
    expect(ARC_TESTNET.caip2).toBe('eip155:5042002');
    expect(ARC_TESTNET.tokenContract).toBe('0x3600000000000000000000000000000000000000');
    expect(ARC_TESTNET.tokenSymbol).toBe('USDC');
    expect(ARC_TESTNET.tokenDecimals).toBe(6);
  });

  it('is the only enabled profile', () => {
    const enabled = ARC_PROFILES.filter((profile) => profile.enabled);
    expect(enabled).toEqual([ARC_TESTNET]);
  });

  it('is not a mainnet profile', () => {
    expect(ARC_TESTNET.isMainnet).toBe(false);
  });
});

describe('Arc mainnet profile', () => {
  it('is disabled', () => {
    expect(ARC_MAINNET.enabled).toBe(false);
  });

  it('carries no network values at all', () => {
    // develop@d6758dd removed a previously asserted mainnet chain ID and launch
    // date as unverified guesses. This test is what keeps them from returning:
    // a plausible-looking default is more dangerous than an absent one.
    const keys = Object.keys(ARC_MAINNET);
    expect(keys).not.toContain('chainId');
    expect(keys).not.toContain('caip2');
    expect(keys).not.toContain('rpcUrl');
    expect(keys).not.toContain('explorerUrl');
    expect(keys).not.toContain('tokenContract');
  });

  it('explains why it is empty', () => {
    expect(ARC_MAINNET.verification).toBe('UNPUBLISHED');
    expect(ARC_MAINNET.reason).toMatch(/has not published/i);
  });

  it('does not narrow to a pinned profile', () => {
    expect(isPinned(ARC_MAINNET)).toBe(false);
  });
});

describe('no profile carries a guessed endpoint', () => {
  it('declares no RPC or explorer host anywhere in the profile table', () => {
    // Endpoints are operator configuration, not protocol constants. Encoding a
    // hostname here would be a guess with a payment attached.
    const serialized = JSON.stringify(ARC_PROFILES);
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe('getProfile', () => {
  it('resolves known profiles', () => {
    expect(getProfile('arc-testnet')).toBe(ARC_TESTNET);
    expect(getProfile('arc-mainnet')).toBe(ARC_MAINNET);
  });

  it('returns undefined rather than defaulting for an unknown id', () => {
    // Defaulting an unknown network name to testnet would be how a payment
    // silently lands on a chain nobody chose.
    expect(getProfile('arc-mainnnet')).toBeUndefined();
    expect(getProfile('')).toBeUndefined();
  });
});
