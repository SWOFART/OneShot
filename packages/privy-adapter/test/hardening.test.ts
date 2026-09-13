import { describe, expect, it } from 'vitest';
import {
  DriftError,
  WEBHOOKS_ENABLED,
  assertNoDrift,
  baselineDigest,
  detectDrift,
  type DriftField,
  type SettlementBaseline,
} from '../src/hardening.js';

const BASELINE: SettlementBaseline = {
  policyDigest: '0x' + 'a'.repeat(64),
  policyId: 'policy_1234567890',
  walletId: 'wallet_1234567890',
  walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  chainId: 5042002,
  tokenContract: '0x3600000000000000000000000000000000000000',
  settlementCapAtomic: 1_000_000n,
};

describe('no drift', () => {
  it('accepts an identical observation', () => {
    expect(detectDrift(BASELINE, { ...BASELINE })).toEqual({ safe: true, findings: [] });
  });

  it('ignores casing differences in identifiers', () => {
    const observed = {
      ...BASELINE,
      walletAddress: BASELINE.walletAddress.toUpperCase().replace('0X', '0x'),
      tokenContract: BASELINE.tokenContract.toUpperCase().replace('0X', '0x'),
    };
    expect(detectDrift(BASELINE, observed).safe).toBe(true);
  });
});

describe('every field fails closed on change', () => {
  it.each<[DriftField, Partial<SettlementBaseline>]>([
    ['policyDigest', { policyDigest: '0x' + 'b'.repeat(64) }],
    ['policyId', { policyId: 'policy_other' }],
    ['walletId', { walletId: 'wallet_other' }],
    ['walletAddress', { walletAddress: '0x' + '2'.repeat(40) }],
    ['chainId', { chainId: 1 }],
    ['tokenContract', { tokenContract: '0x' + '4'.repeat(40) }],
    ['settlementCapAtomic', { settlementCapAtomic: 2_000_000n }],
  ])('detects drift in %s', (field, override) => {
    const report = detectDrift(BASELINE, { ...BASELINE, ...override });
    expect(report.safe).toBe(false);
    expect(report.findings.map((finding) => finding.field)).toContain(field);
  });

  it('treats a lowered cap as drift too', () => {
    // Not dangerous, but the deployment no longer matches what was reviewed.
    // Judging benignity is not this module's job.
    const report = detectDrift(BASELINE, { ...BASELINE, settlementCapAtomic: 1n });
    expect(report.safe).toBe(false);
  });

  it('reports every difference at once', () => {
    const report = detectDrift(BASELINE, {
      ...BASELINE,
      chainId: 1,
      policyId: 'policy_other',
      settlementCapAtomic: 9n,
    });
    expect(report.findings).toHaveLength(3);
  });
});

describe('assertNoDrift', () => {
  it('passes silently when nothing changed', () => {
    expect(() => {
      assertNoDrift(BASELINE, { ...BASELINE });
    }).not.toThrow();
  });

  it('throws rather than returning a value a caller could ignore', () => {
    expect(() => {
      assertNoDrift(BASELINE, { ...BASELINE, chainId: 1 });
    }).toThrow(DriftError);
  });

  it('names the drifted fields without printing credentials', () => {
    try {
      assertNoDrift(BASELINE, { ...BASELINE, policyId: 'policy_other' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as DriftError).message).toContain('policyId');
      expect((error as DriftError).message).not.toContain('policy_other');
    }
  });
});

describe('baseline digest', () => {
  it('is stable for identical baselines', () => {
    expect(baselineDigest(BASELINE)).toBe(baselineDigest({ ...BASELINE }));
  });

  it('changes when any field changes', () => {
    expect(baselineDigest({ ...BASELINE, chainId: 1 })).not.toBe(baselineDigest(BASELINE));
  });
});

describe('webhook posture', () => {
  it('keeps webhooks disabled', () => {
    // A webhook is an unauthenticated inbound claim about a payment. Signature
    // verification is unproven and polling is already complete, so enabling
    // one would add attack surface without adding capability.
    expect(WEBHOOKS_ENABLED).toBe(false);
  });
});
