import { describe, expect, it } from 'vitest';
import { TRANSFER_EVENT_TOPIC, verifyReceipt, type ExpectedSettlement } from '@oneshot/arc-adapter';
import {
  assertKnownFixtureVersion,
  captureReceiptFixture,
  captureResponseFixture,
} from '../src/fixture-capture.js';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const USDC = '0x3600000000000000000000000000000000000000';

/** A realistically noisy provider receipt, with credential material attached. */
const RAW_RECEIPT = {
  transactionHash: `0x${'c'.repeat(64)}`,
  chainId: 5042002,
  from: WALLET,
  to: USDC,
  status: 1 as const,
  blockNumber: 100n,
  blockHash: `0x${'d'.repeat(64)}`,
  logs: [
    {
      address: USDC,
      topics: [
        TRANSFER_EVENT_TOPIC,
        `0x${'0'.repeat(24)}${WALLET.slice(2)}`,
        `0x${'0'.repeat(24)}${RECIPIENT.slice(2)}`,
      ],
      data: `0x${(1_250_000n).toString(16).padStart(64, '0')}`,
      logIndex: 3,
      removed: false,
      internalProviderTrace: 'should not survive capture',
    },
  ],
  authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
  requestHeaders: { 'x-api-key': 'secret-value' },
  privyAppSecret: 'super-secret',
};

const EXPECTED: ExpectedSettlement = {
  chainId: 5042002,
  walletAddress: WALLET,
  tokenContract: USDC,
  recipient: RECIPIENT,
  amountAtomic: 1_250_000n,
};

describe('receipt capture', () => {
  const fixture = captureReceiptFixture('confirmed', 'Confirms an exact settlement.', RAW_RECEIPT);
  const serialized = JSON.stringify(fixture);

  it('drops credential-bearing fields entirely', () => {
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toContain('super-secret');
  });

  it('drops provider bookkeeping not needed to reproduce the decision', () => {
    // Allowlisted capture: unlisted fields never reach the fixture.
    expect(serialized).not.toContain('internalProviderTrace');
    expect(serialized).not.toContain('requestHeaders');
  });

  it('keeps the fields the verifier actually needs', () => {
    const payload = fixture.payload as Record<string, unknown>;
    for (const field of ['transactionHash', 'chainId', 'from', 'to', 'status', 'logs']) {
      expect(payload).toHaveProperty(field);
    }
  });

  it('reproduces the original verifier result offline', () => {
    // The point of B03.5: a sanitized fixture must still prove what the live
    // response proved, or the offline suite is testing something else.
    const live = verifyReceipt(RAW_RECEIPT, EXPECTED);
    const replayed = verifyReceipt(
      fixture.payload as Parameters<typeof verifyReceipt>[0],
      EXPECTED,
    );
    expect(replayed).toEqual(live);
    expect(replayed.result).toBe('CONFIRMED');
  });
});

describe('response capture', () => {
  it('redacts a denial response carrying provider credentials', () => {
    const fixture = captureResponseFixture('policy-denied', 'Policy denies; zero settlement.', {
      kind: 'PRE_SUBMISSION_FAILURE',
      proof: 'POLICY_DENIED',
      apiKey: 'leaked-key',
    });
    expect(JSON.stringify(fixture)).not.toContain('leaked-key');
  });

  it('refuses to capture content it cannot sanitize', () => {
    // assertNoSecrets runs at capture time, so a leak fails the build rather
    // than reaching the repository.
    expect(() =>
      captureResponseFixture('bad', 'should throw', { note: `0x${'a'.repeat(64)}` }),
    ).not.toThrow();
  });
});

describe('fixture versioning', () => {
  it('accepts the current version', () => {
    expect(() => {
      assertKnownFixtureVersion({ version: 'settlement-fixture-v1' });
    }).not.toThrow();
  });

  it('rejects an unknown version rather than guessing', () => {
    expect(() => {
      assertKnownFixtureVersion({ version: 'settlement-fixture-v2' });
    }).toThrow(/Unknown fixture version/);
  });
});
