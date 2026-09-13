import { describe, expect, it } from 'vitest';
import { ContractValidationError } from '@oneshot/contracts';
import { fingerprintIntent, userWalletJobFingerprint } from '../src/index.js';

const base = {
  business_intent_id: 'intent-golden-1',
  recipient: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
  amount_atomic: '1250000',
  asset: 'USDC',
  network: 'eip155:5042002',
  purpose: 'Cafe\u0301 invoice',
};

describe('fingerprintIntent', () => {
  it('matches the frozen golden vector', () => {
    const result = fingerprintIntent(base);
    expect(result.request.recipient).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    expect(result.request.purpose).toBe('Café invoice');
    expect(result.payload_fingerprint).toBe(
      'd846986fabcaf95b53dcd425108fe8fe0b8e59f58a21427b2a806ff5564ef4f9',
    );
  });

  it('is independent of input key order and normalizes Unicode and address case', () => {
    const reordered = {
      purpose: 'Café invoice',
      network: 'eip155:5042002',
      asset: 'USDC',
      amount_atomic: '1250000',
      recipient: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      business_intent_id: 'intent-golden-1',
    };
    expect(fingerprintIntent(reordered).payload_fingerprint).toBe(
      fingerprintIntent(base).payload_fingerprint,
    );
  });

  it.each(['-1', '+1', '1.0', '1e6', '01', ' 1', '1 ', '9'.repeat(79)])(
    'rejects non-canonical amount %s',
    (amount) => {
      expect(() => fingerprintIntent({ ...base, amount_atomic: amount })).toThrow(
        ContractValidationError,
      );
    },
  );
});

describe('userWalletJobFingerprint', () => {
  const job = {
    task_key: 'report-acme',
    tool_id: 'team-report-v1' as const,
    report_subject: 'Acme',
    recipient: '0x1111111111111111111111111111111111111111',
    amount_atomic: '10000',
  };

  it('binds the payer address into the task payload fingerprint', () => {
    expect(userWalletJobFingerprint(job, '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(
      userWalletJobFingerprint(job, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
    expect(userWalletJobFingerprint(job, '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).not.toBe(
      userWalletJobFingerprint(job, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    );
  });
});
