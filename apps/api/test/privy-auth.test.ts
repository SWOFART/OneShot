import { beforeAll, describe, expect, it } from 'vitest';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';

type GeneratedPrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import { createPrivyAccessTokenAuthenticator, looksLikeJwt } from '../src/privy-auth.js';

const APP_ID = 'test-app-id';
const OPERATOR = 'did:privy:operator-one';
const OUTSIDER = 'did:privy:operator-two';

let privateKey: GeneratedPrivateKey;
let verificationKey: string;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  verificationKey = await exportSPKI(pair.publicKey);
});

async function sign(
  options: {
    subject?: string;
    issuer?: string;
    audience?: string;
    expiresIn?: string;
  } = {},
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(options.subject ?? OPERATOR)
    .setIssuer(options.issuer ?? 'privy.io')
    .setAudience(options.audience ?? APP_ID)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(privateKey);
}

function authenticator(overrides: { onForbiddenSubject?: (subject: string) => void } = {}) {
  return createPrivyAccessTokenAuthenticator({
    appId: APP_ID,
    verificationKey,
    allowedSubjects: [OPERATOR],
    ...overrides,
  });
}

describe('Privy access token authenticator', () => {
  it('authorizes an allowlisted operator', async () => {
    const token = await sign();
    expect(await authenticator().authenticate(`Bearer ${token}`)).toBe('AUTHORIZED');
  });

  it('forbids a verified but unlisted subject', async () => {
    const seen: string[] = [];
    const token = await sign({ subject: OUTSIDER });
    const decision = await authenticator({
      onForbiddenSubject: (subject) => seen.push(subject),
    }).authenticate(`Bearer ${token}`);
    expect(decision).toBe('FORBIDDEN');
    expect(seen).toEqual([OUTSIDER]);
  });

  it('rejects a wrong audience', async () => {
    const token = await sign({ audience: 'someone-elses-app' });
    expect(await authenticator().authenticate(`Bearer ${token}`)).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong issuer', async () => {
    const token = await sign({ issuer: 'evil.example' });
    expect(await authenticator().authenticate(`Bearer ${token}`)).toBe('UNAUTHORIZED');
  });

  it('rejects an expired token', async () => {
    const token = await sign({ expiresIn: '-10m' });
    expect(await authenticator().authenticate(`Bearer ${token}`)).toBe('UNAUTHORIZED');
  });

  it('rejects a tampered signature', async () => {
    const token = await sign();
    const parts = token.split('.');
    const flipped = parts[2]?.startsWith('A') ? `B${parts[2].slice(1)}` : `A${parts[2]?.slice(1)}`;
    expect(await authenticator().authenticate(`Bearer ${parts[0]}.${parts[1]}.${flipped}`)).toBe(
      'UNAUTHORIZED',
    );
  });

  it('rejects an unsigned token that claims alg none', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: OPERATOR, iss: 'privy.io', aud: APP_ID, exp: 4_102_444_800 }),
    ).toString('base64url');
    expect(await authenticator().authenticate(`Bearer ${header}.${payload}.`)).toBe('UNAUTHORIZED');
  });

  it('rejects a missing or malformed authorization header', async () => {
    expect(await authenticator().authenticate(undefined)).toBe('UNAUTHORIZED');
    expect(await authenticator().authenticate('Bearer not-a-jwt')).toBe('UNAUTHORIZED');
    expect(await authenticator().authenticate('Basic abc.def.ghi')).toBe('UNAUTHORIZED');
  });

  it('authorizes any verified subject when configured with wildcard allow-all', async () => {
    const auth = createPrivyAccessTokenAuthenticator({
      appId: APP_ID,
      verificationKey,
      allowedSubjects: ['*'],
    });
    const token = await sign({ subject: OUTSIDER });
    expect(await auth.authenticate(`Bearer ${token}`)).toBe('AUTHORIZED');
  });

  it('refuses to construct without an allowlist', () => {
    expect(() =>
      createPrivyAccessTokenAuthenticator({ appId: APP_ID, verificationKey, allowedSubjects: [] }),
    ).toThrow('allowlist');
  });

  it('recognizes JWT shape', () => {
    expect(looksLikeJwt('aaa.bbb.ccc')).toBe(true);
    expect(looksLikeJwt('opaque-service-token')).toBe(false);
    expect(looksLikeJwt('aaa.bbb')).toBe(false);
    expect(looksLikeJwt('aaa..ccc')).toBe(false);
  });
});
