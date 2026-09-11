import { describe, expect, it } from 'vitest';
import {
  PROVIDER_IDEMPOTENCY_WINDOW_HOURS,
  RequestError,
  assertIdempotencyKeyBinding,
  buildCanonicalRequest,
  canonicalizeIntent,
  type SettlementIntent,
} from '../src/request.js';

const INTENT: SettlementIntent = {
  businessIntentId: '018f-example-stable-id',
  chainId: 5042002,
  tokenContract: '0x3600000000000000000000000000000000000000',
  recipient: '0x1111111111111111111111111111111111111111',
  amountAtomic: 1_250_000n,
};

describe('determinism', () => {
  it('produces byte-identical output for the same intent', () => {
    const a = buildCanonicalRequest(INTENT);
    const b = buildCanonicalRequest({ ...INTENT });
    expect(a).toEqual(b);
  });

  it('is a golden vector, stable across builds', () => {
    // Pinning the exact bytes. If a refactor changes any of these, every
    // in-flight idempotency key changes with it, so this must fail loudly.
    const request = buildCanonicalRequest(INTENT);
    expect(request.canonicalBody).toBe(
      '[["businessIntentId","018f-example-stable-id"],["chainId",5042002],' +
        '["tokenContract","0x3600000000000000000000000000000000000000"],' +
        '["recipient","0x1111111111111111111111111111111111111111"],' +
        '["amountAtomic","1250000"]]',
    );
    expect(request.data).toBe(
      '0xa9059cbb' +
        '0000000000000000000000001111111111111111111111111111111111111111' +
        '00000000000000000000000000000000000000000000000000000000001312d0',
    );
    expect(request.value).toBe(0n);
    expect(request.referenceId).toBe('oneshot-018f-example-stable-id');
  });

  it('does not depend on the order fields were written', () => {
    // Guards against JSON.stringify key-order dependence: two workers building
    // the same obligation must fingerprint identically.
    const reordered: SettlementIntent = {
      amountAtomic: INTENT.amountAtomic,
      recipient: INTENT.recipient,
      tokenContract: INTENT.tokenContract,
      chainId: INTENT.chainId,
      businessIntentId: INTENT.businessIntentId,
    };
    expect(canonicalizeIntent(reordered)).toBe(canonicalizeIntent(INTENT));
  });

  it('fingerprints checksummed and lowercase addresses identically', () => {
    const checksummed: SettlementIntent = {
      ...INTENT,
      recipient: INTENT.recipient.toUpperCase().replace('0X', '0x') as `0x${string}`,
    };
    expect(buildCanonicalRequest(checksummed).payloadFingerprint).toBe(
      buildCanonicalRequest(INTENT).payloadFingerprint,
    );
  });

  it('keeps long Privy reference IDs within the provider limit', () => {
    const longIntent = { ...INTENT, businessIntentId: `intent_${'a'.repeat(64)}` };
    const request = buildCanonicalRequest(longIntent);

    expect(request.referenceId).toHaveLength(64);
    expect(request.referenceId).toMatch(/^oneshot-[0-9a-f]{56}$/u);
    expect(request.referenceId).toBe(buildCanonicalRequest(longIntent).referenceId);
  });
});

describe('fingerprint sensitivity', () => {
  it.each<[string, Partial<SettlementIntent>]>([
    ['a different recipient', { recipient: '0x2222222222222222222222222222222222222222' }],
    ['a different amount', { amountAtomic: 1_250_001n }],
    ['a different chain', { chainId: 1 }],
    ['a different token', { tokenContract: '0x4600000000000000000000000000000000000000' }],
    ['a different intent id', { businessIntentId: 'other-id' }],
  ])('changes the fingerprint for %s', (_label, override) => {
    expect(buildCanonicalRequest({ ...INTENT, ...override }).payloadFingerprint).not.toBe(
      buildCanonicalRequest(INTENT).payloadFingerprint,
    );
  });

  it('derives the idempotency key from the fingerprint', () => {
    const request = buildCanonicalRequest(INTENT);
    expect(request.idempotencyKey).toBe(request.payloadFingerprint);
  });
});

describe('validation', () => {
  it.each<[string, Partial<SettlementIntent>, string]>([
    ['an empty intent id', { businessIntentId: '' }, 'EMPTY_INTENT_ID'],
    ['a whitespace intent id', { businessIntentId: '   ' }, 'EMPTY_INTENT_ID'],
    ['an overlong intent id', { businessIntentId: 'x'.repeat(129) }, 'INTENT_ID_TOO_LONG'],
    ['a zero amount', { amountAtomic: 0n }, 'AMOUNT_NOT_POSITIVE'],
    ['a negative amount', { amountAtomic: -1n }, 'AMOUNT_NOT_POSITIVE'],
  ])('rejects %s', (_label, override, code) => {
    expect(() => buildCanonicalRequest({ ...INTENT, ...override })).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it('rejects an amount above uint256', () => {
    expect(() => buildCanonicalRequest({ ...INTENT, amountAtomic: 1n << 256n })).toThrow(
      RequestError,
    );
  });

  it('accepts an amount beyond float safety exactly', () => {
    const large = { ...INTENT, amountAtomic: 9_007_199_254_740_993n };
    expect(buildCanonicalRequest(large).canonicalBody).toContain('9007199254740993');
  });
});

describe('idempotency key binding', () => {
  it('accepts a replay of the identical request', () => {
    const request = buildCanonicalRequest(INTENT);
    expect(() => {
      assertIdempotencyKeyBinding(request, {
        idempotencyKey: request.idempotencyKey,
        payloadFingerprint: request.payloadFingerprint,
      });
    }).not.toThrow();
  });

  it('refuses the same key carrying a different payload', () => {
    // The INTENT_PAYLOAD_CONFLICT rule at the adapter boundary: reusing a key
    // with a changed body is how a second, different payment gets authorized
    // under the identity of the first.
    const request = buildCanonicalRequest(INTENT);
    expect(() => {
      assertIdempotencyKeyBinding(request, {
        idempotencyKey: request.idempotencyKey,
        payloadFingerprint: '0xdifferentfingerprint',
      });
    }).toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }));
  });

  it('ignores an unrelated key', () => {
    const request = buildCanonicalRequest(INTENT);
    expect(() => {
      assertIdempotencyKeyBinding(request, {
        idempotencyKey: '0xsomeotherkey',
        payloadFingerprint: '0xdifferentfingerprint',
      });
    }).not.toThrow();
  });
});

describe('provider window', () => {
  it('documents the window as supplemental only', () => {
    // OneShot durable state is the authority for at-most-once settlement and
    // remains so past this window. The provider key is defence in depth.
    expect(PROVIDER_IDEMPOTENCY_WINDOW_HOURS).toBe(24);
  });
});
