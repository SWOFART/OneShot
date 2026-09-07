import { describe, expect, it } from 'vitest';
import { REDACTED, assertNoSecrets, redact } from '../src/redaction.js';

describe('redact', () => {
  it('redacts values under forbidden key names', () => {
    const out = redact({
      walletId: 'wallet_1234567890',
      appSecret: 'super-secret-value',
      authorization: 'Bearer abc',
    }) as Record<string, unknown>;

    expect(out.walletId).toBe('wallet_1234567890');
    expect(out.appSecret).toBe(REDACTED);
    expect(out.authorization).toBe(REDACTED);
  });

  it('matches forbidden key names case-insensitively', () => {
    const out = redact({
      PRIVY_APP_SECRET: 'x',
      privyAppSecret: 'x',
      'x-api-key': 'x',
    }) as Record<string, unknown>;

    expect(Object.values(out)).toEqual([REDACTED, REDACTED, REDACTED]);
  });

  it('redacts secret-shaped values arriving under an innocent key', () => {
    // The dangerous case: a credential under a name nobody thought to forbid.
    const out = redact({
      note: '-----BEGIN PRIVATE KEY-----abc',
      hint: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
      value: '0x' + 'a'.repeat(64),
    }) as Record<string, unknown>;

    expect(out.note).toBe(REDACTED);
    expect(out.hint).toBe(REDACTED);
    expect(out.value).toBe(REDACTED);
  });

  it('keeps a 20-byte address, which is not key material', () => {
    const out = redact({ recipient: '0x' + '1'.repeat(40) }) as Record<string, unknown>;
    expect(out.recipient).toBe('0x' + '1'.repeat(40));
  });

  it('recurses through nested structures', () => {
    const out = redact({
      attempt: { provider: { apiKey: 'k', chainId: 5042002 } },
      list: [{ token: 't' }],
    });

    expect(out).toEqual({
      attempt: { provider: { apiKey: REDACTED, chainId: 5042002 } },
      list: [{ token: REDACTED }],
    });
  });

  it('serializes bigint rather than throwing on it', () => {
    // JSON.stringify throws on bigint, and money is bigint here, so the
    // logging path must handle it or logging becomes a crash source.
    const out = redact({ amount: 1250000n }) as Record<string, unknown>;
    expect(out.amount).toBe('1250000');
  });

  it('bounds recursion depth so a hostile payload cannot exhaust the stack', () => {
    let deep: Record<string, unknown> = { end: 'value' };
    for (let i = 0; i < 200; i += 1) deep = { nested: deep };
    expect(() => redact(deep)).not.toThrow();
  });

  it('drops functions rather than emitting them', () => {
    const out = redact({ fn: () => 'x' }) as Record<string, unknown>;
    expect(out.fn).toBe(REDACTED);
  });
});

describe('assertNoSecrets', () => {
  it('accepts a sanitized fixture', () => {
    expect(() => {
      assertNoSecrets({
        chainId: 5042002,
        recipient: '0x' + '1'.repeat(40),
        appSecret: REDACTED,
      });
    }).not.toThrow();
  });

  it('rejects a fixture whose forbidden key was left unredacted', () => {
    expect(() => {
      assertNoSecrets({ appSecret: 'leaked' });
    }).toThrow(/not redacted/);
  });

  it('rejects a fixture containing secret-shaped content', () => {
    expect(() => {
      assertNoSecrets({ note: '0x' + 'a'.repeat(64) });
    }).toThrow(/Secret-shaped/);
  });

  it('names the path so a failure is actionable', () => {
    expect(() => {
      assertNoSecrets({ outer: { inner: [{ token: 'x' }] } });
    }).toThrow(/outer\.inner\[0\]/);
  });

  it('is satisfied by anything redact produced', () => {
    const hostile = {
      appSecret: 'leaked',
      nested: { privateKey: '0x' + 'b'.repeat(64) },
      note: 'Bearer abcdefghijklmnop',
    };
    expect(() => {
      assertNoSecrets(redact(hostile));
    }).not.toThrow();
  });
});
