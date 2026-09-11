import { describe, expect, it } from 'vitest';
import {
  asAtomicAmount,
  asBlockNumber,
  asBusinessIntentId,
  asEvmAddress,
  atomicAmountFromBigInt,
  atomicAmountToBigInt,
  canonicalJobPayload,
  parseCreateJobRequest,
  parseAuthorizationResult,
  parseEvidenceResultKind,
  parseIndexHealth,
  parseRecoveryAction,
  parseSettlementResult,
} from '../src/index.js';

describe('canonical contract values', () => {
  it('round-trips JSON-safe atomic money', () => {
    const amount = asAtomicAmount('1250000');
    expect(atomicAmountToBigInt(amount)).toBe(1_250_000n);
    expect(atomicAmountFromBigInt(1_250_000n)).toBe('1250000');
  });

  it.each(['1.0', '01', '-1', '+1', '1e6', ' 1', 1, Number.NaN])(
    'rejects non-canonical money %p',
    (value) => {
      expect(() => asAtomicAmount(value)).toThrow();
    },
  );

  it('normalizes public identities without accepting malformed values', () => {
    expect(asBusinessIntentId('intent-1')).toBe('intent-1');
    expect(asBlockNumber('0')).toBe('0');
    expect(asEvmAddress('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(() => asBusinessIntentId(' intent-1')).toThrow();
    expect(() => asEvmAddress('0x1234')).toThrow();
  });
});

describe('resumable job request contract', () => {
  const request = {
    task_key: 'report-acme',
    tool_id: 'team-report-v1' as const,
    report_subject: 'Acme',
    recipient: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    amount_atomic: '10000',
  };

  it('normalizes and fingerprints the requested payment fields', () => {
    expect(parseCreateJobRequest(request)).toMatchObject({
      recipient: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      amount_atomic: '10000',
    });
    expect(canonicalJobPayload(request)).toContain(
      '"recipient":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
    );
    expect(canonicalJobPayload({ ...request, amount_atomic: '10001' })).not.toBe(
      canonicalJobPayload(request),
    );
  });

  it.each([
    { ...request, amount_atomic: '0' },
    { ...request, recipient: 'not-an-address' },
  ])('rejects an unsafe requested payment %j', (value) => {
    expect(() => parseCreateJobRequest(value)).toThrow();
  });
});

describe('fail-closed port result parsing', () => {
  it('accepts every frozen result family', () => {
    expect(parseAuthorizationResult({ kind: 'AUTHORIZED' })).toEqual({ kind: 'AUTHORIZED' });
    expect(parseAuthorizationResult({ kind: 'DENIED', reason: 'policy' }).kind).toBe('DENIED');
    expect(parseEvidenceResultKind('NOT_FOUND')).toBe('NOT_FOUND');
    expect(parseIndexHealth('LAGGING')).toBe('LAGGING');
    expect(parseRecoveryAction('WAIT')).toBe('WAIT');
    expect(
      parseSettlementResult({
        kind: 'CONFIRMED',
        provider_reference_id: 'provider-ref-001',
        transaction_hash: `0x${'a'.repeat(64)}`,
        block_number: '100',
        transfer_log_index: 0,
      }).kind,
    ).toBe('CONFIRMED');
  });

  it.each([
    () => parseAuthorizationResult({ kind: 'ALLOW' }),
    () => parseSettlementResult({ kind: 'RETRY' }),
    () => parseEvidenceResultKind('ABSENT_MEANS_RETRY'),
    () => parseIndexHealth('HEALTHY_ENOUGH'),
    () => parseRecoveryAction('SUBMIT'),
    () => parseAuthorizationResult({ kind: 'AUTHORIZED', extra: true }),
  ])('rejects unknown or expanded input', (parse) => {
    expect(parse).toThrow();
  });
});
