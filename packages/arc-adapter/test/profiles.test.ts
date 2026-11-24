import { ARC_MAINNET_CHAIN, ARC_TESTNET_CHAIN } from '@oneshot/contracts';
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
    expect(ARC_TESTNET.chainId).toBe(ARC_TESTNET_CHAIN.chainId);
    expect(ARC_TESTNET.caip2).toBe(ARC_TESTNET_CHAIN.caip2);
    expect(ARC_TESTNET.tokenContract).toBe(ARC_TESTNET_CHAIN.settlementAsset.contract);
    expect(ARC_MAINNET.id).toBe(ARC_MAINNET_CHAIN.id);
    expect(ARC_MAINNET.enabled).toBe(ARC_MAINNET_CHAIN.enabled);
  });

  it('enables the published testnet and the published mainnet', () => {
    const enabled = ARC_PROFILES.filter((profile) => profile.enabled);
    expect(enabled).toEqual([ARC_TESTNET, ARC_MAINNET]);
  });

  it('is not a mainnet profile', () => {
    expect(ARC_TESTNET.isMainnet).toBe(false);
  });

  it('separates native gas precision from settlement precision', () => {
    // Verified 2026-09-07 against docs.arc.io: Arc's native gas asset and its
    // USDC ERC-20 interface are both named USDC but are 10^12 apart. Settlement
    // uses the ERC-20 six decimals; gas accounting uses the native eighteen.
    expect(ARC_TESTNET.tokenDecimals).toBe(6);
    expect(ARC_TESTNET.nativeDecimals).toBe(18);
    expect(ARC_TESTNET.nativeDecimals).not.toBe(ARC_TESTNET.tokenDecimals);
  });
});

describe('Arc mainnet profile', () => {
  it('pins the values published by Arc and Circle', () => {
    expect(ARC_MAINNET.enabled).toBe(true);
    expect(ARC_MAINNET.isMainnet).toBe(true);
    expect(isPinned(ARC_MAINNET)).toBe(true);
    expect(ARC_MAINNET.chainId).toBe(5042);
    expect(ARC_MAINNET.caip2).toBe('eip155:5042');
    expect(ARC_MAINNET.tokenContract).toBe('0x3600000000000000000000000000000000000000');
    expect(ARC_MAINNET.tokenDecimals).toBe(6);
    expect(ARC_MAINNET.nativeDecimals).toBe(18);
    expect(ARC_MAINNET.chainId).toBe(ARC_MAINNET_CHAIN.chainId);
    expect(ARC_MAINNET.caip2).toBe(ARC_MAINNET_CHAIN.caip2);
    expect(ARC_MAINNET.tokenContract).toBe(ARC_MAINNET_CHAIN.settlementAsset.contract);
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
